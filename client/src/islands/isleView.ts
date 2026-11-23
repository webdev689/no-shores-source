// The sea's islands drawn: each at its world place, its ground and its modules, by distance. Near (under about
// 1.5 km) its fine ground and every module; then its coarse ground with its trees and cliffs; past about 6 km its
// coarse ground alone; past 20 km nothing. The modules are instanced: each kit's pack is one vertex buffer, and an
// island's placements one instance buffer sorted by module, so a draw is one module's every placement on the island.
// A drawer of the same shape as the game's scene takes (client/src/game/scene.ts `Drawer`), by structure.
import { boxSeen, viewPlanes } from '../frustum.ts';
import { BUFFER_USAGE, type Gpu } from '../gpu.ts';
import type { ShadowMap } from '../shadow.ts';
import { skyUniformFor } from '../sky/skyUniform.ts';
import { FAR_STRIDE, type GroundMesh, groundHeight, groundLook, groundMesh } from './isleGround.ts';
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
  sizeOf,
} from './isleModules.ts';
import { INSTANCE_FLOATS, ISLE_FLOATS, partColours, type Pipelines, pipelinesOf } from './isleShader.ts';
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
/** The modules that grow: the game hands them to the land's plants to draw instead (`leaves`). */
export const GROWTH_ROLES: ReadonlySet<string> = new Set(['tree', 'shrub', 'grass']);

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

/** How far below its foot a module's skirt reaches, a share of its height's scale (Island Modules' 0.8 m). */
const SKIRT_M = 0.8;

/** The box round everything an island draws, in its own frame (west, north, low, then east, south, high): its whole
 *  ground and every module placed on it, each its contract's size about its place, however it is turned. Made once
 *  an island, for every view that culls it. */
export function isleBox(
  grid: IsleGrid,
  placements: readonly IslePlacement[],
): [number, number, number, number, number, number] {
  const box = [
    grid.west,
    grid.north,
    Infinity,
    grid.west + grid.columns * grid.cell,
    grid.north + grid.rows * grid.cell,
    -Infinity,
  ];
  for (const height of grid.heights)
    if (Number.isFinite(height)) [box[2], box[5]] = [Math.min(box[2] ?? 0, height), Math.max(box[5] ?? 0, height)];
  for (const [module, x, y, z, , scale, lift] of placements) {
    const [width = 0, depth = 0, height = 0] = sizeOf(module) ?? [];
    const reach = (Math.hypot(width, depth) / 2) * scale;
    const [foot, top] = [z - SKIRT_M * scale * lift, z + height * scale * lift];
    box[0] = Math.min(box[0] ?? 0, x - reach);
    box[1] = Math.min(box[1] ?? 0, y - reach);
    box[2] = Math.min(box[2] ?? 0, foot, top);
    box[3] = Math.max(box[3] ?? 0, x + reach);
    box[4] = Math.max(box[4] ?? 0, y + reach);
    box[5] = Math.max(box[5] ?? 0, foot, top);
  }
  if (box[2] === Infinity) [box[2], box[5]] = [0, 0];
  return [box[0] ?? 0, box[1] ?? 0, box[2] ?? 0, box[3] ?? 0, box[4] ?? 0, box[5] ?? 0];
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
  /** Its box in its own frame (`isleBox`). */
  readonly box: readonly number[];
  /** The offset from the eye its uniform holds, written again only once the eye has moved. */
  readonly written: Float64Array;
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

/** The placements' instances sorted by module, and each module's run, leaving out the modules of the roles `leaves`. */
export function instancesOf(
  placements: readonly IslePlacement[],
  leaves: ReadonlySet<string> = new Set(),
): { floats: Float32Array; runs: Run[] } {
  const drawn = placements.filter(([module]) => !leaves.has(roleOf(module) ?? ''));
  const sorted = drawn.sort((a, b) => a[0] - b[0]);
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

/** How long a pack that failed to come waits before it is asked for again, milliseconds. */
const PACK_RETRY_MS = 30_000;

export class IslesView {
  readonly frame: IslesFrame = { triangles: 0, draws: 0, near: 0, middle: 0, far: 0 };
  private readonly gpu: Gpu;
  private readonly pipelines: Pipelines;
  private readonly frameUniform: GPUBuffer;
  private readonly manifest: IsleManifest | null;
  private readonly prefix: string | null;
  private readonly onLoaded: () => void;
  private readonly packs = new Map<string, Pack>();
  /** Each kit's pack asked for, and when one that failed may be asked for again (`performance.now()`). */
  private readonly asked = new Map<string, number>();
  private readonly offset = new Float32Array(4);
  /** The roles another drawer draws in this one's place (`GROWTH_ROLES`, the game's plants). */
  private readonly leaves: ReadonlySet<string>;
  private drawn: Drawn[] = [];

  /** `manifest` says where the kits' packs are published, `prefix` overrides it (a page's `?islePacks=`),
   *  `onLoaded` is told when a pack comes, so the page draws again, and the modules of the roles `leaves` are not
   *  drawn: another drawer draws them. */
  constructor(
    gpu: Gpu,
    manifest: IsleManifest | null,
    prefix: string | null,
    onLoaded: () => void = () => {},
    leaves: ReadonlySet<string> = new Set(),
  ) {
    this.gpu = gpu;
    this.leaves = leaves;
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
    // A pack that failed is asked for again by a show once PACK_RETRY_MS have passed.
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
    this.prepareShot(shot);
    const { castModules } = this.pipelines;
    for (const drawn of this.drawn) {
      if (this.distanceOf(drawn, shot) >= NEAR_M) continue;
      const { offset, reach } = this.placeOf(drawn, shot);
      const low = [offset[0] - reach, offset[1] - reach, offset[2] - 40] as const;
      const high = [offset[0] + reach, offset[1] + reach, offset[2] + 120] as const;
      if (!shadow.reaches(low, high)) continue;
      pass.setPipeline(castModules);
      pass.setBindGroup(0, drawn.group);
      pass.setBindGroup(1, shadow.casterGroup(castModules));
      this.drawModules(pass, drawn, false, null);
    }
  }

  drawInto(pass: GPURenderPassEncoder, fromEye: Float32Array, shot: IsleShot, _time: number, shadow: ShadowMap): void {
    this.gpu.device.queue.writeBuffer(this.frameUniform, 0, fromEye);
    this.prepareShot(shot);
    const frame = this.frame;
    [frame.triangles, frame.draws, frame.near, frame.middle, frame.far] = [0, 0, 0, 0, 0];
    const { ground, modules } = this.pipelines;
    // The sky lights both, at its own group; a gap below it holds nothing.
    skyUniformFor(this.gpu.device).bindShared(pass, [2]);
    const planes = viewPlanes(fromEye);
    for (const drawn of this.drawn) {
      const distance = this.distanceOf(drawn, shot);
      if (distance >= FARTHEST_M) continue;
      if (!boxSeen(planes, ...this.boxFromEye(drawn, shot))) continue;
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

  /** An island's box (`isleBox`) where it stands from the eye: its low corner, then its high. */
  private boxFromEye(drawn: Drawn, shot: IsleShot): [number[], number[]] {
    const { offset } = this.placeOf(drawn, shot);
    const corner = (first: number) => offset.map((along, axis) => along + (drawn.box[first + axis] ?? 0));
    return [corner(0), corner(3)];
  }

  /** Writes each island's offset from the eye, worked out in doubles so the GPU's floats keep their centimetres:
   *  once the eye moves, not once a pass, as the sun's casts and the picture share it. */
  private prepareShot(shot: IsleShot): void {
    for (const drawn of this.drawn) {
      const { offset } = this.placeOf(drawn, shot);
      const { written } = drawn;
      if (offset.every((along, axis) => along === written[axis])) continue;
      written.set(offset);
      this.offset.set([...offset, 0]);
      this.gpu.device.queue.writeBuffer(drawn.uniform, 0, this.offset);
    }
  }

  private drawGround(pass: GPURenderPassEncoder, ground: Ground, frame: IslesFrame): void {
    if (ground.count === 0) return;
    pass.setVertexBuffer(0, ground.vertices);
    pass.setIndexBuffer(ground.indices, 'uint32');
    pass.drawIndexed(ground.count);
    frame.triangles += ground.count / 3;
    frame.draws++;
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
    if (this.packs.has(kit) || performance.now() < (this.asked.get(kit) ?? 0)) return;
    const url = packUrl(kit, this.manifest, this.prefix);
    if (!url) return;
    this.asked.set(kit, Infinity);
    void loadKitPack(kit, url).then((pack) => {
      if (!pack) {
        this.asked.set(kit, performance.now() + PACK_RETRY_MS);
        return;
      }
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
    const { floats, runs } = instancesOf(shown.plan.placements, this.leaves);
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
      box: isleBox(grid, shown.plan.placements),
      written: new Float64Array(3).fill(Number.NaN),
    };
  }
}
