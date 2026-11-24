// How the islands are coloured and drawn on the GPU: each part's colour by climate, the shaders for the ground and the
// instanced modules (drawn, and cast into the sun's shadow map), their vertex layouts and their pipelines.
import type { Gpu } from '../gpu.ts';
import { SHADOW_CAST_WGSL, SHADOW_WGSL, shadowLayouts } from '../shadow.ts';
import { skyUniformFor } from '../sky/skyUniform.ts';
import { SHARED_WGSL } from '../water/waterCommon.ts';
import { SAMPLES } from '../water/waterView.ts';
import { GROUND_FLOATS } from './isleGround.ts';
import { kitOfClimate, PARTS, VERTEX_BYTES } from './isleModules.ts';

/** Floats an instance: where it stands (x, y, z), its scale, its turn's sine and cosine, its lift, and one spare. */
export const INSTANCE_FLOATS = 8;
/** Floats in an island's uniform: its offset from the eye, its ground's two colours and snow line, each part's. */
export const ISLE_FLOATS = 12 + PARTS.length * 4;

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
struct Frame { from_eye: mat4x4f };
struct Isle {
  offset: vec4f,
  inland: vec4f,
  high: vec4f,
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
const SAND = vec3f(0.84, 0.76, 0.56);
const WET = 0.72;
const SEABED = vec3f(0.5, 0.52, 0.4);
const DEEP_BED = vec3f(0.24, 0.3, 0.3);
const SNOW = vec3f(0.93, 0.94, 0.96);
// Where the tide reaches up the beach, and how high and gentle a beach runs, metres.
const TIDE_M = 0.5;
const BEACH_M = 2.2;

struct Lit {
  @builtin(position) clip: vec4f,
  @location(0) from_eye: vec3f,
  @location(1) normal: vec3f,
  @location(2) local: vec3f,
  @location(3) @interpolate(flat) part: u32,
};

// value_noise is the shared WGSL's.

@vertex
fn ground_vertex(@location(0) position: vec3f, @location(1) normal: vec3f) -> Lit {
  var out: Lit;
  out.from_eye = position + isle.offset.xyz;
  out.clip = frame.from_eye * vec4f(out.from_eye, 1.0);
  out.normal = normal;
  out.local = position;
  out.part = 0u;
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
@fragment
fn ground_fragment(surface: Lit, @builtin(front_facing) front: bool) -> @location(0) vec4f {
  let normal = normalize(surface.normal);
  let z = surface.local.z;
  let slope = length(normal.xy) / max(normal.z, 0.05);
  // The ground's rock is the kit's own stone; its grain a fine noise over patches some 30 m across.
  let rock = isle.parts[${PARTS.indexOf('rock')}].rgb;
  let grain = value_noise(surface.local.xy * 0.35) * 0.45 + value_noise(surface.local.xy * 0.033) * 0.55;
  let inland = mix(isle.inland.rgb, isle.high.rgb, smoothstep(8.0, 40.0, z + grain * 6.0));
  let bare = mix(inland, rock * (0.85 + 0.3 * grain), smoothstep(0.55, 0.95, slope));
  let snowy = mix(bare, SNOW, smoothstep(isle.high.w - 2.0, isle.high.w + 2.0, z + grain * 4.0) * (1.0 - smoothstep(0.9, 1.3, slope)));
  let beach = (1.0 - smoothstep(BEACH_M - 0.6, BEACH_M + 0.6 + grain, z)) * (1.0 - smoothstep(0.25, 0.45, slope));
  var dry = mix(snowy, SAND * (0.92 + 0.16 * grain), beach);
  dry = mix(dry, SAND * WET, 1.0 - smoothstep(TIDE_M - 0.2, TIDE_M + 0.2, z));
  let depth = max(-z, 0.0);
  let bed = mix(mix(SAND * WET, SEABED, smoothstep(0.5, 8.0, depth)), DEEP_BED, smoothstep(8.0, 40.0, depth));
  let colour = mix(dry, mix(bed, rock * 0.8, smoothstep(0.6, 1.0, slope)), smoothstep(-0.05, 0.05, -z));
  return vec4f(lit(colour * (0.84 + 0.3 * grain), normal, surface.from_eye), 1.0);
}

@fragment
fn module_fragment(surface: Lit, @builtin(front_facing) front: bool) -> @location(0) vec4f {
  let wears = isle.parts[surface.part];
  let normal = select(-1.0, 1.0, front) * normalize(surface.normal);
  let grain = value_noise(surface.local.xy * 1.7 + surface.local.z * 0.9);
  let colour = wears.rgb * (0.9 + 0.2 * grain);
  // An ember glows by itself.
  return vec4f(select(lit(colour, normal, surface.from_eye), colour, wears.w > 0.5), 1.0);
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
