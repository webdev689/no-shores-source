import { SHELTER_CELL_M, SHELTER_CELLS } from './shelter.ts';

/** The most lamps lit round the eye at once, the night's lights that reach the ground. */
export const LAMPS_MOST = 16;
/** The ground's noise repeats every NOISE_CELLS cells: the clouds' shadows' cells (as wide as a cloud's patch) and the
 *  puddles' a 128th of them, so the eye's place is wrapped at WRAP_M with no seam. A cell of the clouds' own drift
 *  (some 7.5 km) is a whole number of shadow cells, so the shadows move as the clouds do. */
const NOISE_CELLS = 1024;
const DAPPLE_CELL_M = 384;
const PUDDLE_CELL_M = DAPPLE_CELL_M / 128;
const DRIFT_TO_DAPPLE = 20;
export const WRAP_M = NOISE_CELLS * DAPPLE_CELL_M;
/** The shelter grid's cells, four to a row of the uniform. */
const SHELTER_VEC4S = (SHELTER_CELLS * SHELTER_CELLS) / 4;
/** The bind group every sunlit shader reads the sky at: past the frame (0), the shadow map (1) and a card's (2). */
export const SKY_GROUP = 3;

/**
 * What every sunlit shader reads of the sky, at SKY_GROUP: the key light (the sun by day, the moon by night), the sky's
 * colours, the ambient light from above and below, the fog, the wind and the fall, and the lamps round the eye.
 * `sky_ambient` and `sky_direct` are the light on a surface, scaled so a clear noon's ambient light is 0.35.
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
  drift_next: vec4f,
  puddle_place: vec4f,
  lamp_count: vec4f,
  // The eye from the shelter grid's north-west corner, east and south, and from its base height; w 1 once one is laid.
  shelter_place: vec4f,
  lamps: array<vec4f, ${LAMPS_MOST * 2}>,
  // Each cell's highest underside over the base, four cells a row (shelter.ts).
  shelter: array<vec4f, ${SHELTER_VEC4S}>,
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

// A point's place on the world's plane, wrapped where the ground's noise repeats: the eye's wrapped place is
// lamp_count.yz, and lamp_count.w is 1 once it is known (a view that never writes the sky has no place, and no dapple).
fn sky_place(from_eye: vec3f) -> vec2f {
  return sky_state.lamp_count.yz + from_eye.xy;
}

// Whether a point at 'from_eye' stands under shelter: something a body meets stands over it, its underside higher
// than the point, in the grid laid round the eye. Off the grid, or with none laid, it stands under the open sky.
fn sky_sheltered(from_eye: vec3f) -> bool {
  if (sky_state.shelter_place.w < 0.5) {
    return false;
  }
  let cell = vec2i(floor((from_eye.xy + sky_state.shelter_place.xy) / ${SHELTER_CELL_M.toFixed(1)}));
  if (any(cell < vec2i(0)) || any(cell >= vec2i(${SHELTER_CELLS}))) {
    return false;
  }
  let index = u32(cell.y * ${SHELTER_CELLS} + cell.x);
  let under = sky_state.shelter[index / 4u][index % 4u];
  return from_eye.z + sky_state.shelter_place.z < under - 0.05;
}

// A cloud field read where the pattern lies now ('now') and where the next lies ('next'), the next faded in over a
// spell's end; its spread about 'mean' held through the fade, so the cover neither thins nor thickens.
fn sky_spell_mix(now: f32, next: f32, mean: f32) -> f32 {
  let fade = sky_state.drift_next.z;
  return mean + ((now - mean) * (1.0 - fade) + (next - mean) * fade) / sqrt((1.0 - fade) * (1.0 - fade) + fade * fade);
}

// The clouds' shadows' noise at a place on the ground, its cells shifted by a pattern's drift in the sky's cells.
fn sky_dapple_cloud(place: vec2f, drift: vec2f) -> f32 {
  let at = place / ${DAPPLE_CELL_M}.0 - drift * ${DRIFT_TO_DAPPLE}.0;
  return 0.65 * sky_noise(at) + 0.35 * sky_noise(at * 2.0 + vec2f(17.0, 5.0));
}

// Value noise, 0 to 1, over cells that repeat every ${NOISE_CELLS}, so a wrapped place and the clouds' wrapped drift
// never show a seam.
fn sky_noise(at: vec2f) -> f32 {
  let base = floor(at);
  let share = smoothstep(vec2f(0.0), vec2f(1.0), at - base);
  let cell = vec2i(base);
  var corners: array<f32, 4>;
  for (var corner = 0; corner < 4; corner++) {
    let wrapped = ((cell + vec2i(corner & 1, corner >> 1)) % ${NOISE_CELLS} + ${NOISE_CELLS}) % ${NOISE_CELLS};
    var hash = (u32(wrapped.x) * 0x8da6b343u) ^ (u32(wrapped.y) * 0xd8163841u);
    hash = (hash ^ (hash >> 15u)) * 0x2c1b3c6du;
    corners[corner] = f32(hash ^ (hash >> 12u)) / 4294967296.0;
  }
  return mix(mix(corners[0], corners[1], share.x), mix(corners[2], corners[3], share.x), share.y);
}

// The clouds' shadows on the ground, a share of the key light to multiply 'shade' by: patches under cloud as wide as
// the cover, drifting as the clouds overhead do. Clear skies have none; under a whole deck the key light is already dimmed.
fn sky_dapple(from_eye: vec3f) -> f32 {
  let cover = sky_state.zenith.w;
  let strength = 0.7 * smoothstep(0.05, 0.3, cover) * (1.0 - smoothstep(0.75, 0.97, cover)) * sky_state.lamp_count.w;
  if (strength <= 0.0) {
    return 1.0;
  }
  let place = sky_place(from_eye);
  var cloud = sky_dapple_cloud(place, sky_state.drift.xy);
  if (sky_state.drift_next.z > 0.0) {
    cloud = sky_spell_mix(cloud, sky_dapple_cloud(place, sky_state.drift_next.xy), 0.5);
  }
  return 1.0 - strength * (1.0 - smoothstep(cover - 0.12, cover + 0.12, cloud));
}

// The lamps' light on a surface at 'from_eye' facing 'normal': each falls smoothly to nothing at its reach, brightest
// on a face turned to it, with no shadows.
fn sky_lamps(from_eye: vec3f, normal: vec3f) -> vec3f {
  var light = vec3f(0.0);
  let count = min(u32(sky_state.lamp_count.x), ${LAMPS_MOST}u);
  for (var lamp = 0u; lamp < count; lamp++) {
    let place = sky_state.lamps[lamp * 2u];
    let toward = place.xyz - from_eye;
    let near = clamp(1.0 - dot(toward, toward) / (place.w * place.w), 0.0, 1.0);
    let facing = 0.25 + 0.75 * max(dot(normal, toward * inverseSqrt(max(dot(toward, toward), 1e-4))), 0.0);
    light += sky_state.lamps[lamp * 2u + 1u].rgb * (near * near * facing);
  }
  return light;
}

// A surface's colour darkened by the weather's wetness, 'wet' 0 dry to 1 soaked or a puddle.
fn sky_soaked(albedo: vec3f, wet: f32) -> vec3f {
  return albedo * (1.0 - 0.4 * wet);
}

// A wet surface's sheen, added to its lit colour: the sky's glare toward a grazing eye, and the key light's glint.
fn sky_sheen(normal: vec3f, from_eye: vec3f, wet: f32) -> vec3f {
  if (wet <= 0.0) {
    return vec3f(0.0);
  }
  let toward_eye = -normalize(from_eye);
  let glare = 0.04 + 0.96 * pow(1.0 - clamp(dot(normal, toward_eye), 0.0, 1.0), 5.0);
  let glint = pow(max(dot(normal, normalize(toward_eye + sky_state.key.xyz)), 0.0), 60.0);
  let lift = max(sky_state.key.z, 0.0);
  // A puddle (wet 1) mirrors the sky; soaked stone only glazes it.
  return wet * (sky_state.horizon.rgb * glare * (0.3 + 0.7 * wet) + sky_state.key_light.rgb * glint * lift * 0.8);
}

// Where rain stands in puddles on flat ground at 'from_eye' with 'slope' (rise a metre): in the hollows a noise lays
// out, only once the ground is soaked.
fn sky_puddle(from_eye: vec3f, slope: f32) -> f32 {
  let soaked = smoothstep(0.45, 0.9, sky_state.ambient_sky.w);
  if (soaked <= 0.0) {
    return 0.0;
  }
  // The eye's place wrapped where the puddles' noise repeats, small enough that a float keeps their edges still.
  let hollow = sky_noise((sky_state.puddle_place.xy + from_eye.xy) / ${PUDDLE_CELL_M.toFixed(1)});
  return soaked * (1.0 - smoothstep(0.02, 0.06, slope)) * smoothstep(0.62 - 0.1 * soaked, 0.68 - 0.1 * soaked, hollow);
}

// How much fresh snow lies on flat ground at 'height_m' over the sea, where 'slope' (rise a metre) lets it: the
// weather's cover where it was read, on the ground under the eye (puddle_place.z), and higher; lower ground is warmer,
// and its snow fades out 100 to 300 m down.
fn sky_fresh_snow(height_m: f32, slope: f32) -> f32 {
  let read_at = sky_state.puddle_place.z;
  let cover = sky_state.ambient_ground.w * smoothstep(read_at - 300.0, read_at - 100.0, height_m);
  return cover * (1.0 - smoothstep(0.15, 0.35, slope));
}

// A surface's colour under fresh snow, 'snow' 0 bare to 1 whole: snow as the land's snowfields lie, the ground just
// showing through a whole cover.
fn sky_snowed(colour: vec3f, snow: f32) -> vec3f {
  return mix(colour, vec3f(0.94, 0.95, 0.97), 0.9 * snow);
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
  /** The share of what falls that is snow, and the fresh snow lying on the ground. */
  readonly snowShare: number;
  readonly snowCover: number;
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
  /** The clouds' pattern on their plane now and the next, in noise cells, and how far the next has faded in. */
  readonly drift: readonly [number, number];
  readonly driftNext: readonly [number, number];
  readonly driftFade: number;
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

/** The sky before anything sets it: a clear afternoon, with no wind, fall or lamps. */
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
  snowCover: 0,
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
  driftNext: [0, 0],
  driftFade: 0,
  latitude: 0.5,
  moonPhase: 0.5,
};

/** The rows written each frame: the sky, the eye's places and the lamps; the shelter grid follows them. */
const VEC4S = 16 + LAMPS_MOST * 2;

/** A world metre wrapped into [0, period), WRAP_M where none is named. */
const wrapped = (metres: number, period = WRAP_M): number => ((metres % period) + period) % period;
/** Where the puddles' noise repeats, metres. */
export const PUDDLE_WRAP_M = NOISE_CELLS * PUDDLE_CELL_M;

/** The sky's numbers in the order SKY_WGSL lays them out, with the eye's place where known (world metres east and
 *  south, which the ground's patterns lie by, and the height of the ground under it, where the weather was read). */
export function skyNumbers(
  look: SkyLook,
  lamps: readonly Lamp[],
  eye?: readonly [number, number, number],
  shelterPlace: readonly [number, number, number, number] = [0, 0, 0, 0],
): Float32Array {
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
    [...look.ambientGround, look.snowCover],
    [...look.fogColour, look.fogDensity],
    [...look.wind, look.gust, look.falling],
    [look.sand, look.flash, look.stars, look.starTurn],
    [...look.drift, look.latitude, look.moonPhase],
    [...look.driftNext, look.driftFade, 0],
    eye ? [wrapped(eye[0], PUDDLE_WRAP_M), wrapped(eye[1], PUDDLE_WRAP_M), eye[2], 0] : [0, 0, 0, 0],
    eye ? [shown.length, wrapped(eye[0]), wrapped(eye[1]), 1] : [shown.length, 0, 0, 0],
    shelterPlace,
    ...shown.flatMap((lamp) => [
      [...lamp.fromEye, lamp.reachM],
      [...lamp.light, 0],
    ]),
  ];
  rows.forEach((row, index) => numbers.set(row, index * 4));
  return numbers;
}

/**
 * The sky's uniform for one GPU device, which every sunlit view binds at SKY_GROUP: one buffer, written once a frame by
 * whoever draws the sky (`write`), and a bind group for each pipeline that reads it. Nobody writing it leaves the
 * clear afternoon.
 */
export class SkyUniform {
  readonly buffer: GPUBuffer;
  /** For a pipeline laid out by hand: its group at SKY_GROUP. */
  readonly layout: GPUBindGroupLayout;
  private readonly device: GPUDevice;
  private readonly groups = new WeakMap<GPUPipelineBase, GPUBindGroup>();
  private shared: GPUBindGroup | null = null;
  look: SkyLook = AFTERNOON;

  constructor(device: GPUDevice) {
    this.device = device;
    // GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, spelled out where the browser's constants are not at hand.
    this.buffer = device.createBuffer({ size: (VEC4S + SHELTER_VEC4S) * 16, usage: 0x40 | 0x8 });
    // GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT.
    this.layout = device.createBindGroupLayout({ entries: [{ binding: 0, visibility: 0x1 | 0x2, buffer: {} }] });
    this.empty = device.createBindGroupLayout({ entries: [] });
    this.write(AFTERNOON, []);
  }

  write(
    look: SkyLook,
    lamps: readonly Lamp[],
    eye?: readonly [number, number, number],
    shelterPlace?: readonly [number, number, number, number],
  ): void {
    this.look = look;
    this.device.queue.writeBuffer(this.buffer, 0, skyNumbers(look, lamps, eye, shelterPlace));
  }

  /** Lays a shelter grid's undersides (`shelter.ts`) after the rows written each frame. */
  writeShelter(undersides: Float32Array): void {
    this.device.queue.writeBuffer(this.buffer, VEC4S * 16, undersides);
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
