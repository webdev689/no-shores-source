// A port city drawn with the land: its blocks' forged models near the eye, its buildings' masses further out and
// their hulls far off, dithered into each other; its landmark, works and plaza always, and in a ruin the Lattice's
// great spires, its small crystal only near; its ground plates at every distance. A Drawer the game's scene draws
// into its own pass.
import { CITY_LAMPS } from '../sky/lamps.ts';
import { skyUniformFor } from '../sky/skyUniform.ts';
import { type Gpu, TEXTURE_USAGE } from '../gpu.ts';
import { FAR, ShadowMap } from '../shadow.ts';
import type { RmbBlock } from './blocks.ts';
import {
  type Chunk,
  cityBuildSteps,
  type CityData,
  type CityTables,
  detailRuns,
  type Range,
  runs,
} from './cityBuild.ts';
import { chunkDraws, crustMoved, type InstancedDraw, withinMiddle, WreckCrust } from './crystalInstances.ts';
import {
  CITY_BUFFER_USAGE,
  type CityPipelines,
  cityPipelines,
  MODEL_INSTANCE_BYTES,
  originInstance,
} from './cityGpu.ts';
import { CityPainter, type PaintProgress, painting } from './painter.ts';
import type { ModelEntry } from './cityModels.ts';
import { standIn } from '../standIns.ts';
import { PICTURE_LAYERS } from './pictures.ts';
import { glowLights } from './cityLights.ts';
import { type CityClimate, type CityPlan } from './plan.ts';
import { stepWithin } from './steps.ts';
import { CitySelector, type Modelled, sameCells, type Seen, solidsOf } from './citySelect.ts';

/** What the scene hands a drawer each frame: the eye in world metres, and how it looks. */
export interface CityShot {
  readonly eye: readonly [number, number, number];
  readonly yaw: number;
  readonly pitch: number;
  readonly fov: number;
  readonly near: number;
  readonly far: number;
}

/** Anything drawn into the scene's pass, as the game's scene takes it. */
export interface CityDrawer {
  drawInto(pass: GPURenderPassEncoder, fromEye: Float32Array, shot: CityShot, time: number, shadow?: ShadowMap): void;
}

/** The near cells' model instances for one selection, written afresh only when its cells change. */
type Instances = {
  buffer: GPUBuffer | null;
  readonly cells: number[];
  draws: [model: number, first: number, count: number][];
};

/** What the last frame drew. */
export type CityFrame = { triangles: number; draws: number; nearCells: number; buildMs: number };

const TIER_WHOLE = 1;
const VIEW_BYTES = 96;
/** How long a frame may spend building a city while an older one stands drawn, milliseconds: the old is drawn until
 *  the new is whole, so no one waits on it. Overlook's takes about a second of steps, so about 500 frames. */
export const CITY_SLICE_MS = 2;
/** How long a frame may spend building a city while none stands: the player waits on this one behind the veil, which
 *  shows nothing it would cost, so Overlook's stands in about 40 frames while the veil keeps moving. */
export const CITY_FIRST_SLICE_MS = 24;

/** Whatever of the GPU's a city makes, let go with it. */
type Owned = { destroy(): void };

type Drawn = {
  /** The city's drawing less its solids, which are let go once on the GPU. */
  readonly data: Omit<CityData, 'solids'>;
  readonly painter: CityPainter;
  readonly group: GPUBindGroup;
  readonly owned: Owned[];
  readonly view: GPUBuffer;
  readonly modelVertices: GPUBuffer;
  readonly modelIndices: GPUBuffer;
  readonly solidVertices: GPUBuffer;
  readonly solidIndices: GPUBuffer;
  readonly origin: GPUBuffer;
  readonly masses: GPUBuffer;
  readonly plates: GPUBuffer;
  readonly plateVertices: number;
  readonly instances: Record<Modelled, Instances>;
  /** A ruin's crystal formations past the near cells, by instance. */
  readonly crystal: GPUBuffer;
  /** Its wrecks' crusts by instance, written again whenever the size the wrecks are drawn at changes. */
  readonly wreckCrust: { readonly buffer: GPUBuffer; readonly crust: WreckCrust } | null;
};

/** A city being built a few steps a frame: its steps, what of the GPU's they have made so far, its plan, the time
 *  its steps have taken, and who is told once it stands. */
type Building = {
  readonly steps: Generator<void, Drawn>;
  readonly owned: Owned[];
  readonly plan: CityPlan;
  spentMs: number;
  readonly whole: () => void;
};

export class CityView implements CityDrawer {
  /** Drawn before the ground, whose pixels it covers: opaque and pulled nearer than the ground it stands on. */
  readonly coversGround = true;
  /** What the last frame drew, for a page to read. */
  readonly frame: CityFrame = { triangles: 0, draws: 0, nearCells: 0, buildMs: 0 };
  private readonly gpu: Gpu;
  private readonly pipelines: CityPipelines;
  private drawn: Drawn | null = null;
  private building: Building | null = null;
  private seen: Seen | null = null;
  /** What a frame selects, laid into lists the view keeps, and its terms, written afresh each frame. */
  private readonly selector = new CitySelector();
  private readonly uniforms = new Float32Array(VIEW_BYTES / 4);
  private readonly solidRunList: Range[] = [];
  private onPainted: () => void = () => {};

  /** Lists a pass's crystal draws are laid into, kept from pass to pass. */
  private readonly draws: InstancedDraw[] = [];
  private readonly middleChunks: Chunk[] = [];
  private readonly detail: Range[] = [];
  /** The size a ruin's wrecks are drawn at now (the ships': larger at sea, true size on foot), its crust's too. */
  private readonly wreckScale: () => number;

  constructor(gpu: Gpu, wreckScale: () => number = () => 1) {
    this.gpu = gpu;
    this.pipelines = cityPipelines(gpu);
    this.wreckScale = wreckScale;
  }

  /** Called whenever another picture is painted, so a page that draws on demand can draw again. */
  set painted(listener: () => void) {
    this.onPainted = listener;
  }

  /** How far painting the city's pictures has come, or null with no city. */
  get painting(): PaintProgress | null {
    return this.drawn?.painter.progress ?? null;
  }

  /** Draws this city from now on, in its climate's pictures; the blocks by name, the forged tables parsed. Built in
   *  one go: a build that fails throws. */
  setCity(plan: CityPlan, climate: CityClimate, blocks: ReadonlyMap<string, RmbBlock>, tables: CityTables): void {
    this.beginCity(plan, climate, blocks, tables);
    this.keepBuilding(Infinity);
  }

  /** Builds this city a few steps a frame (`prepare`), the city drawn before drawn until this one is whole, then
   *  this one in its place, and `whole` told. A city begun and not yet whole is let go if another is begun. */
  beginCity(
    plan: CityPlan,
    climate: CityClimate,
    blocks: ReadonlyMap<string, RmbBlock>,
    tables: CityTables,
    whole: () => void = () => undefined,
  ): void {
    this.dropBuilding();
    const owned: Owned[] = [];
    const steps = this.drawnSteps(cityBuildSteps(plan, climate, blocks, tables), owned);
    this.building = { steps, owned, plan, spentMs: 0, whole };
  }

  /** Whether a city is being built and is not yet whole. */
  get underWay(): boolean {
    return this.building !== null;
  }

  /** Carries a build on before a frame is recorded, within the frame's share. A build that fails is let go, the city
   *  drawn before still standing. */
  prepare(): void {
    try {
      this.keepBuilding(this.drawn ? CITY_SLICE_MS : CITY_FIRST_SLICE_MS);
    } catch (error) {
      console.error('the city could not be built:', error);
    }
  }

  /** Carries a build on for `budgetMs` (a step at least); once it is whole, its city is drawn in place of the old.
   *  A build that fails is let go, and throws. */
  keepBuilding(budgetMs: number): void {
    const building = this.building;
    if (!building) return;
    const started = performance.now();
    let built: { readonly made: Drawn } | null;
    try {
      built = stepWithin(building.steps, budgetMs);
    } catch (error) {
      this.dropBuilding();
      throw error;
    } finally {
      building.spentMs += performance.now() - started;
    }
    if (!built) return;
    this.building = null;
    this.clear();
    this.drawn = built.made;
    // Its lights once whole, when its modules' meshes have come: a lamp post's lights stand at its lanterns.
    const lights = glowLights(building.plan);
    CITY_LAMPS.set(this, [...lights.lamps, ...built.made.data.lamps], lights.fires);
    this.frame.buildMs = building.spentMs;
    building.whole();
  }

  /** Stops drawing any city and frees its buffers; a city still being built is let go too. */
  clear(): void {
    this.dropBuilding();
    CITY_LAMPS.set(this, []);
    this.seen = null;
    const drawn = this.drawn;
    if (!drawn) return;
    for (const owned of [...drawn.owned, ...Object.values(drawn.instances).map((held) => held.buffer)])
      owned?.destroy();
    this.drawn = null;
  }

  /** Lets go of a city still being built, and what of the GPU's its steps have made. */
  private dropBuilding(): void {
    for (const owned of this.building?.owned ?? []) owned.destroy();
    this.building = null;
  }

  /** The city's drawing put on the GPU once its build's steps are done, a step a large buffer; whatever is made goes
   *  into `owned`, to be let go if the build is. */
  private *drawnSteps(building: Generator<void, CityData>, owned: Owned[]): Generator<void, Drawn> {
    const { solids, ...data } = yield* building;
    const { device } = this.gpu;
    const buffer = (contents: ArrayBufferView | ArrayBuffer, usage: number, least = 16): GPUBuffer => {
      const bytes =
        contents instanceof ArrayBuffer
          ? new Uint8Array(contents)
          : new Uint8Array(contents.buffer, contents.byteOffset, contents.byteLength);
      const made = device.createBuffer({
        size: Math.max(least, Math.ceil(bytes.byteLength / 4) * 4),
        usage: usage | CITY_BUFFER_USAGE.copyDestination,
      });
      owned.push(made);
      if (bytes.byteLength) device.queue.writeBuffer(made, 0, bytes, 0, bytes.byteLength - (bytes.byteLength % 4));
      return made;
    };
    const sizes = new Float32Array(PICTURE_LAYERS * 4).fill(64);
    data.book.pictures.forEach((picture, layer) => sizes.set([picture.width, picture.height], layer * 4));
    const tiles = device.createTexture({
      size: [data.plates.width, data.plates.width],
      format: 'rg8uint',
      usage: TEXTURE_USAGE.textureBinding | TEXTURE_USAGE.copyDestination,
    });
    owned.push(tiles);
    device.queue.writeTexture({ texture: tiles }, data.plates.tiles, { bytesPerRow: data.plates.width * 2 }, [
      data.plates.width,
      data.plates.width,
    ]);
    yield;
    const painter = new CityPainter(this.gpu, data.book, () => this.onPainted());
    owned.push(painter);
    yield;
    const view = buffer(new ArrayBuffer(VIEW_BYTES), CITY_BUFFER_USAGE.uniform);
    const cellTable = buffer(data.cells, CITY_BUFFER_USAGE.storage);
    const layerSizes = buffer(sizes, CITY_BUFFER_USAGE.storage);
    const group = device.createBindGroup({
      layout: this.pipelines.layout,
      entries: [
        { binding: 0, resource: { buffer: view } },
        { binding: 1, resource: { buffer: cellTable } },
        { binding: 2, resource: { buffer: layerSizes } },
        { binding: 3, resource: painter.view },
        {
          binding: 4,
          resource: device.createSampler({
            addressModeU: 'repeat',
            addressModeV: 'repeat',
            magFilter: 'nearest',
            minFilter: 'linear',
            mipmapFilter: 'linear',
          }),
        },
        { binding: 5, resource: tiles.createView() },
      ],
    });
    const modelVertices = buffer(data.models.vertices, CITY_BUFFER_USAGE.vertex);
    yield;
    const modelIndices = buffer(data.models.indices, CITY_BUFFER_USAGE.index);
    yield;
    const solidVertices = buffer(solids.vertices, CITY_BUFFER_USAGE.vertex);
    yield;
    const solidIndices = buffer(solids.indices, CITY_BUFFER_USAGE.index);
    yield;
    const masses = buffer(data.masses, CITY_BUFFER_USAGE.vertex);
    yield;
    return {
      data,
      painter,
      group,
      owned,
      view,
      modelVertices,
      modelIndices,
      solidVertices,
      solidIndices,
      origin: buffer(originInstance(), CITY_BUFFER_USAGE.vertex),
      masses,
      plates: buffer(data.plates.tops, CITY_BUFFER_USAGE.vertex),
      plateVertices: data.plates.tops.length / 3,
      instances: {
        view: { buffer: null, cells: [], draws: [] },
        near: { buffer: null, cells: [], draws: [] },
      },
      crystal: buffer(data.crystal.bytes, CITY_BUFFER_USAGE.vertex),
      wreckCrust: data.wrecks.length
        ? (() => {
            const crust = new WreckCrust(data.wrecks, data.origin, data.firstFormation);
            return { buffer: buffer(crust.bytes, CITY_BUFFER_USAGE.vertex), crust };
          })()
        : null,
    };
  }

  /** Draws a ruin's crystal formations past the near cells: the great ones, the middle distance's of the chunks
   *  within its reach, and the wrecks' crusts as large as the wrecks are drawn. Answers what it drew. */
  private drawCrystal(
    pass: GPURenderPassEncoder,
    drawn: Drawn,
    chunks: readonly Chunk[],
    eye: readonly number[],
  ): { draws: number; triangles: number } {
    const { data } = drawn;
    const drew = { draws: 0, triangles: 0 };
    // a port city has no crystal of its own to draw
    if (!data.ruined) return drew;
    const draw = (draws: readonly InstancedDraw[]) => {
      for (const { model, first, count } of draws) {
        const entry = data.models.entries[model];
        if (!entry?.indexCount) continue;
        pass.drawIndexed(entry.indexCount, count, entry.firstIndex, entry.baseVertex, first);
        drew.draws++;
        drew.triangles += (entry.indexCount / 3) * count;
      }
    };
    pass.setVertexBuffer(0, drawn.modelVertices);
    pass.setIndexBuffer(drawn.modelIndices, 'uint32');
    pass.setVertexBuffer(1, drawn.crystal);
    draw(chunkDraws(chunks, data.crystal.great, data.firstFormation, this.draws));
    this.middleChunks.length = 0;
    for (const chunk of chunks) if (withinMiddle(chunk, eye)) this.middleChunks.push(chunk);
    draw(chunkDraws(this.middleChunks, data.crystal.middle, data.firstFormation, this.draws));
    const wrecks = drawn.wreckCrust;
    if (wrecks) {
      const scale = this.wreckScale();
      if (crustMoved(wrecks.crust.written, scale, wrecks.crust.lastFrame)) {
        wrecks.crust.write(scale);
        this.gpu.device.queue.writeBuffer(wrecks.buffer, 0, wrecks.crust.bytes);
      }
      pass.setVertexBuffer(1, wrecks.buffer);
      draw(wrecks.crust.draws);
    }
    return drew;
  }

  /** Whether a world point lies on the city's pads, quays or any of its solids: ground nature keeps off. */
  cleared(x: number, y: number): boolean {
    return this.drawn?.data.cleared(x, y) ?? false;
  }

  /** Works out, once a frame, what the frame draws and casts, and writes the view's terms. */
  private select(fromEye: Float32Array, shot: CityShot, time: number, shadow: ShadowMap | undefined): Seen | null {
    const drawn = this.drawn;
    if (!drawn) return null;
    if (this.seen?.fromEye === fromEye) return this.seen;
    if (painting(drawn.painter)) standIn('city pictures');
    const { data } = drawn;
    const eye: [number, number, number] = [shot.eye[0] - data.origin[0], shot.eye[1] - data.origin[1], shot.eye[2]];
    const { uniforms } = this;
    uniforms.set(fromEye, 0);
    uniforms.set(eye, 16);
    uniforms[19] = time;
    uniforms.set(data.grid, 20);
    uniforms[22] = data.plates.width;
    uniforms[23] = data.ruined ? 1 : 0;
    this.gpu.device.queue.writeBuffer(drawn.view, 0, uniforms);
    this.seen = this.selector.select(data, fromEye, eye, shadow?.active ? shadow : null);
    return this.seen;
  }

  /** Draws into the cascade being drawn what may cast there: the solids into both; into the near one the near cells'
   *  models and the crystal's small detail, and into the far one each building's masses, or its hull past where the
   *  masses are drawn. A mass is a few boxes where a model is hundreds of triangles, and at the far map's 1.2 m texels
   *  the two throw one shadow. */
  castInto(pass: GPURenderPassEncoder, fromEye: Float32Array, shot: CityShot, time: number, shadow: ShadowMap): void {
    const drawn = this.drawn;
    const seen = this.select(fromEye, shot, time, shadow);
    if (!drawn || !seen) return;
    const far = shadow.cascade === FAR;
    const { chunks, cells } = seen[far ? 'far' : 'near'];
    const cast = this.pipelines.modelsCast;
    pass.setPipeline(cast);
    pass.setBindGroup(0, drawn.group);
    pass.setBindGroup(1, shadow.casterGroup(cast));
    if (!far) this.drawNear(pass, drawn, 'near', cells, (entry) => !entry.clear);
    pass.setVertexBuffer(0, drawn.solidVertices);
    pass.setVertexBuffer(1, drawn.origin);
    pass.setIndexBuffer(drawn.solidIndices, 'uint32');
    for (const run of runs(chunks, solidsOf, this.solidRunList)) pass.drawIndexed(run.count, 1, run.first, 0, 0);
    const { origin } = drawn.data;
    const eye = [shot.eye[0] - origin[0], shot.eye[1] - origin[1], shot.eye[2]] as const;
    if (!far) for (const run of detailRuns(chunks, eye, this.detail)) pass.drawIndexed(run.count, 1, run.first, 0, 0);
    this.drawCrystal(pass, drawn, chunks, eye);
    if (!far) {
      // An open building's windows let the sun into its rooms through their clear panes.
      const clear = this.pipelines.modelsClearCast;
      pass.setPipeline(clear);
      pass.setBindGroup(1, shadow.casterGroup(clear));
      this.drawNear(pass, drawn, 'near', cells, (entry) => entry.clear === true);
      return;
    }
    pass.setPipeline(this.pipelines.massesCast);
    pass.setBindGroup(1, shadow.casterGroup(this.pipelines.massesCast));
    pass.setVertexBuffer(0, drawn.masses);
    for (const tier of this.selector.massRuns(chunks, eye, true))
      for (const run of tier) pass.draw(42, run.count, 0, run.first);
  }

  drawInto(pass: GPURenderPassEncoder, fromEye: Float32Array, shot: CityShot, time: number, shadow?: ShadowMap): void {
    const drawn = this.drawn;
    const seen = this.select(fromEye, shot, time, shadow);
    if (!drawn || !seen) return;
    const { origin } = drawn.data;
    const eye = [shot.eye[0] - origin[0], shot.eye[1] - origin[1], shot.eye[2]] as const;
    const { chunks, cells } = seen.view;
    const frame = { triangles: 0, draws: 0, nearCells: cells.length, buildMs: this.frame.buildMs };
    pass.setBindGroup(0, drawn.group);
    // The three pipelines share the shadow's layout, so one group serves them all.
    pass.setBindGroup(1, (shadow ?? ShadowMap.none(this.gpu)).receiverGroup(this.pipelines.plates));
    skyUniformFor(this.gpu.device).bindShared(pass, [2]);

    pass.setPipeline(this.pipelines.plates);
    pass.setVertexBuffer(0, drawn.plates);
    pass.draw(drawn.plateVertices);
    frame.draws++;
    frame.triangles += drawn.plateVertices / 3;

    pass.setPipeline(drawn.data.ruined ? this.pipelines.brokenModels : this.pipelines.models);
    const near = this.drawNear(pass, drawn, 'view', cells);
    frame.draws += near.draws;
    frame.triangles += near.triangles;
    pass.setPipeline(this.pipelines.models);
    pass.setVertexBuffer(0, drawn.solidVertices);
    pass.setVertexBuffer(1, drawn.origin);
    pass.setIndexBuffer(drawn.solidIndices, 'uint32');
    for (const listed of [runs(chunks, solidsOf, this.solidRunList), detailRuns(chunks, eye, this.detail)])
      for (const run of listed) {
        pass.drawIndexed(run.count, 1, run.first, 0, 0);
        frame.draws++;
        frame.triangles += run.count / 3;
      }
    const crystal = this.drawCrystal(pass, drawn, chunks, eye);
    // the view draws once a frame: the size its wrecks stood at, for the next frame to tell whether it has settled
    if (drawn.wreckCrust) drawn.wreckCrust.crust.lastFrame = this.wreckScale();
    frame.draws += crystal.draws;
    frame.triangles += crystal.triangles;

    pass.setPipeline(drawn.data.ruined ? this.pipelines.brokenMasses : this.pipelines.masses);
    pass.setVertexBuffer(0, drawn.masses);
    for (const tier of this.selector.massRuns(chunks, eye))
      for (const run of tier) {
        pass.draw(42, run.count, 0, run.first);
        frame.draws++;
        frame.triangles += run.count * 14;
      }
    Object.assign(this.frame, frame);
  }

  /** The near cells' models, an instanced draw a model, their instances kept a selection at a time and written
   *  afresh when its cells change, which they do a cell at a time. Answers what it drew. */
  private drawNear(
    pass: GPURenderPassEncoder,
    drawn: Drawn,
    holding: Modelled,
    cells: readonly number[],
    drawing: (entry: ModelEntry) => boolean = () => true,
  ): { draws: number; triangles: number } {
    const { data } = drawn;
    const held = drawn.instances[holding];
    if (!sameCells(cells, held.cells)) {
      held.cells.length = 0;
      for (const cell of cells) held.cells.push(cell);
      const counts = new Map<number, number>();
      for (const cell of cells)
        for (const instance of data.near.get(cell) ?? [])
          counts.set(instance.model, (counts.get(instance.model) ?? 0) + 1);
      const starts = new Map<number, number>();
      let total = 0;
      held.draws = [];
      for (const [model, count] of counts) {
        starts.set(model, total);
        held.draws.push([model, total, count]);
        total += count;
      }
      const bytes = new ArrayBuffer(Math.max(total, 1) * MODEL_INSTANCE_BYTES);
      const [floats, whole] = [new Float32Array(bytes), new Uint32Array(bytes)];
      const stride = MODEL_INSTANCE_BYTES / 4;
      for (const cell of cells)
        for (const instance of data.near.get(cell) ?? []) {
          const slot = starts.get(instance.model) ?? 0;
          starts.set(instance.model, slot + 1);
          floats.set(instance.at, slot * stride);
          whole[slot * stride + 4] = cell;
          whole[slot * stride + 5] = TIER_WHOLE;
          floats[slot * stride + 6] = instance.cut;
          floats[slot * stride + 7] = instance.scale;
        }
      if (!held.buffer || held.buffer.size < bytes.byteLength) {
        held.buffer?.destroy();
        held.buffer = this.gpu.device.createBuffer({
          size: Math.max(bytes.byteLength * 2, 1 << 16),
          usage: CITY_BUFFER_USAGE.vertex | CITY_BUFFER_USAGE.copyDestination,
        });
      }
      this.gpu.device.queue.writeBuffer(held.buffer, 0, bytes);
    }
    const drew = { draws: 0, triangles: 0 };
    if (!held.buffer || !held.draws.length) return drew;
    pass.setVertexBuffer(0, drawn.modelVertices);
    pass.setVertexBuffer(1, held.buffer);
    pass.setIndexBuffer(drawn.modelIndices, 'uint32');
    for (const [model, first, instances] of held.draws) {
      const entry = data.models.entries[model];
      if (!entry.indexCount || !drawing(entry)) continue;
      pass.drawIndexed(entry.indexCount, instances, entry.firstIndex, entry.baseVertex, first);
      drew.draws++;
      drew.triangles += (entry.indexCount / 3) * instances;
    }
    return drew;
  }
}
