// A dungeon drawn on WebGPU: its floor's mesh, dressed in its styles' pieces and landmarks, and its cache in its
// pictures, painted by the city's painter, lit by the lights nearest the eye, each fragment by those its cluster lists.
// A Drawer the dungeon's scene draws into its pass, its depth first and then lit.
import { CITY_BUFFER_USAGE } from '../city/cityGpu.ts';
import { modelBuffers } from '../city/cityModels.ts';
import { CityPainter } from '../city/painter.ts';
import { MATERIALS } from '../city/pictures.ts';
import type { CityClimate } from '../city/plan.ts';
import type { Gpu } from '../gpu.ts';
import type { ForgedModel } from '../models/model.ts';
import { dungeonBook, type SmallBook } from './dungeonBook.ts';
import { propPlans } from './dungeonCells.ts';
import { CLUSTER_COUNT, LightClusters, MOST_LISTED } from './dungeonClusters.ts';
import { type Cache, chestMesh } from './dungeonChest.ts';
import { type DungeonLayout, SIDE_STEPS, type StyleKey } from './dungeonLayout.ts';
import { dressingOf } from './dungeonDressing.ts';
import { burningOf, cellWords, LIGHT_KINDS, type Light, lightAt, MOODS, NearestLights } from './dungeonLight.ts';
import { dungeonMesh } from './dungeonMesh.ts';
import type { ModulePack } from './dungeonModules.ts';
import { type DungeonPipelines, dungeonPipelines } from './dungeonPipelines.ts';
import { bedOf, fixtureMesh } from './dungeonFixtures.ts';
import { layModel } from './entrances.ts';
import { propModel } from '../models/props.ts';
import type { PropTable } from '../models/tables.ts';
import { LIGHT_FLOATS, lightFloats, MOST_LIGHTS, MOST_LOOKS, VIEW_FLOATS } from './dungeonShaders.ts';

/** How far out from its face the open portal's light stands, metres. */
const PORTAL_OUT_M = 0.6;

type Buffers = { vertices: GPUBuffer; indices: GPUBuffer; count: number };

/** What one dungeon draws with, made when it is set. */
type Drawn = {
  readonly layout: DungeonLayout;
  /** The torches and the fixtures, each as it burns. */
  readonly burning: readonly Light[];
  /** The open portal's light, half way up its face and a little out from it. */
  readonly portalLight: Light;
  /** Picks the lights each frame is lit by. */
  readonly picker: NearestLights;
  readonly book: SmallBook;
  readonly wood: readonly [number, number];
  readonly painter: CityPainter;
  readonly view: GPUBuffer;
  readonly lights: GPUBuffer;
  readonly cellLooks: GPUBuffer;
  readonly clusters: GPUBuffer;
  readonly group: GPUBindGroup;
  readonly floor: Buffers;
  chest: Buffers | null;
  shown: Cache | null;
  /** The lights the walls were last drawn by, the nearest the eye: the figures are lit by the same. */
  nearest: readonly Light[] | null;
};

export class DungeonView {
  private readonly gpu: Gpu;
  private readonly pipelines: DungeonPipelines;
  private drawn: Drawn | null = null;
  /** What a frame writes, kept from frame to frame: the view's parts before its grid, the lights, the clusters. */
  private readonly frame = new Float32Array(VIEW_FLOATS.grid);
  private readonly burningFloats = new Float32Array(MOST_LIGHTS * LIGHT_FLOATS);
  private readonly clusters = new LightClusters(MOST_LIGHTS);

  constructor(gpu: Gpu) {
    this.gpu = gpu;
    this.pipelines = dungeonPipelines(gpu);
  }

  /** Lays a model into a vertex and an index buffer, each vertex wearing its picture's layer. */
  private buffersOf(model: ForgedModel, book: SmallBook): Buffers {
    const { device } = this.gpu;
    const packed = modelBuffers([model], (archive, record) => book.layerOf(archive, record));
    const made = (bytes: ArrayBuffer, usage: number) => {
      const buffer = device.createBuffer({
        size: Math.max(16, bytes.byteLength),
        usage: usage | CITY_BUFFER_USAGE.copyDestination,
      });
      device.queue.writeBuffer(buffer, 0, bytes);
      return buffer;
    };
    const indices = packed.indices.buffer as ArrayBuffer;
    return {
      vertices: made(packed.vertices, CITY_BUFFER_USAGE.vertex),
      indices: made(indices, CITY_BUFFER_USAGE.index),
      count: packed.indices.length,
    };
  }

  /** Draws this dungeon from now on, in the island's climate: its exit door in `door`, its cache's wood the
   *  climate's timber, and each style's pieces and landmarks from its pack in `packs`. */
  set(
    layout: DungeonLayout,
    climate: CityClimate,
    door: readonly [number, number],
    props: PropTable,
    packs: ReadonlyMap<StyleKey, ModulePack> = new Map(),
  ): void {
    this.clear();
    const { device } = this.gpu;
    const [timberArchive, timberRecord] = MATERIALS[climate.climate].timber;
    const wood = [timberArchive, timberRecord] as const;
    const forged = layout.props.map(([id]) => propModel(props, id));
    const dressing = dressingOf(layout, packs, climate.climate, propPlans(layout, forged));
    const model = dungeonMesh(
      layout,
      door,
      (mesh) => {
        layout.props.forEach(([, x, y, z, yaw], index) => {
          const prop = forged[index];
          if (prop) layModel(mesh, prop, [x, y, z], yaw);
        });
        for (const fixture of layout.fixtures) fixtureMesh(mesh, fixture, bedOf(layout, fixture));
        dressing.lay(mesh);
      },
      dressing,
    );
    const book = dungeonBook(layout, climate, door, model.parts);
    const painter = new CityPainter(this.gpu, book, () => undefined);
    const view = device.createBuffer({
      size: VIEW_FLOATS.all * 4,
      usage: CITY_BUFFER_USAGE.uniform | CITY_BUFFER_USAGE.copyDestination,
    });
    const lights = device.createBuffer({
      size: MOST_LIGHTS * LIGHT_FLOATS * 4,
      usage: CITY_BUFFER_USAGE.storage | CITY_BUFFER_USAGE.copyDestination,
    });
    const looks = cellWords(layout);
    const cellLooks = device.createBuffer({
      size: Math.max(16, looks.byteLength),
      usage: CITY_BUFFER_USAGE.storage | CITY_BUFFER_USAGE.copyDestination,
    });
    device.queue.writeBuffer(cellLooks, 0, looks);
    const clusters = device.createBuffer({
      size: (CLUSTER_COUNT + MOST_LISTED) * 4,
      usage: CITY_BUFFER_USAGE.storage | CITY_BUFFER_USAGE.copyDestination,
    });
    // The grid and the looks' moods hold for the dungeon; a frame writes the view's parts before them.
    const fixed = new Float32Array(VIEW_FLOATS.all - VIEW_FLOATS.grid);
    fixed.set([layout.cell, layout.columns, layout.rows, 0]);
    layout.looks
      .slice(0, MOST_LOOKS)
      .forEach((look, index) => fixed.set([...MOODS[look.style], 0], VIEW_FLOATS.moods - VIEW_FLOATS.grid + index * 4));
    device.queue.writeBuffer(view, VIEW_FLOATS.grid * 4, fixed);
    const sampler = device.createSampler({
      addressModeU: 'repeat',
      addressModeV: 'repeat',
      magFilter: 'nearest',
      minFilter: 'linear',
      mipmapFilter: 'linear',
    });
    const group = device.createBindGroup({
      layout: this.pipelines.layout,
      entries: [
        { binding: 0, resource: { buffer: view } },
        { binding: 1, resource: { buffer: lights } },
        { binding: 2, resource: painter.view },
        { binding: 3, resource: sampler },
        { binding: 4, resource: { buffer: cellLooks } },
        { binding: 5, resource: { buffer: clusters } },
      ],
    });
    const burning = burningOf(layout);
    const [east, south] = SIDE_STEPS[layout.portal.side] ?? [0, 0];
    const { x, y, height } = layout.portal;
    const portalLight: Light = {
      at: [x - east * PORTAL_OUT_M, y - south * PORTAL_OUT_M, height / 2],
      number: burning.length,
      burning: LIGHT_KINDS.portal,
    };
    const floor = this.buffersOf(model, book);
    this.drawn = {
      layout,
      burning,
      portalLight,
      picker: new NearestLights(burning, portalLight),
      book,
      wood,
      painter,
      view,
      lights,
      cellLooks,
      clusters,
      group,
      floor,
      chest: null,
      shown: null,
      nearest: null,
    };
  }

  /** The cache as the room last said, its chest built again only once it changes. */
  setCache(cache: Cache | null): void {
    const drawn = this.drawn;
    if (!drawn) return;
    const same = (a: Cache | null, b: Cache | null) =>
      a === b ||
      (!!a && !!b && a.x === b.x && a.y === b.y && a.z === b.z && a.bearing === b.bearing && a.open === b.open);
    if (same(drawn.shown, cache)) return;
    drawn.shown = cache;
    for (const buffer of [drawn.chest?.vertices, drawn.chest?.indices]) buffer?.destroy();
    drawn.chest = cache ? this.buffersOf(chestMesh(cache, drawn.wood), drawn.book) : null;
  }

  /** The light a figure standing at a point is lit by at `time`, as the walls round it are: the lights they were last
   *  drawn by and the mood of the cell it stands in. */
  lightAt(point: readonly [number, number, number], time: number): [number, number, number] {
    const drawn = this.drawn;
    if (!drawn) return [1, 1, 1];
    const { layout } = drawn;
    const [column, row] = [Math.floor(point[0] / layout.cell), Math.floor(point[1] / layout.cell)];
    const inside = column >= 0 && row >= 0 && column < layout.columns && row < layout.rows;
    const look = layout.looks[Math.max(0, inside ? (layout.cellLooks[row * layout.columns + column] ?? 0) : 0)];
    return lightAt(drawn.nearest ?? this.lights(drawn), point, time, MOODS[look?.style ?? layout.style]);
  }

  /** The torches and the fixtures, and the portal while it stands open, which is while the cache does. */
  private lights(drawn: Drawn): readonly Light[] {
    return drawn.shown?.open ? [...drawn.burning, drawn.portalLight] : drawn.burning;
  }

  /** Draws the dungeon from an eye at `eye` (the dungeon's metres), lit by the torches nearest it: its depth first,
   *  then lit where its depth is the one laid. */
  drawInto(
    pass: GPURenderPassEncoder,
    fromEye: Float32Array,
    eye: readonly [number, number, number],
    time: number,
  ): void {
    const drawn = this.drawn;
    if (!drawn) return;
    const { device } = this.gpu;
    const { frame, burningFloats, clusters } = this;
    const open = drawn.shown?.open === true;
    const nearest = drawn.picker.nearest(eye, open, MOST_LIGHTS);
    drawn.nearest = nearest;
    for (let index = 0; index < nearest.length; index++)
      lightFloats(nearest[index], burningFloats, index * LIGHT_FLOATS);
    device.queue.writeBuffer(drawn.lights, 0, burningFloats);
    const listed = clusters.build(nearest, fromEye, eye);
    if (listed) device.queue.writeBuffer(drawn.clusters, 0, clusters.words, 0, CLUSTER_COUNT + clusters.listed);
    frame.set(fromEye, VIEW_FLOATS.fromEye);
    frame[VIEW_FLOATS.eye] = eye[0];
    frame[VIEW_FLOATS.eye + 1] = eye[1];
    frame[VIEW_FLOATS.eye + 2] = eye[2];
    frame[VIEW_FLOATS.eye + 3] = time;
    frame[VIEW_FLOATS.lights] = nearest.length;
    frame[VIEW_FLOATS.lights + 1] = open ? 1 : 0;
    frame[VIEW_FLOATS.lights + 2] = listed ? 1 : 0;
    device.queue.writeBuffer(drawn.view, 0, frame);
    pass.setBindGroup(0, drawn.group);
    pass.setPipeline(this.pipelines.depth);
    this.drawMeshes(pass, drawn);
    pass.setPipeline(this.pipelines.lit);
    this.drawMeshes(pass, drawn);
  }

  /** Draws the floor and the cache's chest with the pipeline set. */
  private drawMeshes(pass: GPURenderPassEncoder, drawn: Drawn): void {
    for (const buffers of [drawn.floor, drawn.chest]) {
      if (!buffers) continue;
      pass.setVertexBuffer(0, buffers.vertices);
      pass.setIndexBuffer(buffers.indices, 'uint32');
      pass.drawIndexed(buffers.count);
    }
  }

  /** Stops drawing any dungeon and frees what it drew with. */
  clear(): void {
    const drawn = this.drawn;
    if (!drawn) return;
    drawn.painter.destroy();
    for (const buffer of [
      drawn.view,
      drawn.lights,
      drawn.cellLooks,
      drawn.clusters,
      drawn.floor.vertices,
      drawn.floor.indices,
      drawn.chest?.vertices,
      drawn.chest?.indices,
    ])
      buffer?.destroy();
    this.drawn = null;
  }
}
