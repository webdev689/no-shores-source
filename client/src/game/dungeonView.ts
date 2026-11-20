// A dungeon drawn on WebGPU: its floor's mesh, dressed in its styles' pieces and landmarks, and its cache in its
// pictures, painted by the city's painter, lit by the lights nearest the eye. A Drawer the dungeon's scene draws into
// its pass.
import { CITY_BUFFER_USAGE } from '../city/cityGpu.ts';
import { modelBuffers } from '../city/cityModels.ts';
import { CityPainter } from '../city/painter.ts';
import { MATERIALS } from '../city/pictures.ts';
import type { CityClimate } from '../city/plan.ts';
import { REVERSED_DEPTH } from '../editor/orbit.ts';
import { type Gpu, SHADER_STAGE } from '../gpu.ts';
import type { ForgedModel } from '../models/model.ts';
import { SAMPLES } from '../water/waterView.ts';
import { dungeonBook, type SmallBook } from './dungeonBook.ts';
import { propPlans } from './dungeonCells.ts';
import { type Cache, chestMesh } from './dungeonChest.ts';
import { type DungeonLayout, SIDE_STEPS, type StyleKey } from './dungeonLayout.ts';
import { dressingOf } from './dungeonDressing.ts';
import { burningOf, LIGHT_KINDS, type Light, lightAt, moodLooks, MOODS } from './dungeonLight.ts';
import { dungeonMesh } from './dungeonMesh.ts';
import type { ModulePack } from './dungeonModules.ts';
import { bedOf, fixtureMesh } from './dungeonFixtures.ts';
import { layModel } from './entrances.ts';
import { propModel } from '../models/props.ts';
import type { PropTable } from '../models/tables.ts';
import { DUNGEON_SHADER, LIGHT_FLOATS, lightFloats, MOST_LIGHTS, MOST_LOOKS, VIEW_FLOATS } from './dungeonShaders.ts';

/** How far out from its face the open portal's light stands, metres. */
const PORTAL_OUT_M = 0.6;

type Buffers = { vertices: GPUBuffer; indices: GPUBuffer; count: number };

const pipelines = new WeakMap<GPUDevice, Map<GPUTextureFormat, GPURenderPipeline>>();

/** The dungeon's pipeline, made once a GPU and format: drawn into the dungeon scene's pass (4x MSAA, depth reversed),
 *  each face wound as the city winds its solids. */
function pipelineOf(gpu: Gpu): GPURenderPipeline {
  const byFormat = pipelines.get(gpu.device) ?? new Map<GPUTextureFormat, GPURenderPipeline>();
  pipelines.set(gpu.device, byFormat);
  const known = byFormat.get(gpu.format);
  if (known) return known;
  const both = SHADER_STAGE.vertex | SHADER_STAGE.fragment;
  const layout = gpu.device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: both, buffer: { type: 'uniform' } },
      { binding: 1, visibility: SHADER_STAGE.fragment, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: SHADER_STAGE.fragment, texture: { sampleType: 'float', viewDimension: '2d-array' } },
      { binding: 3, visibility: SHADER_STAGE.fragment, sampler: { type: 'filtering' } },
      { binding: 4, visibility: SHADER_STAGE.fragment, buffer: { type: 'read-only-storage' } },
    ],
  });
  const module = gpu.device.createShaderModule({ code: DUNGEON_SHADER });
  const made = gpu.device.createRenderPipeline({
    layout: gpu.device.createPipelineLayout({ bindGroupLayouts: [layout] }),
    vertex: {
      module,
      entryPoint: 'dungeon_vertex',
      buffers: [
        {
          arrayStride: 36,
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x3' },
            { shaderLocation: 1, offset: 12, format: 'float32x3' },
            { shaderLocation: 2, offset: 24, format: 'float32x2' },
            { shaderLocation: 3, offset: 32, format: 'uint32' },
          ],
        },
      ],
    },
    fragment: { module, entryPoint: 'dungeon_fragment', targets: [{ format: gpu.format }] },
    primitive: { topology: 'triangle-list', cullMode: 'back', frontFace: 'cw' },
    depthStencil: { format: REVERSED_DEPTH.format, depthWriteEnabled: true, depthCompare: REVERSED_DEPTH.compare },
    multisample: { count: SAMPLES },
  });
  byFormat.set(gpu.format, made);
  return made;
}

/** What one dungeon draws with, made when it is set. */
type Drawn = {
  readonly layout: DungeonLayout;
  /** The torches and the fixtures, each as it burns. */
  readonly burning: readonly Light[];
  /** The open portal's light, half way up its face and a little out from it. */
  readonly portalLight: Light;
  readonly book: SmallBook;
  readonly wood: readonly [number, number];
  readonly painter: CityPainter;
  readonly view: GPUBuffer;
  readonly lights: GPUBuffer;
  readonly cellLooks: GPUBuffer;
  readonly group: GPUBindGroup;
  readonly floor: Buffers;
  chest: Buffers | null;
  shown: Cache | null;
};

export class DungeonView {
  private readonly gpu: Gpu;
  private readonly pipeline: GPURenderPipeline;
  private drawn: Drawn | null = null;

  constructor(gpu: Gpu) {
    this.gpu = gpu;
    this.pipeline = pipelineOf(gpu);
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
    const looks = moodLooks(layout);
    const cellLooks = device.createBuffer({
      size: Math.max(16, looks.byteLength),
      usage: CITY_BUFFER_USAGE.storage | CITY_BUFFER_USAGE.copyDestination,
    });
    device.queue.writeBuffer(cellLooks, 0, looks);
    const sampler = device.createSampler({
      addressModeU: 'repeat',
      addressModeV: 'repeat',
      magFilter: 'nearest',
      minFilter: 'linear',
      mipmapFilter: 'linear',
    });
    const group = device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: view } },
        { binding: 1, resource: { buffer: lights } },
        { binding: 2, resource: painter.view },
        { binding: 3, resource: sampler },
        { binding: 4, resource: { buffer: cellLooks } },
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
      book,
      wood,
      painter,
      view,
      lights,
      cellLooks,
      group,
      floor,
      chest: null,
      shown: null,
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

  /** The light a figure standing at a point is lit by at `time`, as the walls round it are: its lights and the mood
   *  of the cell it stands in. */
  lightAt(point: readonly [number, number, number], time: number): [number, number, number] {
    const drawn = this.drawn;
    if (!drawn) return [1, 1, 1];
    const { layout } = drawn;
    const [column, row] = [Math.floor(point[0] / layout.cell), Math.floor(point[1] / layout.cell)];
    const inside = column >= 0 && row >= 0 && column < layout.columns && row < layout.rows;
    const look = layout.looks[Math.max(0, inside ? (layout.cellLooks[row * layout.columns + column] ?? 0) : 0)];
    return lightAt(this.lights(drawn), point, time, MOODS[look?.style ?? layout.style]);
  }

  /** The torches and the fixtures, and the portal while it stands open, which is while the cache does. */
  private lights(drawn: Drawn): readonly Light[] {
    return drawn.shown?.open ? [...drawn.burning, drawn.portalLight] : drawn.burning;
  }

  /** Draws the dungeon from an eye at `eye` (the dungeon's metres), lit by the torches nearest it. */
  drawInto(
    pass: GPURenderPassEncoder,
    fromEye: Float32Array,
    eye: readonly [number, number, number],
    time: number,
  ): void {
    const drawn = this.drawn;
    if (!drawn) return;
    const { device } = this.gpu;
    // Nearest by how far each reaches past the eye, so a brazier's wide light outranks a candle's at one distance.
    const away = ({ at: [x, y, z], burning }: Light) => Math.hypot(x - eye[0], y - eye[1], z - eye[2]) - burning.reach;
    const nearest = [...this.lights(drawn)].sort((a, b) => away(a) - away(b)).slice(0, MOST_LIGHTS);
    const lights = new Float32Array(MOST_LIGHTS * LIGHT_FLOATS);
    nearest.forEach((light, index) => lights.set(lightFloats(light), index * LIGHT_FLOATS));
    device.queue.writeBuffer(drawn.lights, 0, lights);
    const { layout } = drawn;
    const view = new Float32Array(VIEW_FLOATS.all);
    view.set(fromEye, VIEW_FLOATS.fromEye);
    view.set([...eye, time], VIEW_FLOATS.eye);
    view.set([nearest.length, drawn.shown?.open ? 1 : 0, 0, 0], VIEW_FLOATS.lights);
    view.set([layout.cell, layout.columns, layout.rows, 0], VIEW_FLOATS.grid);
    layout.looks
      .slice(0, MOST_LOOKS)
      .forEach((look, index) => view.set([...MOODS[look.style], 0], VIEW_FLOATS.moods + index * 4));
    device.queue.writeBuffer(drawn.view, 0, view);
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, drawn.group);
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
      drawn.floor.vertices,
      drawn.floor.indices,
      drawn.chest?.vertices,
      drawn.chest?.indices,
    ])
      buffer?.destroy();
    this.drawn = null;
  }
}
