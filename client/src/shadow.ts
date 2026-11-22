// The sun's shadows round the eye, shared by everything drawn in the scene's pass: two maps of the depth along the sun
// (a near square ahead of the camera, sharp enough for a bench, and a far one over the city it looks out on), drawn
// first by what casts (a city's solids, models and masses, nature's trees, the figures) and read by what receives (the
// land, the city, the plants, the figures). Every drawer measures its points from the eye, so one matrix a cascade,
// from the eye into its map, serves them all.
import { BUFFER_USAGE, type Gpu, SHADER_STAGE, TEXTURE_USAGE } from './gpu.ts';

/** Each map's texels a side. */
export const SHADOW_SIZE = 2048;
/** Over the ground higher than this the eye sees no shadow worth a pass: at sea, over an island's side. */
export const SHADOW_HIGHEST_M = 400;
/** The clear afternoon's sun, which the shadows are cast along until a sky sets the key light. */
const AFTERNOON_SUN: Vector = [-0.5417, 0.5417, 0.6428];
/** The way to the key light the shadows are cast along this frame, held just above the horizon as the sky's WGSL
 *  `key_toward` holds it, so a low sun's shadows stay finite and agree with the shading. */
let toward: Vector = AFTERNOON_SUN;

/** The key light's way, as `key_toward` in sky/skyUniform.ts holds it. */
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

type Vector = readonly [number, number, number];
const dot = (a: Vector, b: Vector) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const normalised = (a: Vector): Vector => {
  const length = Math.hypot(...a);
  return [a[0] / length, a[1] / length, a[2] / length];
};

/** The maps' axes: across them (right and up on a map) and along the key light, away from it. */
export function sunAxes(): { right: Vector; up: Vector; along: Vector } {
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

/**
 * The matrix (column-major) that takes a point measured from the eye into a cascade's clip space, for an eye standing
 * at `eye` (world metres) and its square centred `ahead` metres (east, south) from it. The square's middle is snapped
 * to the map's texels in world terms, so the shadows' edges hold still as the eye moves.
 */
export function shadowMatrix(eye: Vector, ahead: readonly [number, number], cascade: Cascade = NEAR): Float32Array {
  const { right, up, along } = sunAxes();
  const { reachM, depthM } = cascade;
  const texel = (2 * reachM) / SHADOW_SIZE;
  const middle: Vector = [eye[0] + ahead[0], eye[1] + ahead[1], eye[2]];
  const snap = (axis: Vector) => (Math.round(dot(middle, axis) / texel) * texel - dot(eye, axis)) as number;
  // Each row: a point from the eye dotted with the axis, less the snapped middle's place on it.
  const rows = [
    [...right.map((value) => value / reachM), -snap(right) / reachM],
    [...up.map((value) => value / reachM), -snap(up) / reachM],
    [
      ...along.map((value) => value / (2 * depthM)),
      0.5 - dot(middle, along) / (2 * depthM) + dot(eye, along) / (2 * depthM),
    ],
    [0, 0, 0, 1],
  ];
  const matrix = new Float32Array(MATRIX_FLOATS);
  for (let row = 0; row < 4; row++)
    for (let column = 0; column < 4; column++) matrix[column * 4 + row] = rows[row]?.[column] ?? 0;
  return matrix;
}

let axes = sunAxes();
/** How far past its square a cascade takes casters, in its texels: the snap of its middle and the taps' reach. */
const CAST_MARGIN_TEXELS = 4;

/**
 * Whether a box measured from the eye (west, north, low, then east, south, high) may cast into a cascade's square
 * centred `ahead` of the eye: whether, seen along the sun, it overlaps the square, wherever along the sun it stands.
 */
export function boxReaches(cascade: Cascade, ahead: readonly [number, number], low: Vector, high: Vector): boolean {
  const reach = cascade.reachM * (1 + (2 * CAST_MARGIN_TEXELS) / SHADOW_SIZE);
  return spans(axes.right, ahead, low, high, reach) && spans(axes.up, ahead, low, high, reach);
}

/** Whether the box's span along `axis`, from the square's middle, meets the square: asked for every tile and cell a
 *  frame, so summed in place. */
function spans(axis: Vector, ahead: readonly [number, number], low: Vector, high: Vector, reach: number): boolean {
  const middle = ahead[0] * axis[0] + ahead[1] * axis[1];
  let least = -middle;
  let most = -middle;
  for (let k = 0; k < 3; k++) {
    const along = axis[k] ?? 0;
    least += along * (along >= 0 ? (low[k] ?? 0) : (high[k] ?? 0));
    most += along * (along >= 0 ? (high[k] ?? 0) : (low[k] ?? 0));
  }
  return !(most < -reach || least > reach);
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

/** The sun's shadow maps, one a cascade: drawn by the casters each frame they are on, then read by the receivers. */
export class ShadowMap {
  private readonly gpu: Gpu;
  private readonly texture: GPUTexture;
  private readonly receiving: GPUBuffer;
  private readonly casting: GPUBuffer[];
  private readonly sampler: GPUSampler;
  private readonly casters = new WeakMap<GPURenderPipeline, GPUBindGroup[]>();
  private readonly receivers = new WeakMap<GPURenderPipeline, GPUBindGroup>();
  private aheads: (readonly [number, number])[] = CASCADES.map(() => [0, 0] as const);
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
   *  lies. */
  update(eye: Vector, yaw: number, aboveM: number, key: Vector = AFTERNOON_SUN): void {
    toward = heldToward(key);
    axes = sunAxes();
    this.active = aboveM < SHADOW_HIGHEST_M;
    this.aheads = CASCADES.map((cascade) => aheadOf(cascade, yaw));
    this.write(
      CASCADES.map((cascade, layer) => shadowMatrix(eye, this.aheads[layer] ?? [0, 0], cascade)),
      this.active,
    );
  }

  /** Whether a box measured from the eye (west, north, low, then east, south, high) may cast into a cascade's square,
   *  the one being drawn unless another is named. */
  reaches(low: Vector, high: Vector, cascade: Cascade = this.cascade): boolean {
    return boxReaches(cascade, this.aheads[CASCADES.indexOf(cascade)] ?? [0, 0], low, high);
  }

  /** Draws the casters into every cascade's map, if this frame casts: `draw` is called once a cascade, with
   *  `cascade` set to it. */
  cast(encoder: GPUCommandEncoder, draw: (pass: GPURenderPassEncoder) => void): void {
    if (!this.active) return;
    CASCADES.forEach((cascade, layer) => {
      this.cascade = cascade;
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
    });
    this.cascade = NEAR;
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
