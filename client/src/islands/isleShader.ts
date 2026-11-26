// How the islands are coloured and drawn on the GPU: each part's colour by climate, the shaders for the ground and the
// instanced modules (drawn, and cast into the sun's shadow map), their vertex layouts and their pipelines. The ground
// and the rock wear the land's ground tiles (groundGrain.ts) in the island's climate.
import type { Gpu } from '../gpu.ts';
import { SHADOW_CAST_WGSL, SHADOW_WGSL, shadowLayouts } from '../shadow.ts';
import { LIGHT_MOTION_WGSL } from '../sky/flicker.ts';
import { skyUniformFor } from '../sky/skyUniform.ts';
import { SHARED_WGSL } from '../water/waterCommon.ts';
import { SAMPLES } from '../water/waterView.ts';
import { TILE_GRAIN_WGSL } from '../groundGrain.ts';
import { GROUND_FLOATS } from './isleGround.ts';
import { kitOfClimate, PARTS, VERTEX_BYTES } from './isleModules.ts';

/** Floats an instance: where it stands (x, y, z), its scale, its turn's sine and cosine, its lift, and whether its
 *  ember stands cold. */
export const INSTANCE_FLOATS = 8;
/** Floats in an island's uniform: its offset from the eye, its ground's two colours and snow line, the ground tiles its
 *  low and high ground wear (`groundTilesOf`), each part's colour. */
export const ISLE_FLOATS = 16 + PARTS.length * 4;
/** Where the parts' colours start in an island's uniform. */
export const PARTS_FLOAT = 16;

type Colour = readonly [number, number, number];
const BASE_PARTS: Readonly<Record<string, Colour>> = {
  rock: [0.45, 0.44, 0.42],
  rockAlt: [0.38, 0.36, 0.34],
  sand: [0.8, 0.72, 0.54],
  earth: [0.42, 0.33, 0.23],
  grass: [0.36, 0.48, 0.22],
  bark: [0.33, 0.25, 0.18],
  leaf: [0.24, 0.4, 0.16],
  leafAlt: [0.32, 0.46, 0.18],
  wood: [0.48, 0.36, 0.24],
  plank: [0.55, 0.42, 0.28],
  rope: [0.62, 0.53, 0.36],
  iron: [0.28, 0.28, 0.3],
  stone: [0.6, 0.58, 0.53],
  stoneAlt: [0.5, 0.48, 0.45],
  moss: [0.3, 0.4, 0.18],
  snow: [0.92, 0.93, 0.95],
  cloth: [0.62, 0.22, 0.17],
  ember: [1.0, 0.5, 0.15],
};
/** Each biome kit's own stone and growth: sandstone and olive in the arid, basalt and deep green in the tropics,
 *  slate and dark firs in the frozen. */
const KIT_PARTS: Readonly<Record<string, Readonly<Record<string, Colour>>>> = {
  arid: {
    rock: [0.66, 0.52, 0.38],
    rockAlt: [0.58, 0.44, 0.32],
    leaf: [0.42, 0.46, 0.24],
    leafAlt: [0.5, 0.5, 0.28],
    grass: [0.62, 0.56, 0.32],
  },
  tropical: {
    rock: [0.3, 0.3, 0.3],
    rockAlt: [0.24, 0.24, 0.25],
    leaf: [0.16, 0.42, 0.14],
    leafAlt: [0.26, 0.5, 0.16],
    grass: [0.26, 0.46, 0.16],
  },
  frozen: {
    rock: [0.4, 0.42, 0.45],
    rockAlt: [0.34, 0.36, 0.4],
    leaf: [0.16, 0.28, 0.18],
    leafAlt: [0.2, 0.32, 0.2],
    grass: [0.5, 0.5, 0.4],
  },
};

/** The colour each part wears on an island of `climate`, in `PARTS` order. */
export function partColours(climate: string): Colour[] {
  const own = KIT_PARTS[kitOfClimate(climate) ?? ''] ?? {};
  return PARTS.map((part) => own[part] ?? BASE_PARTS[part] ?? [1, 0, 1]);
}

const COMMON = /* wgsl */ `
// time.x: the scene's seconds, which a glowing ember flickers by.
struct Frame { from_eye: mat4x4f, time: vec4f };
struct Isle {
  offset: vec4f,
  inland: vec4f,
  high: vec4f,
  tiles: vec4f,
  parts: array<vec4f, ${PARTS.length}>,
};
@group(0) @binding(0) var<uniform> frame: Frame;
@group(0) @binding(1) var<uniform> isle: Isle;

// A module's point stood on the island, from the eye: turned clockwise from north, scaled, lifted, then placed.
fn placed(point: vec3f, at: vec4f, turn: vec4f) -> vec3f {
  let turned = vec2f(point.x * turn.y - point.y * turn.x, point.x * turn.x + point.y * turn.y);
  return vec3f(turned, point.z * turn.z) * at.w + at.xyz + isle.offset.xyz;
}
`;

export const DRAW_SHADER = /* wgsl */ `
${SHARED_WGSL}
${SHADOW_WGSL}
${COMMON}
@group(0) @binding(2) var ground_tiles: texture_2d_array<f32>;
@group(0) @binding(3) var tile_sampler: sampler;
${TILE_GRAIN_WGSL}
${LIGHT_MOTION_WGSL}
const SAND = vec3f(0.84, 0.76, 0.56);
const WET = 0.72;
const SEABED = vec3f(0.5, 0.52, 0.4);
const DEEP_BED = vec3f(0.24, 0.3, 0.3);
const SNOW = vec3f(0.93, 0.94, 0.96);
// Where the tide reaches up the beach, and how high and gentle a beach runs, metres.
const TIDE_M = 0.5;
const BEACH_M = 2.2;
// How far the rock's picture reaches before it repeats, metres, and its wider reading's.
const ROCK_M = 4.0;
const ROCK_WIDE_M = 13.7;
// A snow line this high is no snow line: the climates that never lie under snow (isleGround.ts GROUND_LOOKS).
const SNOWLESS_M = 5000.0;

struct Lit {
  @builtin(position) clip: vec4f,
  @location(0) from_eye: vec3f,
  @location(1) normal: vec3f,
  @location(2) local: vec3f,
  @location(3) @interpolate(flat) part: u32,
  @location(4) @interpolate(flat) cold: f32,
};

// value_noise is the shared WGSL's.

// A ground tile's grain at a point of the island's own frame, whose small numbers keep the tiles exact.
fn isle_grain(layer: i32, at: vec2f) -> vec3f {
  return tile_grain_at(layer, at / TILE_M, TURN * at / WIDE_TILE_M);
}

// The climate's caverns' rock cast on a face at a point of the island, its beds level, so a cliff's is not stretched
// down it: read plainly and again wider and shifted, as the ground's tiles are, so its repeats do not line up.
fn isle_rock(at: vec3f, normal: vec3f) -> vec3f {
  let near = rock_cast(at / ROCK_M, normal);
  let wide = rock_cast(at / ROCK_WIDE_M + vec3f(0.37, 0.61, 0.23), normal);
  // A face turned up (a boulder's top, a cliff's brow) is the ground's stone, as bare rock on the land is.
  let top = isle_grain(STONE_TILE, at.xy);
  return mix(near * mix(vec3f(1.0), wide, 0.5), top, smoothstep(0.7, 0.95, normal.z));
}

// The rock picture cast at a point given in its repeats, each height's beds slid along by a smooth noise, so the
// picture's streaks do not stand in columns a repeat apart.
fn rock_cast(at: vec3f, normal: vec3f) -> vec3f {
  let slide = value_noise(vec2f(at.z * 0.8, 3.1)) * 2.5;
  return cast_grain(ROCK_TILE, vec2f(at.y + slide, -at.z), vec2f(at.x + slide, -at.z), at.xy, normal);
}

@vertex
fn ground_vertex(@location(0) position: vec3f, @location(1) normal: vec3f) -> Lit {
  var out: Lit;
  out.from_eye = position + isle.offset.xyz;
  out.clip = frame.from_eye * vec4f(out.from_eye, 1.0);
  out.normal = normal;
  out.local = position;
  out.part = 0u;
  out.cold = 0.0;
  return out;
}

@vertex
fn module_vertex(
  @location(0) position: vec3f,
  @location(1) normal: vec4f,
  @location(2) part: vec4u,
  @location(3) at: vec4f,
  @location(4) turn: vec4f,
) -> Lit {
  var out: Lit;
  out.from_eye = placed(position, at, turn);
  out.clip = frame.from_eye * vec4f(out.from_eye, 1.0);
  // A height lifted by 'lift' takes a normal's up over it, the inverse transpose of the stretch.
  let turned = vec2f(normal.x * turn.y - normal.y * turn.x, normal.x * turn.x + normal.y * turn.y);
  out.normal = normalize(vec3f(turned, normal.z / max(turn.z, 1e-3)));
  out.local = out.from_eye - isle.offset.xyz;
  out.part = part.x;
  out.cold = turn.w;
  return out;
}

// The land's light: the sky's, the key light where the shadows and the clouds let it, and the lamps near.
fn lit(colour: vec3f, normal: vec3f, from_eye: vec3f) -> vec3f {
  let direct = max(dot(normal, sky_state.key.xyz), 0.0);
  // A face turned from the sun takes no shadow: its map is not read.
  var sun = sky_dapple(from_eye);
  if (direct > 0.0) {
    sun *= sunlit(from_eye, normal);
  }
  return colour * (sky_ambient(normal) + sky_direct(normal, sun) + sky_lamps(from_eye, normal));
}

// The ground by its height and slope: the seabed under water, wet sand below the tide's reach, a beach up to its
// low gentle ground, the climate's ground inland turning to its high ground, rock where steep and snow above its line.
// Each wears its ground tile's grain, and one gives way to the next by their grains (meet), as the land's do.
@fragment
fn ground_fragment(surface: Lit, @builtin(front_facing) front: bool) -> @location(0) vec4f {
  let normal = normalize(surface.normal);
  let z = surface.local.z;
  let at = surface.local.xy;
  let slope = length(normal.xy) / max(normal.z, 0.05);
  // The ground's rock is the kit's own stone; its grain a fine noise over patches some 30 m across.
  let rock = isle.parts[${PARTS.indexOf('rock')}].rgb;
  let grain = value_noise(at * 0.35) * 0.45 + value_noise(at * 0.033) * 0.55;
  let inland_grain = isle_grain(i32(isle.tiles.x), at);
  // A tile read once where the high ground wears the low ground's (a hollow's one floor), and snow only on an island
  // with a snow line: each island's own uniform, so the branches hold for every pixel alike.
  var high_grain = inland_grain;
  if (isle.tiles.y != isle.tiles.x) {
    high_grain = isle_grain(i32(isle.tiles.y), at);
  }
  var snow_grain = vec3f(1.0);
  if (isle.high.w < SNOWLESS_M) {
    snow_grain = isle_grain(SNOW_TILE, at);
  }
  let rock_grain = isle_rock(surface.local, normal);
  let sand_grain = isle_grain(SAND_TILE, at);
  var land = vec4f(isle.inland.rgb * inland_grain, raised(inland_grain));
  land = meet(land, vec4f(isle.high.rgb * high_grain, raised(high_grain)), smoothstep(8.0, 40.0, z + grain * 6.0));
  let bare = rock * (0.85 + 0.3 * grain) * rock_grain;
  land = meet(land, vec4f(bare, raised(rock_grain) + ROCK_STANDS), smoothstep(0.55, 0.95, slope));
  let snowy = smoothstep(isle.high.w - 2.0, isle.high.w + 2.0, z + grain * 4.0) * (1.0 - smoothstep(0.9, 1.3, slope));
  land = meet(land, vec4f(SNOW * snow_grain, SNOW_SETTLES - raised(snow_grain)), snowy);
  let beach = (1.0 - smoothstep(BEACH_M - 0.6, BEACH_M + 0.6 + grain, z)) * (1.0 - smoothstep(0.25, 0.45, slope));
  let sand = SAND * sand_grain;
  land = meet(land, vec4f(sand * (0.92 + 0.16 * grain), raised(sand_grain)), beach);
  let dry = mix(land.rgb, sand * WET, 1.0 - smoothstep(TIDE_M - 0.2, TIDE_M + 0.2, z));
  let depth = max(-z, 0.0);
  let bed = mix(mix(sand * WET, SEABED, smoothstep(0.5, 8.0, depth)), DEEP_BED, smoothstep(8.0, 40.0, depth));
  let colour = mix(dry, mix(bed, rock * 0.8 * rock_grain, smoothstep(0.6, 1.0, slope)), smoothstep(-0.05, 0.05, -z));
  return vec4f(lit(colour * (0.84 + 0.3 * grain), normal, surface.from_eye), 1.0);
}

@fragment
fn module_fragment(surface: Lit, @builtin(front_facing) front: bool) -> @location(0) vec4f {
  // An ember glows by itself; one stood cold (a lamp unlit) is the kit's stone, lit as any.
  let own = isle.parts[surface.part];
  let cold = own.w > 0.5 && surface.cold > 0.5;
  let wears = select(own, vec4f(isle.parts[${PARTS.indexOf('stone')}].rgb, 0.0), cold);
  let normal = select(-1.0, 1.0, front) * normalize(surface.normal);
  let grain = value_noise(surface.local.xy * 1.7 + surface.local.z * 0.9);
  // The rock (cliffs, stacks, boulders, a hollow's walls) wears the climate's caverns' rock cast on its faces.
  let rock_grain = isle_rock(surface.local, normal);
  let rocky = surface.part == ${PARTS.indexOf('rock')}u || surface.part == ${PARTS.indexOf('rockAlt')}u;
  let colour = wears.rgb * (0.9 + 0.2 * grain) * select(vec3f(1.0), rock_grain, rocky);
  if wears.w > 0.5 {
    return vec4f(colour * ember_motion(surface.from_eye, surface.local), 1.0);
  }
  return vec4f(lit(colour, normal, surface.from_eye), 1.0);
}

// How a glowing ember moves: with its own lamp where one is lit near it (a lantern's glass with its flame, a camp's
// coals with its fire); else by where in its module it glows.
fn ember_motion(from_eye: vec3f, local: vec3f) -> f32 {
  let own = 1.0 + min(light_phase(dot(floor(local), vec3f(13.0, 7.0, 1.0))), 0.999);
  let near = sky_lamp_motion(from_eye);
  return light_motion(select(own, near, near > 0.0), frame.time.x);
}
`;

export const CAST_SHADER = /* wgsl */ `
${SHADOW_CAST_WGSL}
${COMMON}
@vertex
fn module_vertex(@location(0) position: vec3f, @location(3) at: vec4f, @location(4) turn: vec4f) -> @builtin(position) vec4f {
  return shadow.from_eye * vec4f(placed(position, at, turn), 1.0);
}
`;

const GROUND_LAYOUT: GPUVertexBufferLayout = {
  arrayStride: GROUND_FLOATS * 4,
  attributes: [
    { shaderLocation: 0, offset: 0, format: 'float32x3' },
    { shaderLocation: 1, offset: 12, format: 'float32x3' },
  ],
};
const MODULE_LAYOUTS: GPUVertexBufferLayout[] = [
  {
    arrayStride: VERTEX_BYTES,
    attributes: [
      { shaderLocation: 0, offset: 0, format: 'float32x3' },
      { shaderLocation: 1, offset: 12, format: 'snorm8x4' },
      { shaderLocation: 2, offset: 24, format: 'uint8x4' },
    ],
  },
  {
    arrayStride: INSTANCE_FLOATS * 4,
    stepMode: 'instance',
    attributes: [
      { shaderLocation: 3, offset: 0, format: 'float32x4' },
      { shaderLocation: 4, offset: 16, format: 'float32x4' },
    ],
  },
];
const CAST_MODULE_LAYOUTS: GPUVertexBufferLayout[] = [
  { arrayStride: VERTEX_BYTES, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }] },
  MODULE_LAYOUTS[1] as GPUVertexBufferLayout,
];

export interface Pipelines {
  readonly group: GPUBindGroupLayout;
  readonly ground: GPURenderPipeline;
  readonly modules: GPURenderPipeline;
  readonly castModules: GPURenderPipeline;
}

const made = new WeakMap<GPUDevice, Map<GPUTextureFormat, Pipelines>>();

export function pipelinesOf(gpu: Gpu): Pipelines {
  const byFormat = made.get(gpu.device) ?? new Map<GPUTextureFormat, Pipelines>();
  made.set(gpu.device, byFormat);
  const known = byFormat.get(gpu.format);
  if (known) return known;
  const { device } = gpu;
  const both = 0x1 | 0x2;
  const group = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: both, buffer: { type: 'uniform' } },
      { binding: 1, visibility: both, buffer: { type: 'uniform' } },
      { binding: 2, visibility: 0x2, texture: { viewDimension: '2d-array' } },
      { binding: 3, visibility: 0x2, sampler: {} },
    ],
  });
  const { caster, receiver } = shadowLayouts(device);
  const sky = skyUniformFor(device);
  const drawLayout = device.createPipelineLayout({ bindGroupLayouts: [group, receiver, sky.empty, sky.layout] });
  const castLayout = device.createPipelineLayout({ bindGroupLayouts: [group, caster] });
  const draw = device.createShaderModule({ code: DRAW_SHADER });
  const cast = device.createShaderModule({ code: CAST_SHADER });
  const drawing = (vertex: string, fragment: string, buffers: GPUVertexBufferLayout[]) =>
    device.createRenderPipeline({
      layout: drawLayout,
      vertex: { module: draw, entryPoint: vertex, buffers },
      fragment: { module: draw, entryPoint: fragment, targets: [{ format: gpu.format }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'greater' },
      multisample: { count: SAMPLES },
    });
  const casting = (vertex: string, buffers: GPUVertexBufferLayout[]) =>
    device.createRenderPipeline({
      layout: castLayout,
      vertex: { module: cast, entryPoint: vertex, buffers },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less' },
    });
  const pipelines = {
    group,
    ground: drawing('ground_vertex', 'ground_fragment', [GROUND_LAYOUT]),
    modules: drawing('module_vertex', 'module_fragment', MODULE_LAYOUTS),
    castModules: casting('module_vertex', CAST_MODULE_LAYOUTS),
  };
  byFormat.set(gpu.format, pipelines);
  return pipelines;
}
