// A port city drawn with the land: its blocks' forged models near the eye, its buildings' masses further out and
// their hulls far off, dithered into each other; its landmark, works and plaza always; its ground plates at every
// distance. A Drawer the game's scene draws into its own pass.
import { CITY_LAMPS } from '../sky/lamps.ts';
import { skyUniformFor } from '../sky/skyUniform.ts';
import { type Gpu, TEXTURE_USAGE } from '../gpu.ts';
import { FAR, NEAR, ShadowMap } from '../shadow.ts';
import type { RmbBlock } from './blocks.ts';
import { buildCity, type Chunk, type CityData, type CityTables, type Range, runs } from './cityBuild.ts';
import { CITY_BUFFER_USAGE, type CityPipelines, cityPipelines } from './cityGpu.ts';
import { MODEL_FLOATS } from './cityModels.ts';
import { CityPainter, type PaintProgress } from './painter.ts';
import { PICTURE_LAYERS } from './pictures.ts';
import { type CityClimate, type CityPlan, glowLamps } from './plan.ts';
import { boxReach, boxSeen, NEAR_M, tiersReached, viewPlanes } from './tiers.ts';

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

/** Some of the city's chunks, and of their cells within the whole tier's reach. */
type Selection = { readonly chunks: Chunk[]; readonly cells: number[] };

/** Which of a frame's selections: what the view sees, and what may cast into the near square and into the far one. */
type Holding = 'view' | 'near' | 'far';
/** The selections whose near cells draw their models: the far square casts buildings by their masses. */
type Modelled = Exclude<Holding, 'far'>;

/** What a frame draws, worked out once for its shadows' passes and its own. */
type Seen = { readonly fromEye: Float32Array } & Record<Holding, Selection>;

/** The near cells' model instances for one selection, written afresh only when its cells change. */
type Instances = { buffer: GPUBuffer | null; key: string; draws: [model: number, first: number, count: number][] };

/** What the last frame drew. */
export type CityFrame = { triangles: number; draws: number; nearCells: number; buildMs: number };

const TIER_WHOLE = 1;
const VIEW_BYTES = 96;

type Drawn = {
  readonly data: CityData;
  readonly painter: CityPainter;
  readonly group: GPUBindGroup;
  readonly buffers: GPUBuffer[];
  readonly tiles: GPUTexture;
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
};

export class CityView implements CityDrawer {
  /** What the last frame drew, for a page to read. */
  readonly frame: CityFrame = { triangles: 0, draws: 0, nearCells: 0, buildMs: 0 };
  private readonly gpu: Gpu;
  private readonly pipelines: CityPipelines;
  private drawn: Drawn | null = null;
  private seen: Seen | null = null;
  private onPainted: () => void = () => {};

  constructor(gpu: Gpu) {
    this.gpu = gpu;
    this.pipelines = cityPipelines(gpu);
  }

  /** Called whenever another picture is painted, so a page that draws on demand can draw again. */
  set painted(listener: () => void) {
    this.onPainted = listener;
  }

  /** How far painting the city's pictures has come, or null with no city. */
  get painting(): PaintProgress | null {
    return this.drawn?.painter.progress ?? null;
  }

  /** Draws this city from now on, in its climate's pictures; the blocks by name, the forged tables parsed. */
  setCity(plan: CityPlan, climate: CityClimate, blocks: ReadonlyMap<string, RmbBlock>, tables: CityTables): void {
    this.clear();
    CITY_LAMPS.current = glowLamps(plan);
    const started = performance.now();
    const data = buildCity(plan, climate, blocks, tables);
    this.frame.buildMs = performance.now() - started;
    const { device } = this.gpu;
    const buffers: GPUBuffer[] = [];
    const buffer = (contents: ArrayBufferView | ArrayBuffer, usage: number, least = 16): GPUBuffer => {
      const bytes =
        contents instanceof ArrayBuffer
          ? new Uint8Array(contents)
          : new Uint8Array(contents.buffer, contents.byteOffset, contents.byteLength);
      const made = device.createBuffer({
        size: Math.max(least, Math.ceil(bytes.byteLength / 4) * 4),
        usage: usage | CITY_BUFFER_USAGE.copyDestination,
      });
      if (bytes.byteLength) device.queue.writeBuffer(made, 0, bytes, 0, bytes.byteLength - (bytes.byteLength % 4));
      buffers.push(made);
      return made;
    };
    const sizes = new Float32Array(PICTURE_LAYERS * 4).fill(64);
    data.book.pictures.forEach((picture, layer) => sizes.set([picture.width, picture.height], layer * 4));
    const solidVertices = new ArrayBuffer((data.solids.positions.length / 3) * MODEL_FLOATS * 4);
    const [floats, whole] = [new Float32Array(solidVertices), new Uint32Array(solidVertices)];
    for (let k = 0; k < data.solids.positions.length / 3; k++) {
      floats.set(data.solids.positions.slice(k * 3, k * 3 + 3), k * MODEL_FLOATS);
      floats.set(data.solids.normals.slice(k * 3, k * 3 + 3), k * MODEL_FLOATS + 3);
      floats.set(data.solids.uvs.slice(k * 2, k * 2 + 2), k * MODEL_FLOATS + 6);
      whole[k * MODEL_FLOATS + 8] = data.solids.layers[k];
    }
    const tiles = device.createTexture({
      size: [data.plates.width, data.plates.width],
      format: 'rg8uint',
      usage: TEXTURE_USAGE.textureBinding | TEXTURE_USAGE.copyDestination,
    });
    device.queue.writeTexture({ texture: tiles }, data.plates.tiles, { bytesPerRow: data.plates.width * 2 }, [
      data.plates.width,
      data.plates.width,
    ]);
    const painter = new CityPainter(this.gpu, data.book, () => this.onPainted());
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
    const origin = new ArrayBuffer(24);
    new Uint32Array(origin, 16, 2).set([0, 0]);
    this.drawn = {
      data,
      painter,
      group,
      buffers,
      tiles,
      view,
      modelVertices: buffer(data.models.vertices, CITY_BUFFER_USAGE.vertex),
      modelIndices: buffer(data.models.indices, CITY_BUFFER_USAGE.index),
      solidVertices: buffer(solidVertices, CITY_BUFFER_USAGE.vertex),
      solidIndices: buffer(new Uint32Array(data.solids.indices), CITY_BUFFER_USAGE.index),
      origin: buffer(origin, CITY_BUFFER_USAGE.vertex),
      masses: buffer(data.masses, CITY_BUFFER_USAGE.vertex),
      plates: buffer(data.plates.tops, CITY_BUFFER_USAGE.vertex),
      plateVertices: data.plates.tops.length / 3,
      instances: {
        view: { buffer: null, key: '', draws: [] },
        near: { buffer: null, key: '', draws: [] },
      },
    };
  }

  /** Stops drawing any city and frees its buffers. */
  clear(): void {
    const drawn = this.drawn;
    if (!drawn) return;
    CITY_LAMPS.current = [];
    drawn.painter.destroy();
    drawn.tiles.destroy();
    for (const buffer of [...drawn.buffers, ...Object.values(drawn.instances).map((held) => held.buffer)])
      buffer?.destroy();
    this.drawn = null;
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
    const { data } = drawn;
    const eye: [number, number, number] = [shot.eye[0] - data.origin[0], shot.eye[1] - data.origin[1], shot.eye[2]];
    const uniforms = new Float32Array(VIEW_BYTES / 4);
    uniforms.set(fromEye, 0);
    uniforms.set([...eye, time], 16);
    uniforms.set([...data.grid, data.plates.width, 0], 20);
    this.gpu.device.queue.writeBuffer(drawn.view, 0, uniforms);
    const planes = viewPlanes(fromEye);
    const casting = shadow?.active ? shadow : null;
    type Box = readonly [number, number, number];
    const tests: [Holding, (low: Box, high: Box) => boolean][] = [['view', (low, high) => boxSeen(planes, low, high)]];
    if (casting)
      tests.push(
        ['near', (low, high) => casting.reaches(low, high, NEAR)],
        ['far', (low, high) => casting.reaches(low, high, FAR)],
      );
    const seen: Seen = {
      fromEye,
      view: { chunks: [], cells: [] },
      near: { chunks: [], cells: [] },
      far: { chunks: [], cells: [] },
    };
    for (const chunk of data.chunks) {
      const low: Box = [chunk.low[0] - eye[0], chunk.low[1] - eye[1], chunk.low[2] - eye[2]];
      const high: Box = [chunk.high[0] - eye[0], chunk.high[1] - eye[1], chunk.high[2] - eye[2]];
      const wanting = tests.filter(([, test]) => test(low, high));
      if (!wanting.length) continue;
      for (const [holding] of wanting) seen[holding].chunks.push(chunk);
      const middles = boxReach(
        [chunk.middlesLow[0] - eye[0], chunk.middlesLow[1] - eye[1], chunk.middlesLow[2] - eye[2]],
        [chunk.middlesHigh[0] - eye[0], chunk.middlesHigh[1] - eye[1], chunk.middlesHigh[2] - eye[2]],
      );
      if (middles.nearest >= NEAR_M) continue;
      for (const cell of chunk.cells) {
        const middle = data.cells.subarray(cell * 4, cell * 4 + 3);
        const offset = [middle[0] - eye[0], middle[1] - eye[1], middle[2] - eye[2]];
        if (Math.hypot(offset[0], offset[1], offset[2]) >= NEAR_M) continue;
        const half = 51.2 + 10;
        const cellLow: Box = [offset[0] - half, offset[1] - half, offset[2] - 5];
        const cellHigh: Box = [offset[0] + half, offset[1] + half, offset[2] + 70];
        for (const [holding, test] of wanting)
          if (holding !== 'far' && test(cellLow, cellHigh)) seen[holding].cells.push(cell);
      }
    }
    this.seen = seen;
    return seen;
  }

  /** The masses and hulls of some chunks, by the tiers the eye's distance draws them in; `standIn` takes the masses
   *  for the whole tier too, as the far shadow casts it. */
  private massRuns(chunks: readonly Chunk[], eye: readonly [number, number, number], standIn = false): Range[] {
    const masses: Range[] = [];
    const hulls: Range[] = [];
    for (const chunk of chunks) {
      const middles = boxReach(
        [chunk.middlesLow[0] - eye[0], chunk.middlesLow[1] - eye[1], chunk.middlesLow[2] - eye[2]],
        [chunk.middlesHigh[0] - eye[0], chunk.middlesHigh[1] - eye[1], chunk.middlesHigh[2] - eye[2]],
      );
      const tiers = tiersReached(middles.nearest, middles.farthest);
      if (tiers.has('masses') || (standIn && tiers.has('whole'))) masses.push(chunk.masses);
      if (tiers.has('hulls')) hulls.push(chunk.hulls);
    }
    return [...runs(masses), ...runs(hulls)];
  }

  /** Draws into the cascade being drawn what may cast there: the solids into both; into the near one the near cells'
   *  models, and into the far one each building's masses, or its hull past where the masses are drawn. A mass is a
   *  few boxes where a model is hundreds of triangles, and at the far map's 1.2 m texels the two throw one shadow. */
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
    if (!far) this.drawNear(pass, drawn, 'near', cells);
    pass.setVertexBuffer(0, drawn.solidVertices);
    pass.setVertexBuffer(1, drawn.origin);
    pass.setIndexBuffer(drawn.solidIndices, 'uint32');
    for (const run of runs(chunks.map((chunk) => chunk.solids))) pass.drawIndexed(run.count, 1, run.first, 0, 0);
    if (!far) return;
    const { origin } = drawn.data;
    const eye = [shot.eye[0] - origin[0], shot.eye[1] - origin[1], shot.eye[2]] as const;
    pass.setPipeline(this.pipelines.massesCast);
    pass.setBindGroup(1, shadow.casterGroup(this.pipelines.massesCast));
    pass.setVertexBuffer(0, drawn.masses);
    for (const run of this.massRuns(chunks, eye, true)) pass.draw(42, run.count, 0, run.first);
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

    pass.setPipeline(this.pipelines.models);
    const near = this.drawNear(pass, drawn, 'view', cells);
    frame.draws += near.draws;
    frame.triangles += near.triangles;
    pass.setVertexBuffer(0, drawn.solidVertices);
    pass.setVertexBuffer(1, drawn.origin);
    pass.setIndexBuffer(drawn.solidIndices, 'uint32');
    for (const run of runs(chunks.map((chunk) => chunk.solids))) {
      pass.drawIndexed(run.count, 1, run.first, 0, 0);
      frame.draws++;
      frame.triangles += run.count / 3;
    }

    pass.setPipeline(this.pipelines.masses);
    pass.setVertexBuffer(0, drawn.masses);
    for (const run of this.massRuns(chunks, eye)) {
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
  ): { draws: number; triangles: number } {
    const { data } = drawn;
    const held = drawn.instances[holding];
    const key = cells.join(',');
    if (key !== held.key) {
      held.key = key;
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
      const bytes = new ArrayBuffer(Math.max(total, 1) * 24);
      const [floats, whole] = [new Float32Array(bytes), new Uint32Array(bytes)];
      for (const cell of cells)
        for (const instance of data.near.get(cell) ?? []) {
          const slot = starts.get(instance.model) ?? 0;
          starts.set(instance.model, slot + 1);
          floats.set(instance.at, slot * 6);
          whole[slot * 6 + 4] = cell;
          whole[slot * 6 + 5] = TIER_WHOLE;
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
      if (!entry.indexCount) continue;
      pass.drawIndexed(entry.indexCount, instances, entry.firstIndex, entry.baseVertex, first);
      drew.draws++;
      drew.triangles += (entry.indexCount / 3) * instances;
    }
    return drew;
  }
}
