// The sun's shadows round the eye, shared by everything drawn in the scene's pass: two maps of the depth along the sun
// (a near square ahead of the camera, sharp enough for a bench, and a far one over the city it looks out on), drawn
// first by what casts (a city's solids, models and masses, nature's trees, the figures) and read by what receives (the
// land, the city, the plants, the figures). Every drawer measures its points from the eye, so one matrix a cascade,
// from the eye into its map, serves them all. The near map is drawn every frame; the far one is kept, and drawn again
// only when what it would hold changes (shadowCache.ts).
import { boxSeen, viewPlanes } from './city/tiers.ts';
import { BUFFER_USAGE, type Gpu, SHADER_STAGE, TEXTURE_USAGE } from './gpu.ts';
import { CastRecording, type FarHeld, farRedrawn } from './shadowCache.ts';

/** Each map's texels a side. */
export const SHADOW_SIZE = 2048;
/** Over the ground higher than this the eye sees no shadow worth a pass: at sea, over an island's side. */
export const SHADOW_HIGHEST_M = 400;
/** The clear afternoon's sun, which the shadows are cast along until a sky sets the key light. */
const AFTERNOON_SUN: Vector = [-0.5417, 0.5417, 0.6428];

/** The key light's way the shadows are cast along, as `key_toward` in sky/skyUniform.ts holds it: just above the
 *  horizon at the lowest, so a low sun's shadows stay finite and agree with the shading. */
export function heldToward(key: Vector): Vector {
  return normalised([key[0], key[1], Math.max(key[2], 0.08)]);
}
const MATRIX_FLOATS = 16;
/** The receivers' uniforms: both cascades' matrices, then a map's texel and whether shadows are on. */
const RECEIVER_FLOATS = 2 * MATRIX_FLOATS + 4;

/** A cascade: half the side of the square it covers, how far ahead of the eye its middle stands, and how far along
 *  the sun it reaches either side of that middle, metres. */
export interface Cascade {
  readonly reachM: number;
  readonly aheadM: number;
  readonly depthM: number;
}

/** The near square: 0.15 m a texel, sharp enough for a column or a bench, out to some 225 m ahead; a landmark's tower
 *  casts into it from its top. */
export const NEAR: Cascade = { reachM: 150, aheadM: 75, depthM: 1500 };
/** The far square: 1.2 m a texel, from 300 m behind the eye to 2.1 km ahead, so a city seen from over its roofs is
 *  shadowed as far as its masses are drawn whole enough to throw one. It holds the near square. */
export const FAR: Cascade = { reachM: 1200, aheadM: 900, depthM: 3000 };
/** The cascades in the order they are drawn, and their layers in the maps' texture. */
export const CASCADES: readonly Cascade[] = [NEAR, FAR];

/** A cascade's texel, metres. */
const texelOf = (cascade: Cascade): number => (2 * cascade.reachM) / SHADOW_SIZE;
/** How far the far square's middle may fall behind where the eye would set it before it is set again: 32 of its
 *  texels, 37.5 m, so only its rim, where its shadows have faded out, moves that far. */
export const FAR_HOLD_M = 32 * texelOf(FAR);
/** How far the key light may turn from the way the far map was cast along before it is cast again, radians: a texel
 *  at its square's corner. */
export const FAR_TURN = 2 / SHADOW_SIZE / Math.SQRT2;
/** A caster whose half-diagonal is shorter than this many of a cascade's texels casts nothing into it, its shadow
 *  a texel or two: under 0.3 m in the near map, under 2.3 m in the far. */
export const CASTER_LEAST_TEXELS = 2;

type Vector = readonly [number, number, number];
const dot = (a: Vector, b: Vector) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const normalised = (a: Vector): Vector => {
  const length = Math.hypot(...a);
  return [a[0] / length, a[1] / length, a[2] / length];
};

/** The maps' axes for the key light's way `toward`: across them (right and up on a map) and along the light, away
 *  from it. */
export function sunAxes(toward: Vector = heldToward(AFTERNOON_SUN)): { right: Vector; up: Vector; along: Vector } {
  const along = normalised([-toward[0], -toward[1], -toward[2]]);
  const right = normalised([along[1], -along[0], 0]);
  const up: Vector = [
    right[1] * along[2] - right[2] * along[1],
    right[2] * along[0] - right[0] * along[2],
    right[0] * along[1] - right[1] * along[0],
  ];
  return { right, up, along };
}

/** A cascade's square's middle from an eye looking along `yaw` (east, south), metres. */
export function aheadOf(cascade: Cascade, yaw: number): readonly [number, number] {
  return [Math.sin(yaw) * cascade.aheadM, -Math.cos(yaw) * cascade.aheadM];
}

/** Where a cascade's map is drawn from: the key light's way it is cast along, and its square's middle in world metres,
 *  on the map's texels across the light, so the shadows' edges hold still as the eye moves. */
export interface CascadeView {
  readonly toward: Vector;
  readonly middle: Vector;
}

/** A cascade's view from an eye at `eye` (world metres) looking along `yaw`, cast along `toward` (`heldToward`): its
 *  square's middle ahead of the eye at the eye's height, moved onto the nearest texel across the light. */
export function viewOf(cascade: Cascade, eye: Vector, yaw: number, toward: Vector): CascadeView {
  const texel = texelOf(cascade);
  const ahead = aheadOf(cascade, yaw);
  let middle: Vector = [eye[0] + ahead[0], eye[1] + ahead[1], eye[2]];
  const { right, up } = sunAxes(toward);
  for (const axis of [right, up]) {
    const across = dot(middle, axis);
    const shift = Math.round(across / texel) * texel - across;
    middle = [middle[0] + axis[0] * shift, middle[1] + axis[1] * shift, middle[2] + axis[2] * shift];
  }
  return { toward, middle };
}

/** The far map's view this frame: the one it is `held` at while the view `wanted` stays within FAR_HOLD_M and
 *  FAR_TURN of it, so a map drawn from it may be kept; else the one wanted. */
export function heldView(held: CascadeView | null, wanted: CascadeView): CascadeView {
  if (!held) return wanted;
  const [middle, toward] = [held.middle, held.toward];
  const moved = Math.hypot(wanted.middle[0] - middle[0], wanted.middle[1] - middle[1], wanted.middle[2] - middle[2]);
  const turned = Math.hypot(wanted.toward[0] - toward[0], wanted.toward[1] - toward[1], wanted.toward[2] - toward[2]);
  return moved <= FAR_HOLD_M && turned <= FAR_TURN ? held : wanted;
}

/** The matrix (column-major) that takes a point measured from the eye into a cascade's clip space, for an eye standing
 *  at `eye` (world metres) and the cascade drawn from `view`. */
export function shadowMatrix(eye: Vector, view: CascadeView, cascade: Cascade = NEAR): Float32Array {
  const { right, up, along } = sunAxes(view.toward);
  const { reachM, depthM } = cascade;
  const middle: Vector = [view.middle[0] - eye[0], view.middle[1] - eye[1], view.middle[2] - eye[2]];
  // Each row: a point from the eye dotted with the axis, less the middle's place on it.
  const rows = [
    [...right.map((value) => value / reachM), -dot(middle, right) / reachM],
    [...up.map((value) => value / reachM), -dot(middle, up) / reachM],
    [...along.map((value) => value / (2 * depthM)), 0.5 - dot(middle, along) / (2 * depthM)],
    [0, 0, 0, 1],
  ];
  const matrix = new Float32Array(MATRIX_FLOATS);
  for (let row = 0; row < 4; row++)
    for (let column = 0; column < 4; column++) matrix[column * 4 + row] = rows[row]?.[column] ?? 0;
  return matrix;
}

/** How far past its square a cascade takes casters, in its texels: the taps' reach. */
const CAST_MARGIN_TEXELS = 4;

/** The four planes round a cascade's square, for points measured from the eye, read from its `matrix` and moved out
 *  by CAST_MARGIN_TEXELS: what stands between them, however far along the sun, may cast into it. */
export function castPlanes(matrix: Float32Array): number[][] {
  const margin = (2 * CAST_MARGIN_TEXELS) / SHADOW_SIZE;
  // Its matrix is square to the light, so a point's w is 1: the fifth plane, in front of the eye, holds everything.
  return viewPlanes(matrix)
    .slice(0, 4)
    .map((plane) => [plane[0], plane[1], plane[2], plane[3] + margin]);
}

/** The least half-diagonal that casts into a cascade, metres, squared. */
const leastSquared = (cascade: Cascade): number => (CASTER_LEAST_TEXELS * texelOf(cascade)) ** 2;

/** Whether a box measured from the eye (west, north, low, then east, south, high) may cast into a cascade whose square
 *  `planes` bound: whether, seen along the sun, it overlaps the square, and is large enough to show in its map. */
export function boxCasts(planes: readonly number[][], cascade: Cascade, low: Vector, high: Vector): boolean {
  const [across, down, tall] = [high[0] - low[0], high[1] - low[1], high[2] - low[2]];
  return (across * across + down * down + tall * tall) / 4 >= leastSquared(cascade) && boxSeen(planes, low, high);
}

/** Whether a ball measured from the eye, `centre` and `radiusM`, may cast into a cascade whose square `planes` bound,
 *  as `boxCasts` asks of a box. */
export function sphereCasts(planes: readonly number[][], cascade: Cascade, centre: Vector, radiusM: number): boolean {
  if (radiusM * radiusM < leastSquared(cascade)) return false;
  for (const plane of planes) {
    const [east, south, rise, offset] = plane;
    const inside = east * centre[0] + south * centre[1] + rise * centre[2] + offset;
    if (inside < -radiusM * Math.hypot(east, south, rise)) return false;
  }
  return true;
}

/** What a caster's shadow pass reads at group 1: the matrix of the cascade being drawn. */
export const SHADOW_CAST_WGSL = /* wgsl */ `
struct ShadowCast {
  from_eye: mat4x4f,
};
@group(1) @binding(0) var<uniform> shadow: ShadowCast;
`;

/** What a receiver reads, at group 1, and how much of the sun reaches a point. */
export const SHADOW_WGSL = /* wgsl */ `
struct Shadow {
  near: mat4x4f,
  far: mat4x4f,
  // A map's texel in its uvs, and whether shadows are on (1) or off (0).
  map: vec4f,
};
@group(1) @binding(0) var<uniform> shadow: Shadow;
@group(1) @binding(1) var shadow_map: texture_depth_2d_array;
@group(1) @binding(2) var shadow_sampler: sampler_comparison;

// The taps round a point, in texels: near, a soft edge some 0.4 m wide, no harder than the sun's own penumbra at a
// few metres; far, some 3 m, which at a kilometre is a pixel or two.
const SHADOW_TAPS = array<vec2f, 8>(
  vec2f(-1.6, -0.6), vec2f(0.6, -1.6), vec2f(1.6, 0.6), vec2f(-0.6, 1.6),
  vec2f(-0.7, -0.2), vec2f(0.2, -0.7), vec2f(0.7, 0.2), vec2f(-0.2, 0.7),
);

// One cascade's light at a point already lifted off its surface: x the share of the sun that reaches it, y how near
// the square's rim it lies (1 at the rim and past it, where the cascade knows nothing).
fn cascade_light(from_eye: mat4x4f, layer: i32, texel: f32, bias: f32, lifted: vec3f) -> vec2f {
  let light = from_eye * vec4f(lifted, 1.0);
  let edge = max(abs(light.x), abs(light.y));
  if (edge >= 1.0 || light.z <= 0.0 || light.z >= 1.0) {
    return vec2f(1.0, 1.0);
  }
  let uv = vec2f(light.x * 0.5 + 0.5, 0.5 - light.y * 0.5);
  let depth = light.z - bias;
  var lit = 0.0;
  for (var tap = 0; tap < 8; tap++) {
    lit += textureSampleCompareLevel(shadow_map, shadow_sampler, uv + SHADOW_TAPS[tap] * texel, layer, depth);
  }
  return vec2f(lit / 8.0, edge);
}

// How much of the sun reaches a point measured from the eye, on a surface facing 'normal': 1 in the light, toward 0 in
// a shadow. The point is lifted off its surface a little along its normal, so a surface never shadows itself, by a
// texel or so of each cascade. Inside the near square its sharp shadows hold; toward its rim they give way to the far
// square's, which fade out toward its own rim, past which everything is lit.
fn sunlit(from_eye: vec3f, normal: vec3f) -> f32 {
  if (shadow.map.w < 0.5) {
    return 1.0;
  }
  let slant = 1.0 - abs(dot(normal, key_toward()));
  // Biases of 12 cm and of 1 m along the sun, with the lifts off the surface, against a surface's own shadow.
  let near = cascade_light(shadow.near, 0, shadow.map.x, ${(0.12 / (2 * NEAR.depthM)).toExponential(4)},
    from_eye + normal * (0.08 + 0.12 * slant));
  if (near.y < 0.8) {
    return near.x;
  }
  let far = cascade_light(shadow.far, 1, shadow.map.x, ${(1 / (2 * FAR.depthM)).toExponential(4)},
    from_eye + normal * (0.6 + 1.0 * slant));
  let far_lit = mix(far.x, 1.0, smoothstep(0.85, 1.0, far.y));
  return mix(near.x, far_lit, smoothstep(0.8, 1.0, near.y));
}
`;

const layouts = new WeakMap<GPUDevice, { caster: GPUBindGroupLayout; receiver: GPUBindGroupLayout }>();

/** The shadow's bind group layouts on a device, for a drawer whose pipelines name their layouts: a caster's (the
 *  cascade's matrix only) and a receiver's (both matrices, the maps and their sampler). */
export function shadowLayouts(device: GPUDevice): { caster: GPUBindGroupLayout; receiver: GPUBindGroupLayout } {
  const known = layouts.get(device);
  if (known) return known;
  const both = SHADER_STAGE.vertex | SHADER_STAGE.fragment;
  const matrix = { binding: 0, visibility: both, buffer: { type: 'uniform' as const } };
  const made = {
    caster: device.createBindGroupLayout({ entries: [matrix] }),
    receiver: device.createBindGroupLayout({
      entries: [
        matrix,
        {
          binding: 1,
          visibility: SHADER_STAGE.fragment,
          texture: { sampleType: 'depth' as const, viewDimension: '2d-array' as const },
        },
        { binding: 2, visibility: SHADER_STAGE.fragment, sampler: { type: 'comparison' as const } },
      ],
    }),
  };
  layouts.set(device, made);
  return made;
}

const none = new WeakMap<GPUDevice, ShadowMap>();
const NEAR_LAYER = CASCADES.indexOf(NEAR);
const FAR_LAYER = CASCADES.indexOf(FAR);

/** The sun's shadow maps, one a cascade: drawn by the casters each frame they are on, then read by the receivers. The
 *  far map is kept while its view is held and its casters draw as they did, at most FAR_HELD_FRAMES frames. */
export class ShadowMap {
  private readonly gpu: Gpu;
  private readonly texture: GPUTexture;
  private readonly receiving: GPUBuffer;
  private readonly casting: GPUBuffer[];
  private readonly sampler: GPUSampler;
  private readonly casters = new WeakMap<GPURenderPipeline, GPUBindGroup[]>();
  private readonly receivers = new WeakMap<GPURenderPipeline, GPUBindGroup>();
  /** Each cascade's view this frame, and the planes round its square from the eye; none bound one before a frame. */
  private views: (CascadeView | null)[] = CASCADES.map(() => null);
  private planes: number[][][] = CASCADES.map(() => []);
  /** What the far map holds, or null when it holds nothing to keep. */
  private farHeld: FarHeld | null = null;
  /** The far map's casters as they draw, while they are recorded. */
  private recording: CastRecording | null = null;
  /** Whether this frame casts shadows: the eye near enough the ground. */
  active = false;
  /** The cascade the casters are drawing now: a caster draws into the near one what only it needs, and into the far
   *  one what a far shadow needs. */
  cascade: Cascade = NEAR;

  constructor(gpu: Gpu, size = SHADOW_SIZE) {
    this.gpu = gpu;
    this.texture = gpu.device.createTexture({
      size: [size, size, CASCADES.length],
      format: 'depth32float',
      usage: TEXTURE_USAGE.renderAttachment | TEXTURE_USAGE.textureBinding,
    });
    const uniform = (floats: number) =>
      gpu.device.createBuffer({ size: floats * 4, usage: BUFFER_USAGE.uniform | BUFFER_USAGE.copyDestination });
    this.receiving = uniform(RECEIVER_FLOATS);
    this.casting = CASCADES.map(() => uniform(MATRIX_FLOATS));
    this.sampler = gpu.device.createSampler({ compare: 'less-equal', magFilter: 'linear', minFilter: 'linear' });
  }

  /** Maps that are always off, for a drawer drawn with no shadows. */
  static none(gpu: Gpu): ShadowMap {
    const known = none.get(gpu.device);
    if (known) return known;
    const made = new ShadowMap(gpu, 1);
    made.write(
      CASCADES.map(() => new Float32Array(MATRIX_FLOATS)),
      false,
    );
    none.set(gpu.device, made);
    return made;
  }

  /** Sets the maps for a frame from an eye at `eye` (world metres) looking along `yaw`, `aboveM` over the ground, cast
   *  along the key light `key` (east, south, up): each square stands ahead of the camera, where most of what it sees
   *  lies, the far one where it is held (`heldView`). */
  update(eye: Vector, yaw: number, aboveM: number, key: Vector = AFTERNOON_SUN): void {
    const toward = heldToward(key);
    this.active = aboveM < SHADOW_HIGHEST_M;
    const views = CASCADES.map((cascade, layer) => {
      const wanted = viewOf(cascade, eye, yaw, toward);
      return cascade === FAR ? heldView(this.views[layer] ?? null, wanted) : wanted;
    });
    const matrices = CASCADES.map((cascade, layer) => shadowMatrix(eye, views[layer], cascade));
    this.views = views;
    this.planes = matrices.map(castPlanes);
    this.write(matrices, this.active);
  }

  /** Whether a box measured from the eye (west, north, low, then east, south, high) may cast into a cascade's square,
   *  the one being drawn unless another is named (`boxCasts`). */
  reaches(low: Vector, high: Vector, cascade: Cascade = this.cascade): boolean {
    return boxCasts(this.planes[CASCADES.indexOf(cascade)] ?? [], cascade, low, high);
  }

  /** Whether a ball measured from the eye may cast into a cascade's square, the one being drawn unless another is
   *  named (`sphereCasts`). */
  sphereReaches(centre: Vector, radiusM: number, cascade: Cascade = this.cascade): boolean {
    return sphereCasts(this.planes[CASCADES.indexOf(cascade)] ?? [], cascade, centre, radiusM);
  }

  /** Folds into what the far map is kept by numbers a caster's draws into it do not show (where a ship lies, how far
   *  a prop has risen), so a change in them draws it again. Nothing while the near map is drawn. */
  tally(...values: number[]): void {
    this.recording?.tally(values);
  }

  /** Draws the casters into the maps, if this frame casts: `draw` is called once a cascade, with `cascade` set to it.
   *  The far map's casters draw into a recording, drawn into the map only if it must be (`farRedrawn`). */
  cast(encoder: GPUCommandEncoder, draw: (pass: GPURenderPassEncoder) => void): void {
    if (!this.active) {
      this.farHeld = null;
      return;
    }
    this.cascade = NEAR;
    this.drawLayer(encoder, NEAR_LAYER, draw);
    const recording = new CastRecording();
    [this.cascade, this.recording] = [FAR, recording];
    draw(recording.pass);
    [this.cascade, this.recording] = [NEAR, null];
    const view = this.views[FAR_LAYER];
    if (!view) return;
    const { signature } = recording;
    if (farRedrawn(this.farHeld, view, signature)) {
      this.drawLayer(encoder, FAR_LAYER, (pass) => recording.replay(pass));
      this.farHeld = { view, signature, frames: 0 };
    } else if (this.farHeld) this.farHeld.frames += 1;
  }

  /** The caster's bind group, for the cascade being drawn, for a pipeline whose group 1 is the matrix alone. */
  casterGroup(pipeline: GPURenderPipeline): GPUBindGroup {
    let groups = this.casters.get(pipeline);
    if (!groups) {
      groups = this.casting.map((buffer) =>
        this.gpu.device.createBindGroup({
          layout: pipeline.getBindGroupLayout(1),
          entries: [{ binding: 0, resource: { buffer } }],
        }),
      );
      this.casters.set(pipeline, groups);
    }
    const group = groups[CASCADES.indexOf(this.cascade)];
    if (!group) throw new Error('a cascade the maps do not hold');
    return group;
  }

  /** The receiver's bind group for a pipeline whose group 1 is the matrices, the maps and their sampler. */
  receiverGroup(pipeline: GPURenderPipeline): GPUBindGroup {
    let group = this.receivers.get(pipeline);
    if (!group) {
      group = this.gpu.device.createBindGroup({
        layout: pipeline.getBindGroupLayout(1),
        entries: [
          { binding: 0, resource: { buffer: this.receiving } },
          { binding: 1, resource: this.texture.createView({ dimension: '2d-array' }) },
          { binding: 2, resource: this.sampler },
        ],
      });
      this.receivers.set(pipeline, group);
    }
    return group;
  }

  /** Clears one cascade's map and has `draw` draw into it. */
  private drawLayer(encoder: GPUCommandEncoder, layer: number, draw: (pass: GPURenderPassEncoder) => void): void {
    const pass = encoder.beginRenderPass({
      colorAttachments: [],
      depthStencilAttachment: {
        view: this.texture.createView({ dimension: '2d', baseArrayLayer: layer, arrayLayerCount: 1 }),
        depthClearValue: 1,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
    });
    draw(pass);
    pass.end();
  }

  private write(matrices: readonly Float32Array[], active: boolean): void {
    const floats = new Float32Array(RECEIVER_FLOATS);
    matrices.forEach((matrix, layer) => {
      floats.set(matrix, layer * MATRIX_FLOATS);
      const buffer = this.casting[layer];
      if (buffer) this.gpu.device.queue.writeBuffer(buffer, 0, matrix);
    });
    floats.set([1 / this.texture.width, 0, 0, active ? 1 : 0], CASCADES.length * MATRIX_FLOATS);
    this.gpu.device.queue.writeBuffer(this.receiving, 0, floats);
  }
}
