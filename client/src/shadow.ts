// The sun's shadows round the eye, shared by everything drawn in the scene's pass: one map of the depth along the sun
// over a square ahead of the camera, drawn first by what casts (a city's solids and models, nature's trees) and read
// by what receives (the land, the city, the plants). Every drawer measures its points from the eye, so one matrix,
// from the eye into the map, serves them all.
import { BUFFER_USAGE, type Gpu, SHADER_STAGE, TEXTURE_USAGE } from './gpu.ts';

/** The map's texels a side. */
export const SHADOW_SIZE = 2048;
/** Half the side of the square the map covers, metres: 0.15 m a texel, sharp enough for a column or a bench. */
export const SHADOW_REACH_M = 150;
/** How far along the sun the map reaches either side of the eye, metres: a landmark's tower casts from its top. */
const SHADOW_DEPTH_M = 1500;
/** Over the ground higher than this the eye sees no shadow worth a pass: at sea, over an island's side. */
export const SHADOW_HIGHEST_M = 400;
/** The way to the sun, as SHARED_WGSL's SUN (water/waterCommon.ts) has it. */
const SUN: readonly [number, number, number] = [-0.5417, 0.5417, 0.6428];
const MATRIX_FLOATS = 16;
const UNIFORM_FLOATS = MATRIX_FLOATS + 4;

type Vector = readonly [number, number, number];
const dot = (a: Vector, b: Vector) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const normalised = (a: Vector): Vector => {
  const length = Math.hypot(...a);
  return [a[0] / length, a[1] / length, a[2] / length];
};

/** The map's axes: across it (right and up on the map) and along the sun's light, away from the sun. */
export function sunAxes(): { right: Vector; up: Vector; along: Vector } {
  const along = normalised([-SUN[0], -SUN[1], -SUN[2]]);
  const right = normalised([along[1], -along[0], 0]);
  const up: Vector = [
    right[1] * along[2] - right[2] * along[1],
    right[2] * along[0] - right[0] * along[2],
    right[0] * along[1] - right[1] * along[0],
  ];
  return { right, up, along };
}

/**
 * The matrix (column-major) that takes a point measured from the eye into the map's clip space, for an eye standing at
 * `eye` (world metres) and a square centred `ahead` metres (east, south) from it. The square's middle is snapped to the
 * map's texels in world terms, so the shadows' edges hold still as the eye moves.
 */
export function shadowMatrix(eye: Vector, ahead: readonly [number, number]): Float32Array {
  const { right, up, along } = sunAxes();
  const texel = (2 * SHADOW_REACH_M) / SHADOW_SIZE;
  const middle: Vector = [eye[0] + ahead[0], eye[1] + ahead[1], eye[2]];
  const snap = (axis: Vector) => (Math.round(dot(middle, axis) / texel) * texel - dot(eye, axis)) as number;
  // Each row: a point from the eye dotted with the axis, less the snapped middle's place on it.
  const rows = [
    [...right.map((value) => value / SHADOW_REACH_M), -snap(right) / SHADOW_REACH_M],
    [...up.map((value) => value / SHADOW_REACH_M), -snap(up) / SHADOW_REACH_M],
    [
      ...along.map((value) => value / (2 * SHADOW_DEPTH_M)),
      0.5 - dot(middle, along) / (2 * SHADOW_DEPTH_M) + dot(eye, along) / (2 * SHADOW_DEPTH_M),
    ],
    [0, 0, 0, 1],
  ];
  const matrix = new Float32Array(MATRIX_FLOATS);
  for (let row = 0; row < 4; row++)
    for (let column = 0; column < 4; column++) matrix[column * 4 + row] = rows[row]?.[column] ?? 0;
  return matrix;
}

/** What a caster's shadow pass reads: the matrix, at group 1. */
export const SHADOW_CAST_WGSL = /* wgsl */ `
struct Shadow {
  from_eye: mat4x4f,
  // The map's texel in its uvs, and whether shadows are on (1) or off (0).
  map: vec4f,
};
@group(1) @binding(0) var<uniform> shadow: Shadow;
`;

/** What a receiver reads, at group 1, and how much of the sun reaches a point. */
export const SHADOW_WGSL = /* wgsl */ `
${SHADOW_CAST_WGSL}
@group(1) @binding(1) var shadow_map: texture_depth_2d;
@group(1) @binding(2) var shadow_sampler: sampler_comparison;

// The taps round a point, in texels: a soft edge some 0.4 m wide, no harder than the sun's own penumbra at a few metres.
const SHADOW_TAPS = array<vec2f, 8>(
  vec2f(-1.6, -0.6), vec2f(0.6, -1.6), vec2f(1.6, 0.6), vec2f(-0.6, 1.6),
  vec2f(-0.7, -0.2), vec2f(0.2, -0.7), vec2f(0.7, 0.2), vec2f(-0.2, 0.7),
);

// How much of the sun reaches a point measured from the eye, on a surface facing 'normal': 1 in the light, toward 0 in
// a shadow. The point is lifted off its surface a little along its normal, so a surface never shadows itself, and the
// shadows fade out toward the square's rim, past which everything is lit.
fn sunlit(from_eye: vec3f, normal: vec3f) -> f32 {
  if (shadow.map.w < 0.5) {
    return 1.0;
  }
  let facing = dot(normal, SUN);
  let lifted = from_eye + normal * (0.08 + 0.12 * (1.0 - abs(facing)));
  let light = shadow.from_eye * vec4f(lifted, 1.0);
  let edge = max(abs(light.x), abs(light.y));
  if (edge >= 1.0 || light.z <= 0.0 || light.z >= 1.0) {
    return 1.0;
  }
  let uv = vec2f(light.x * 0.5 + 0.5, 0.5 - light.y * 0.5);
  // A bias of 12 cm along the sun, with the lift off the surface, against a surface's own shadow.
  let depth = light.z - 0.00004;
  var lit = 0.0;
  for (var tap = 0; tap < 8; tap++) {
    lit += textureSampleCompareLevel(shadow_map, shadow_sampler, uv + SHADOW_TAPS[tap] * shadow.map.x, depth);
  }
  return mix(lit / 8.0, 1.0, smoothstep(0.8, 1.0, edge));
}
`;

const layouts = new WeakMap<GPUDevice, { caster: GPUBindGroupLayout; receiver: GPUBindGroupLayout }>();

/** The shadow's bind group layouts on a device, for a drawer whose pipelines name their layouts: a caster's (the
 *  matrix only) and a receiver's (the matrix, the map and its sampler). */
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
        { binding: 1, visibility: SHADER_STAGE.fragment, texture: { sampleType: 'depth' as const } },
        { binding: 2, visibility: SHADER_STAGE.fragment, sampler: { type: 'comparison' as const } },
      ],
    }),
  };
  layouts.set(device, made);
  return made;
}

const none = new WeakMap<GPUDevice, ShadowMap>();

/** The sun's shadow map: drawn by the casters each frame it is on, then read by the receivers. */
export class ShadowMap {
  private readonly gpu: Gpu;
  private readonly texture: GPUTexture;
  private readonly uniforms: GPUBuffer;
  private readonly sampler: GPUSampler;
  private readonly casters = new WeakMap<GPURenderPipeline, GPUBindGroup>();
  private readonly receivers = new WeakMap<GPURenderPipeline, GPUBindGroup>();
  /** Whether this frame casts shadows: the eye near enough the ground. */
  active = false;
  /** The square's middle from the eye (east, south), metres. */
  ahead: readonly [number, number] = [0, 0];

  constructor(gpu: Gpu, size = SHADOW_SIZE) {
    this.gpu = gpu;
    this.texture = gpu.device.createTexture({
      size: [size, size],
      format: 'depth32float',
      usage: TEXTURE_USAGE.renderAttachment | TEXTURE_USAGE.textureBinding,
    });
    this.uniforms = gpu.device.createBuffer({
      size: UNIFORM_FLOATS * 4,
      usage: BUFFER_USAGE.uniform | BUFFER_USAGE.copyDestination,
    });
    this.sampler = gpu.device.createSampler({ compare: 'less-equal', magFilter: 'linear', minFilter: 'linear' });
  }

  /** A map that is always off, for a drawer drawn with no shadows (the World Editor's). */
  static none(gpu: Gpu): ShadowMap {
    const known = none.get(gpu.device);
    if (known) return known;
    const made = new ShadowMap(gpu, 1);
    made.write(new Float32Array(MATRIX_FLOATS), false);
    none.set(gpu.device, made);
    return made;
  }

  /** Sets the map for a frame from an eye at `eye` (world metres) looking along `yaw`, `aboveM` over the ground: the
   *  square stands ahead of the camera, where most of what it sees lies. */
  update(eye: Vector, yaw: number, aboveM: number): void {
    this.active = aboveM < SHADOW_HIGHEST_M;
    this.ahead = [Math.sin(yaw) * SHADOW_REACH_M * 0.5, -Math.cos(yaw) * SHADOW_REACH_M * 0.5];
    this.write(shadowMatrix(eye, this.ahead), this.active);
  }

  /** Whether a box measured from the eye (west, north, low, then east, south, high) may cast into the square: its
   *  shadow falls along the sun as far as its height throws it. */
  reaches(low: Vector, high: Vector): boolean {
    const throwM = Math.max(0, high[2]) * (Math.hypot(SUN[0], SUN[1]) / SUN[2]);
    const reach = SHADOW_REACH_M * Math.SQRT2 + throwM;
    const [x, y] = this.ahead;
    const nearX = Math.max(low[0], Math.min(x, high[0]));
    const nearY = Math.max(low[1], Math.min(y, high[1]));
    return Math.hypot(nearX - x, nearY - y) <= reach;
  }

  /** Begins the casters' pass: every caster draws its depth along the sun. */
  beginPass(encoder: GPUCommandEncoder): GPURenderPassEncoder {
    return encoder.beginRenderPass({
      colorAttachments: [],
      depthStencilAttachment: {
        view: this.texture.createView(),
        depthClearValue: 1,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
    });
  }

  /** The caster's bind group for a pipeline whose group 1 is the matrix alone. */
  casterGroup(pipeline: GPURenderPipeline): GPUBindGroup {
    let group = this.casters.get(pipeline);
    if (!group) {
      group = this.gpu.device.createBindGroup({
        layout: pipeline.getBindGroupLayout(1),
        entries: [{ binding: 0, resource: { buffer: this.uniforms } }],
      });
      this.casters.set(pipeline, group);
    }
    return group;
  }

  /** The receiver's bind group for a pipeline whose group 1 is the matrix, the map and its sampler. */
  receiverGroup(pipeline: GPURenderPipeline): GPUBindGroup {
    let group = this.receivers.get(pipeline);
    if (!group) {
      group = this.gpu.device.createBindGroup({
        layout: pipeline.getBindGroupLayout(1),
        entries: [
          { binding: 0, resource: { buffer: this.uniforms } },
          { binding: 1, resource: this.texture.createView() },
          { binding: 2, resource: this.sampler },
        ],
      });
      this.receivers.set(pipeline, group);
    }
    return group;
  }

  private write(matrix: Float32Array, active: boolean): void {
    const floats = new Float32Array(UNIFORM_FLOATS);
    floats.set(matrix);
    floats.set([1 / this.texture.width, 0, 0, active ? 1 : 0], MATRIX_FLOATS);
    this.gpu.device.queue.writeBuffer(this.uniforms, 0, floats);
  }
}
