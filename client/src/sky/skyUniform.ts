/** The most lamps lit round the eye at once, the night's lights that reach the ground. */
export const LAMPS_MOST = 16;
/** The bind group every sunlit shader reads the sky at: past the frame (0), the shadow map (1) and a card's (2). */
export const SKY_GROUP = 3;

/**
 * What every sunlit shader reads of the sky, at SKY_GROUP: the key light (the sun by day, the moon by night), the sky's
 * colours, the ambient light from above and below, the fog, the wind and the fall, and the lamps round the eye.
 * `sky_ambient` and `sky_direct` are the light on a surface: what a clear noon's AMBIENT 0.35 and its sun gave.
 */
export const SKY_WGSL = /* wgsl */ `
struct Sky {
  key: vec4f,
  key_light: vec4f,
  sun: vec4f,
  moon: vec4f,
  zenith: vec4f,
  horizon: vec4f,
  ambient_sky: vec4f,
  ambient_ground: vec4f,
  fog: vec4f,
  wind: vec4f,
  weather: vec4f,
  drift: vec4f,
  lamp_count: vec4f,
  lamps: array<vec4f, ${LAMPS_MOST * 2}>,
}
@group(${SKY_GROUP}) @binding(0) var<uniform> sky_state: Sky;

// Toward the key light, east, south and up; under the horizon it is held just above it, so a slant along it stays finite.
fn key_toward() -> vec3f {
  let toward = sky_state.key.xyz;
  return normalize(vec3f(toward.xy, max(toward.z, 0.08)));
}

// How bright the sky's light is against a clear noon's, for what a shader lit by a level once, as the water's body.
fn sky_level() -> f32 {
  return dot(sky_state.ambient_sky.rgb, vec3f(0.2126, 0.7152, 0.0722)) / 0.35;
}

// The light from the sky above and the ground below on a surface facing 'normal'.
fn sky_ambient(normal: vec3f) -> vec3f {
  return mix(sky_state.ambient_ground.rgb, sky_state.ambient_sky.rgb, clamp(normal.z * 0.5 + 0.5, 0.0, 1.0));
}

// The key light on a surface facing 'normal', with 'shade' of it reaching there (0 in shadow).
fn sky_direct(normal: vec3f, shade: f32) -> vec3f {
  return sky_state.key_light.rgb * (0.65 * max(dot(normal, sky_state.key.xyz), 0.0) * shade);
}
`;

/** The sky as the shaders read it: directions east, south and up, colours linear red, green and blue. */
export interface SkyLook {
  readonly key: readonly [number, number, number];
  /** The key light's brightness against a clear noon's sun, 0 to 1, and its colour at that brightness. */
  readonly keyBright: number;
  readonly keyLight: readonly [number, number, number];
  readonly sun: readonly [number, number, number];
  readonly daylight: number;
  readonly moon: readonly [number, number, number];
  readonly moonLit: number;
  readonly zenith: readonly [number, number, number];
  readonly horizon: readonly [number, number, number];
  readonly cloud: number;
  readonly storm: number;
  readonly ambientSky: readonly [number, number, number];
  readonly ambientGround: readonly [number, number, number];
  readonly wetness: number;
  readonly snowShare: number;
  readonly fogColour: readonly [number, number, number];
  /** The fog's own density, per metre, over the scene's haze. */
  readonly fogDensity: number;
  readonly wind: readonly [number, number];
  readonly gust: number;
  readonly falling: number;
  readonly sand: number;
  /** A lightning strike's flash, 0 none to 1 a near strike's peak. */
  readonly flash: number;
  readonly stars: number;
  readonly starTurn: number;
  /** The clouds' drift on their plane, in noise cells, wrapped where the pattern repeats. */
  readonly drift: readonly [number, number];
  /** The place's latitude, radians: how high the pole the stars wheel about stands, due north. */
  readonly latitude: number;
  /** The moon's month, 0 new to a half full and back to 1. */
  readonly moonPhase: number;
}

/** A lamp round the eye: where it is from the eye (metres east, south and up), how far it reaches, and its light. */
export interface Lamp {
  readonly fromEye: readonly [number, number, number];
  readonly reachM: number;
  readonly light: readonly [number, number, number];
}

/** The sky before anything sets it: the clear afternoon the game was drawn in, with no wind, fall or lamps. */
export const AFTERNOON: SkyLook = {
  key: [-0.5417, 0.5417, 0.6428],
  keyBright: 1,
  keyLight: [1.0, 0.94, 0.82],
  sun: [-0.5417, 0.5417, 0.6428],
  daylight: 1,
  moon: [0.5, -0.5, -0.7071],
  moonLit: 0,
  zenith: [0.2, 0.42, 0.8],
  horizon: [0.7, 0.81, 0.92],
  cloud: 0.17,
  storm: 0,
  ambientSky: [0.35, 0.35, 0.35],
  ambientGround: [0.35, 0.35, 0.35],
  wetness: 0,
  snowShare: 0,
  fogColour: [0.7, 0.81, 0.92],
  fogDensity: 0,
  wind: [0, 0],
  gust: 0,
  falling: 0,
  sand: 0,
  flash: 0,
  stars: 0,
  starTurn: 0,
  drift: [0, 0],
  latitude: 0.5,
  moonPhase: 0.5,
};

const VEC4S = 13 + LAMPS_MOST * 2;

/** The sky's numbers in the order SKY_WGSL lays them out. */
export function skyNumbers(look: SkyLook, lamps: readonly Lamp[]): Float32Array {
  const shown = lamps.slice(0, LAMPS_MOST);
  const numbers = new Float32Array(VEC4S * 4);
  const rows: readonly (readonly number[])[] = [
    [...look.key, look.keyBright],
    [...look.keyLight, 0],
    [...look.sun, look.daylight],
    [...look.moon, look.moonLit],
    [...look.zenith, look.cloud],
    [...look.horizon, look.storm],
    [...look.ambientSky, look.wetness],
    [...look.ambientGround, look.snowShare],
    [...look.fogColour, look.fogDensity],
    [...look.wind, look.gust, look.falling],
    [look.sand, look.flash, look.stars, look.starTurn],
    [...look.drift, look.latitude, look.moonPhase],
    [shown.length, 0, 0, 0],
    ...shown.flatMap((lamp) => [
      [...lamp.fromEye, lamp.reachM],
      [...lamp.light, 0],
    ]),
  ];
  rows.forEach((row, index) => numbers.set(row, index * 4));
  return numbers;
}

/**
 * The sky's uniform for one GPU device, which every sunlit view binds at group 1: one buffer, written once a frame by
 * whoever draws the sky (`write`), and a bind group for each pipeline that reads it. Nobody writing it leaves the
 * clear afternoon.
 */
export class SkyUniform {
  readonly buffer: GPUBuffer;
  /** For a pipeline laid out by hand: its group 1. */
  readonly layout: GPUBindGroupLayout;
  private readonly device: GPUDevice;
  private readonly groups = new WeakMap<GPUPipelineBase, GPUBindGroup>();
  private shared: GPUBindGroup | null = null;
  look: SkyLook = AFTERNOON;

  constructor(device: GPUDevice) {
    this.device = device;
    // GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, spelled out where the browser's constants are not at hand.
    this.buffer = device.createBuffer({ size: VEC4S * 16, usage: 0x40 | 0x8 });
    // GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT.
    this.layout = device.createBindGroupLayout({ entries: [{ binding: 0, visibility: 0x1 | 0x2, buffer: {} }] });
    this.empty = device.createBindGroupLayout({ entries: [] });
    this.write(AFTERNOON, []);
  }

  write(look: SkyLook, lamps: readonly Lamp[]): void {
    this.look = look;
    this.device.queue.writeBuffer(this.buffer, 0, skyNumbers(look, lamps));
  }

  /** An empty group, for a gap below SKY_GROUP in a pipeline laid out by hand. */
  readonly empty: GPUBindGroupLayout;
  private emptyShared: GPUBindGroup | null = null;

  /** Sets the sky on a pass drawing with a pipeline laid out by hand (`layout` at SKY_GROUP, `empty` in each gap). */
  bindShared(pass: GPURenderPassEncoder, gaps: readonly number[] = []): void {
    this.emptyShared ??= this.device.createBindGroup({ layout: this.empty, entries: [] });
    for (const gap of gaps) pass.setBindGroup(gap, this.emptyShared);
    pass.setBindGroup(SKY_GROUP, this.sharedGroup());
  }

  /** Sets the sky on a pass drawing with a pipeline the browser laid out ('auto'), each gap given its empty group. */
  bindAuto(pass: GPURenderPassEncoder, pipeline: GPURenderPipeline, gaps: readonly number[] = []): void {
    for (const gap of gaps) pass.setBindGroup(gap, this.gapGroup(pipeline, gap));
    pass.setBindGroup(SKY_GROUP, this.bindGroup(pipeline));
  }

  private readonly gaps = new WeakMap<GPUPipelineBase, Map<number, GPUBindGroup>>();

  private gapGroup(pipeline: GPURenderPipeline, gap: number): GPUBindGroup {
    const known = this.gaps.get(pipeline) ?? new Map<number, GPUBindGroup>();
    this.gaps.set(pipeline, known);
    const group =
      known.get(gap) ?? this.device.createBindGroup({ layout: pipeline.getBindGroupLayout(gap), entries: [] });
    known.set(gap, group);
    return group;
  }

  /** The bind group a pipeline laid out by the browser ('auto') reads the sky through. */
  bindGroup(pipeline: GPURenderPipeline | GPUComputePipeline): GPUBindGroup {
    const known = this.groups.get(pipeline);
    if (known) return known;
    const made = this.device.createBindGroup({
      layout: pipeline.getBindGroupLayout(SKY_GROUP),
      entries: [{ binding: 0, resource: { buffer: this.buffer } }],
    });
    this.groups.set(pipeline, made);
    return made;
  }

  /** The bind group a pipeline laid out with `layout` reads the sky through. */
  sharedGroup(): GPUBindGroup {
    this.shared ??= this.device.createBindGroup({
      layout: this.layout,
      entries: [{ binding: 0, resource: { buffer: this.buffer } }],
    });
    return this.shared;
  }
}

const UNIFORMS = new WeakMap<GPUDevice, SkyUniform>();

/** The one sky uniform of a device. */
export function skyUniformFor(device: GPUDevice): SkyUniform {
  const known = UNIFORMS.get(device);
  if (known) return known;
  const made = new SkyUniform(device);
  UNIFORMS.set(device, made);
  return made;
}
