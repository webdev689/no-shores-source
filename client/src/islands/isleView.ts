// The sea's islands drawn: each at its world place, its ground and its modules, by distance. Near (under about
// 1.5 km) its fine ground and every module; then its coarse ground with its trees and cliffs; past about 6 km its
// coarse ground alone; past 20 km nothing. The modules are instanced: each kit's pack is one vertex buffer, and an
// island's placements one instance buffer sorted by module, so a draw is one module's every placement on the island.
// A drawer of the same shape as the game's scene takes (client/src/game/scene.ts `Drawer`), by structure.
import { BUFFER_USAGE, type Gpu } from '../gpu.ts';
import { SHADOW_CAST_WGSL, SHADOW_WGSL, type ShadowMap, shadowLayouts } from '../shadow.ts';
import { SHARED_WGSL } from '../water/waterCommon.ts';
import { SAMPLES } from '../water/waterView.ts';
import { FAR_STRIDE, GROUND_FLOATS, type GroundMesh, groundHeight, groundLook, groundMesh } from './isleGround.ts';
import {
  type IsleManifest,
  type KitPack,
  kitOfClimate,
  kitOfModule,
  loadKitPack,
  MODULE_NAMES,
  packUrl,
  PARTS,
  roleOf,
  VERTEX_BYTES,
} from './isleModules.ts';
import { gridOf, type IsleGrid, type IslePlacement, type IsleShown } from './islePlan.ts';

/** Where the eye is, world metres; the rest of a shot (yaw, pitch, field of view) is the scene's. */
export interface IsleShot {
  readonly eye: readonly [number, number, number];
}

/** How far from an island's coast its fine ground and every module are drawn, metres. */
export const NEAR_M = 1500;
/** How far its trees and cliffs are drawn over its coarse ground. */
export const MIDDLE_M = 6000;
/** How far it is drawn at all: it is seen from far off, as ships are. */
export const FARTHEST_M = 20_000;
/** The roles still drawn between `NEAR_M` and `MIDDLE_M`. */
const MIDDLE_ROLES: ReadonlySet<string> = new Set(['tree', 'cliff', 'stack']);

/** Floats an instance: where it stands (x, y, z), its scale, its turn's sine and cosine, its lift, and one spare. */
const INSTANCE_FLOATS = 8;
/** Floats in an island's uniform: its offset from the eye, its ground's two colours and snow line, each part's. */
const ISLE_FLOATS = 12 + PARTS.length * 4;

/** A module's turn and scale on the island, as the shader does it: its point turned clockwise from north (x east,
 *  y south: x' = x cos t - y sin t, y' = x sin t + y cos t), scaled, its height lifted again, then stood at its place.
 *  What `isle::dressing::blocks` does to a solid's middle. */
export function placedPoint(
  [x, y, z]: readonly [number, number, number],
  [, atX, atY, atZ, turn, scale, lift]: IslePlacement,
): [number, number, number] {
  const [sine, cosine] = [Math.sin(turn), Math.cos(turn)];
  return [atX + (x * cosine - y * sine) * scale, atY + (x * sine + y * cosine) * scale, atZ + z * scale * lift];
}

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

const DRAW_SHADER = /* wgsl */ `
${SHARED_WGSL}
${SHADOW_WGSL}
${COMMON}
const AMBIENT = 0.35;
const SAND = vec3f(0.84, 0.76, 0.56);
const WET = 0.72;
const SEABED = vec3f(0.5, 0.52, 0.4);
const DEEP_BED = vec3f(0.24, 0.3, 0.3);
const ROCK = vec3f(0.46, 0.45, 0.43);
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

fn hash(cell: vec2f) -> f32 {
  return fract(sin(dot(cell, vec2f(127.1, 311.7))) * 43758.5453);
}
fn value_noise(point: vec2f) -> f32 {
  let cell = floor(point);
  let along = fract(point);
  let eased = along * along * (3.0 - 2.0 * along);
  let top = mix(hash(cell), hash(cell + vec2f(1.0, 0.0)), eased.x);
  let bottom = mix(hash(cell + vec2f(0.0, 1.0)), hash(cell + vec2f(1.0, 1.0)), eased.x);
  return mix(top, bottom, eased.y);
}

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

fn lit(colour: vec3f, normal: vec3f, from_eye: vec3f) -> vec3f {
  let direct = max(dot(normal, SUN), 0.0);
  let sun = select(1.0, sunlit(from_eye, normal), direct > 0.0);
  return colour * (AMBIENT + (1.0 - AMBIENT) * direct * sun);
}

// The ground by its height and slope: the seabed under water, wet sand below the tide's reach, a beach up to its
// low gentle ground, the climate's ground inland turning to its high ground, rock where steep and snow above its line.
@fragment
fn ground_fragment(surface: Lit, @builtin(front_facing) front: bool) -> @location(0) vec4f {
  let normal = normalize(surface.normal);
  let z = surface.local.z;
  let slope = length(normal.xy) / max(normal.z, 0.05);
  let grain = value_noise(surface.local.xy * 0.35) * 0.6 + value_noise(surface.local.xy * 0.07) * 0.4;
  let inland = mix(isle.inland.rgb, isle.high.rgb, smoothstep(8.0, 40.0, z + grain * 6.0));
  let bare = mix(inland, ROCK * (0.85 + 0.3 * grain), smoothstep(0.55, 0.95, slope));
  let snowy = mix(bare, SNOW, smoothstep(isle.high.w - 2.0, isle.high.w + 2.0, z + grain * 4.0) * (1.0 - smoothstep(0.9, 1.3, slope)));
  let beach = (1.0 - smoothstep(BEACH_M - 0.6, BEACH_M + 0.6 + grain, z)) * (1.0 - smoothstep(0.25, 0.45, slope));
  var dry = mix(snowy, SAND * (0.92 + 0.16 * grain), beach);
  dry = mix(dry, SAND * WET, 1.0 - smoothstep(TIDE_M - 0.2, TIDE_M + 0.2, z));
  let depth = max(-z, 0.0);
  let bed = mix(mix(SAND * WET, SEABED, smoothstep(0.5, 8.0, depth)), DEEP_BED, smoothstep(8.0, 40.0, depth));
  let colour = mix(dry, mix(bed, ROCK * 0.8, smoothstep(0.6, 1.0, slope)), smoothstep(-0.05, 0.05, -z));
  return vec4f(lit(colour * (0.94 + 0.12 * grain), normal, surface.from_eye), 1.0);
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

const CAST_SHADER = /* wgsl */ `
${SHADOW_CAST_WGSL}
${COMMON}
@vertex
fn ground_vertex(@location(0) position: vec3f) -> @builtin(position) vec4f {
  return shadow.from_eye * vec4f(position + isle.offset.xyz, 1.0);
}
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

interface Pipelines {
  readonly group: GPUBindGroupLayout;
  readonly ground: GPURenderPipeline;
  readonly modules: GPURenderPipeline;
  readonly castGround: GPURenderPipeline;
  readonly castModules: GPURenderPipeline;
}

const made = new WeakMap<GPUDevice, Map<GPUTextureFormat, Pipelines>>();

function pipelinesOf(gpu: Gpu): Pipelines {
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
  const drawLayout = device.createPipelineLayout({ bindGroupLayouts: [group, receiver] });
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
    castGround: casting('ground_vertex', [GROUND_LAYOUT]),
    castModules: casting('module_vertex', CAST_MODULE_LAYOUTS),
  };
  byFormat.set(gpu.format, pipelines);
  return pipelines;
}

/** One module's every placement on an island: its run in the island's instances. */
interface Run {
  readonly name: string;
  readonly kit: string;
  readonly middle: boolean;
  readonly first: number;
  readonly count: number;
}

interface Ground {
  readonly vertices: GPUBuffer;
  readonly indices: GPUBuffer;
  readonly count: number;
}

/** An island on the GPU. */
interface Drawn {
  readonly shown: IsleShown;
  readonly grid: IsleGrid;
  readonly near: Ground;
  readonly far: Ground;
  readonly instances: GPUBuffer | null;
  readonly runs: readonly Run[];
  readonly uniform: GPUBuffer;
  readonly group: GPUBindGroup;
  readonly kits: readonly string[];
}

/** A kit's pack on the GPU. */
interface Pack {
  readonly pack: KitPack;
  readonly vertices: GPUBuffer;
  readonly indices: GPUBuffer;
}

/** What the last frame drew: its triangles and draw calls, and how many islands at each distance. */
export interface IslesFrame {
  triangles: number;
  draws: number;
  near: number;
  middle: number;
  far: number;
}

/** The placements' instances sorted by module, and each module's run. */
export function instancesOf(placements: readonly IslePlacement[]): { floats: Float32Array; runs: Run[] } {
  const sorted = [...placements].sort((a, b) => a[0] - b[0]);
  const floats = new Float32Array(sorted.length * INSTANCE_FLOATS);
  const runs: Run[] = [];
  sorted.forEach((placement, index) => {
    const [module, x, y, z, turn, scale, lift] = placement;
    floats.set([x, y, z, scale, Math.sin(turn), Math.cos(turn), lift, 0], index * INSTANCE_FLOATS);
    const name = MODULE_NAMES[module] ?? '';
    const last = runs[runs.length - 1];
    if (last && last.name === name) runs[runs.length - 1] = { ...last, count: last.count + 1 };
    else
      runs.push({
        name,
        kit: kitOfModule(name),
        middle: MIDDLE_ROLES.has(roleOf(module) ?? ''),
        first: index,
        count: 1,
      });
  });
  return { floats, runs: runs.filter((run) => run.name !== '') };
}

export class IslesView {
  readonly frame: IslesFrame = { triangles: 0, draws: 0, near: 0, middle: 0, far: 0 };
  private readonly gpu: Gpu;
  private readonly pipelines: Pipelines;
  private readonly frameUniform: GPUBuffer;
  private readonly manifest: IsleManifest | null;
  private readonly prefix: string | null;
  private readonly onLoaded: () => void;
  private readonly packs = new Map<string, Pack>();
  private readonly asked = new Set<string>();
  private drawn: Drawn[] = [];

  /** `manifest` says where the kits' packs are published, `prefix` overrides it (a page's `?islePacks=`), and
   *  `onLoaded` is told when a pack comes, so the page draws again. */
  constructor(gpu: Gpu, manifest: IsleManifest | null, prefix: string | null, onLoaded: () => void = () => {}) {
    this.gpu = gpu;
    this.pipelines = pipelinesOf(gpu);
    this.manifest = manifest;
    this.prefix = prefix;
    this.onLoaded = onLoaded;
    this.frameUniform = gpu.device.createBuffer({
      size: 64,
      usage: BUFFER_USAGE.uniform | BUFFER_USAGE.copyDestination,
    });
  }

  /** Shows these islands, and no others: one shown before with the same id, climate and plan is kept as it is. */
  show(isles: readonly IsleShown[]): void {
    const kept = new Map(this.drawn.map((drawn) => [drawn.shown.id, drawn]));
    const next: Drawn[] = [];
    for (const shown of isles) {
      const known = kept.get(shown.id);
      if (known && known.shown.plan === shown.plan && known.shown.climate === shown.climate) {
        kept.delete(shown.id);
        next.push(known.shown === shown ? known : { ...known, shown });
      } else next.push(this.build(shown));
    }
    for (const gone of kept.values()) this.destroy(gone);
    this.drawn = next;
    // A pack that failed is asked for again by the next show.
    for (const kit of new Set(next.flatMap((drawn) => drawn.kits))) this.ask(kit);
  }

  /** The ground's height at a world point: the nearest shown island's there, null off every island. */
  groundAt(x: number, y: number): number | null {
    let best: { height: number; distance: number } | null = null;
    for (const { shown, grid } of this.drawn) {
      const [east, south] = [x - shown.at[0], y - shown.at[1]];
      const height = groundHeight(grid, east, south);
      const distance = Math.hypot(east, south);
      if (height !== null && (!best || distance < best.distance)) best = { height, distance };
    }
    return best?.height ?? null;
  }

  castInto(pass: GPURenderPassEncoder, _fromEye: Float32Array, shot: IsleShot, _time: number, shadow: ShadowMap): void {
    this.prepare(shot);
    const { castGround, castModules } = this.pipelines;
    for (const drawn of this.drawn) {
      if (this.distanceOf(drawn, shot) >= NEAR_M) continue;
      const { offset, reach } = this.placeOf(drawn, shot);
      const low = [offset[0] - reach, offset[1] - reach, offset[2] - 40] as const;
      const high = [offset[0] + reach, offset[1] + reach, offset[2] + 120] as const;
      if (!shadow.reaches(low, high)) continue;
      pass.setPipeline(castGround);
      pass.setBindGroup(0, drawn.group);
      pass.setBindGroup(1, shadow.casterGroup(castGround));
      this.drawGround(pass, drawn.near);
      pass.setPipeline(castModules);
      pass.setBindGroup(0, drawn.group);
      pass.setBindGroup(1, shadow.casterGroup(castModules));
      this.drawModules(pass, drawn, false, null);
    }
  }

  drawInto(pass: GPURenderPassEncoder, fromEye: Float32Array, shot: IsleShot, _time: number, shadow: ShadowMap): void {
    this.gpu.device.queue.writeBuffer(this.frameUniform, 0, fromEye);
    this.prepare(shot);
    const frame = this.frame;
    [frame.triangles, frame.draws, frame.near, frame.middle, frame.far] = [0, 0, 0, 0, 0];
    const { ground, modules } = this.pipelines;
    for (const drawn of this.drawn) {
      const distance = this.distanceOf(drawn, shot);
      if (distance >= FARTHEST_M) continue;
      const near = distance < NEAR_M;
      if (near) frame.near++;
      else if (distance < MIDDLE_M) frame.middle++;
      else frame.far++;
      pass.setPipeline(ground);
      pass.setBindGroup(0, drawn.group);
      pass.setBindGroup(1, shadow.receiverGroup(ground));
      this.drawGround(pass, near ? drawn.near : drawn.far, frame);
      if (distance >= MIDDLE_M) continue;
      pass.setPipeline(modules);
      pass.setBindGroup(0, drawn.group);
      pass.setBindGroup(1, shadow.receiverGroup(modules));
      this.drawModules(pass, drawn, !near, frame);
    }
  }

  /** Lets every island's buffers go. */
  destroy(drawn?: Drawn): void {
    const all = drawn ? [drawn] : this.drawn;
    for (const each of all) {
      for (const buffer of [
        each.near.vertices,
        each.near.indices,
        each.far.vertices,
        each.far.indices,
        each.uniform,
        each.instances,
      ])
        buffer?.destroy();
    }
    if (!drawn) this.drawn = [];
  }

  private distanceOf(drawn: Drawn, shot: IsleShot): number {
    const [x, y] = drawn.shown.at;
    return Math.max(0, Math.hypot(shot.eye[0] - x, shot.eye[1] - y) - drawn.shown.plan.reach);
  }

  private placeOf(drawn: Drawn, shot: IsleShot): { offset: [number, number, number]; reach: number } {
    const [x, y] = drawn.shown.at;
    const offset: [number, number, number] = [x - shot.eye[0], y - shot.eye[1], -shot.eye[2]];
    return { offset, reach: drawn.shown.plan.reach + 60 };
  }

  /** Writes each island's offset from the eye, worked out in doubles so the GPU's floats keep their centimetres. */
  private prepare(shot: IsleShot): void {
    for (const drawn of this.drawn) {
      const { offset } = this.placeOf(drawn, shot);
      this.gpu.device.queue.writeBuffer(drawn.uniform, 0, new Float32Array([...offset, 0]));
    }
  }

  private drawGround(pass: GPURenderPassEncoder, ground: Ground, frame?: IslesFrame): void {
    if (ground.count === 0) return;
    pass.setVertexBuffer(0, ground.vertices);
    pass.setIndexBuffer(ground.indices, 'uint32');
    pass.drawIndexed(ground.count);
    if (frame) {
      frame.triangles += ground.count / 3;
      frame.draws++;
    }
  }

  private drawModules(pass: GPURenderPassEncoder, drawn: Drawn, middleOnly: boolean, frame: IslesFrame | null): void {
    if (!drawn.instances) return;
    pass.setVertexBuffer(1, drawn.instances);
    let bound: Pack | null = null;
    for (const run of drawn.runs) {
      if (middleOnly && !run.middle) continue;
      const pack = this.packs.get(run.kit);
      const entry = pack?.pack.modules.get(run.name);
      if (!pack || !entry || entry.indexCount === 0) continue;
      if (pack !== bound) {
        pass.setVertexBuffer(0, pack.vertices);
        pass.setIndexBuffer(pack.indices, 'uint32');
        bound = pack;
      }
      pass.drawIndexed(entry.indexCount, run.count, entry.indexStart, entry.vertexStart, run.first);
      if (frame) {
        frame.triangles += (entry.indexCount / 3) * run.count;
        frame.draws++;
      }
    }
  }

  private ask(kit: string): void {
    if (this.packs.has(kit) || this.asked.has(kit)) return;
    const url = packUrl(kit, this.manifest, this.prefix);
    if (!url) return;
    this.asked.add(kit);
    void loadKitPack(kit, url).then((pack) => {
      this.asked.delete(kit);
      if (!pack) return;
      const upload = (data: Uint8Array | Uint32Array, usage: number) => {
        const buffer = this.gpu.device.createBuffer({
          size: Math.max(4, Math.ceil(data.byteLength / 4) * 4),
          usage: usage | BUFFER_USAGE.copyDestination,
        });
        this.gpu.device.queue.writeBuffer(buffer, 0, data.buffer, data.byteOffset, Math.ceil(data.byteLength / 4) * 4);
        return buffer;
      };
      this.packs.set(kit, {
        pack,
        vertices: upload(pack.vertices, BUFFER_USAGE.vertex),
        indices: upload(pack.indices, BUFFER_USAGE.index),
      });
      this.onLoaded();
    });
  }

  private uploadGround(mesh: GroundMesh): Ground {
    const make = (data: Float32Array | Uint32Array, usage: number) => {
      const buffer = this.gpu.device.createBuffer({
        size: Math.max(4, data.byteLength),
        usage: usage | BUFFER_USAGE.copyDestination,
      });
      if (data.byteLength > 0) this.gpu.device.queue.writeBuffer(buffer, 0, data);
      return buffer;
    };
    return {
      vertices: make(mesh.vertices, BUFFER_USAGE.vertex),
      indices: make(mesh.indices, BUFFER_USAGE.index),
      count: mesh.indices.length,
    };
  }

  private build(shown: IsleShown): Drawn {
    const { device } = this.gpu;
    const grid = gridOf(shown.heights);
    const { floats, runs } = instancesOf(shown.plan.placements);
    let instances: GPUBuffer | null = null;
    if (floats.byteLength > 0) {
      instances = device.createBuffer({
        size: floats.byteLength,
        usage: BUFFER_USAGE.vertex | BUFFER_USAGE.copyDestination,
      });
      device.queue.writeBuffer(instances, 0, floats);
    }
    const look = groundLook(shown.climate);
    const isle = new Float32Array(ISLE_FLOATS);
    isle.set([...look.inland, 0, ...look.high, look.snowM], 4);
    partColours(shown.climate).forEach((colour, part) =>
      isle.set([...colour, PARTS[part] === 'ember' ? 1 : 0], 12 + part * 4),
    );
    const uniform = device.createBuffer({
      size: isle.byteLength,
      usage: BUFFER_USAGE.uniform | BUFFER_USAGE.copyDestination,
    });
    device.queue.writeBuffer(uniform, 0, isle);
    const group = device.createBindGroup({
      layout: this.pipelines.group,
      entries: [
        { binding: 0, resource: { buffer: this.frameUniform } },
        { binding: 1, resource: { buffer: uniform } },
      ],
    });
    const biome = kitOfClimate(shown.climate);
    return {
      shown,
      grid,
      near: this.uploadGround(groundMesh(grid)),
      far: this.uploadGround(groundMesh(grid, FAR_STRIDE)),
      instances,
      runs,
      uniform,
      group,
      kits: [...new Set([...(biome ? [biome] : []), ...runs.map((run) => run.kit)])],
    };
  }
}
