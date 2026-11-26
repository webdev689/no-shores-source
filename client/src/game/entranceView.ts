// A patrol's dungeon entrances drawn with the land: each its forged model, lifted and turned where it stands, in the
// island's climate's pictures, through the city's own pipelines (lit by the sun, in its shadows and casting them).
import {
  CITY_BUFFER_USAGE,
  CITY_VIEW_BYTES,
  type CityPipelines,
  cityPipelines,
  darkPoolMap,
  originInstance,
  poolBindings,
} from '../city/cityGpu.ts';
import { modelBuffers } from '../city/cityModels.ts';
import { CityPainter, painting } from '../city/painter.ts';
import { standIn } from '../standIns.ts';
import { PICTURE_LAYERS } from '../city/pictures.ts';
import type { CityClimate } from '../city/plan.ts';
import type { Shot } from './camera.ts';
import type { Drawer } from './scene.ts';
import { type Gpu, TEXTURE_USAGE } from '../gpu.ts';
import { type ForgedModel, meshBuilder } from '../models/model.ts';
import { propModel } from '../models/props.ts';
import type { PropTable } from '../models/tables.ts';
import type { ShadowMap } from '../shadow.ts';
import { skyUniformFor } from '../sky/skyUniform.ts';
import { smallBook, type Wanted } from './dungeonBook.ts';
import { ENTRANCE_MODELS, type Entrance, layModel, standOf } from './entrances.ts';

const VIEW_BYTES = CITY_VIEW_BYTES;

/** The entrances' models laid as one, each turned and lifted into the world, from `origin` (x, y). */
export function entrancesModel(
  entrances: readonly Entrance[],
  props: PropTable,
  origin: readonly [number, number],
): ForgedModel {
  const joined = meshBuilder();
  for (const entrance of entrances) {
    const model = propModel(props, ENTRANCE_MODELS[entrance.model] ?? -1);
    const [x, y, z] = standOf(entrance);
    if (model) layModel(joined, model, [x - origin[0], y - origin[1], z], entrance.yaw);
  }
  return joined.model();
}

/** The pictures the entrances wear: their door's picture for their door, the rest as a prop's. */
function wantedOf(model: ForgedModel, entrances: readonly Entrance[], props: PropTable): Wanted[] {
  const doors = new Set(
    entrances
      .map((entrance) => props[ENTRANCE_MODELS[entrance.model] ?? -1]?.doorLook)
      .map((look) => look && `${look[0]}.${look[1]}`),
  );
  return model.parts.map((part): Wanted => [
    part.archive,
    part.record,
    doors.has(`${part.archive}.${part.record}`) ? 'door' : 'prop',
  ]);
}

type Drawn = {
  readonly painter: CityPainter;
  readonly group: GPUBindGroup;
  readonly view: GPUBuffer;
  readonly buffers: readonly GPUBuffer[];
  readonly tiles: GPUTexture;
  readonly dark: GPUTexture;
  readonly vertices: GPUBuffer;
  readonly indices: GPUBuffer;
  readonly place: GPUBuffer;
  readonly count: number;
  readonly origin: readonly [number, number];
};

/** A patrol's entrances, set once its room has said where they stand. */
export class EntranceView implements Drawer {
  private readonly gpu: Gpu;
  private readonly pipelines: CityPipelines;
  private drawn: Drawn | null = null;

  constructor(gpu: Gpu) {
    this.gpu = gpu;
    this.pipelines = cityPipelines(gpu);
  }

  /** Draws these entrances from now on, in the island's climate. */
  set(entrances: readonly Entrance[], props: PropTable, climate: CityClimate): void {
    this.clear();
    const first = entrances[0];
    if (!first) return;
    const { device } = this.gpu;
    const origin = [first.x, first.y] as const;
    const model = entrancesModel(entrances, props, origin);
    const book = smallBook(climate, wantedOf(model, entrances, props));
    const packed = modelBuffers([model], (archive, record) => book.layerOf(archive, record));
    const buffers: GPUBuffer[] = [];
    const buffer = (bytes: ArrayBuffer | ArrayBufferView, usage: number) => {
      const size = Math.max(16, Math.ceil(bytes.byteLength / 4) * 4);
      const made = device.createBuffer({ size, usage: usage | CITY_BUFFER_USAGE.copyDestination });
      if (bytes.byteLength) device.queue.writeBuffer(made, 0, bytes);
      buffers.push(made);
      return made;
    };
    const tiles = device.createTexture({
      size: [1, 1],
      format: 'rg8uint',
      usage: TEXTURE_USAGE.textureBinding | TEXTURE_USAGE.copyDestination,
    });
    const painter = new CityPainter(this.gpu, book, () => undefined);
    // the entrances light no pools at night: a dark light map, let go with the tiles
    const dark = darkPoolMap(device);
    const view = buffer(new ArrayBuffer(VIEW_BYTES), CITY_BUFFER_USAGE.uniform);
    const sizes = new Float32Array(PICTURE_LAYERS * 4).fill(64);
    book.pictures.forEach((picture, layer) => sizes.set([picture.width, picture.height], layer * 4));
    const group = device.createBindGroup({
      layout: this.pipelines.layout,
      entries: [
        { binding: 0, resource: { buffer: view } },
        { binding: 1, resource: { buffer: buffer(new Float32Array(4), CITY_BUFFER_USAGE.storage) } },
        { binding: 2, resource: { buffer: buffer(sizes, CITY_BUFFER_USAGE.storage) } },
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
        ...poolBindings(device, dark),
      ],
    });
    this.drawn = {
      painter,
      group,
      view,
      buffers,
      tiles,
      dark,
      // Laid as the city lays its solids: already in place, one instance at the origin, always drawn.
      vertices: buffer(packed.vertices, CITY_BUFFER_USAGE.vertex),
      indices: buffer(packed.indices, CITY_BUFFER_USAGE.index),
      place: buffer(originInstance(), CITY_BUFFER_USAGE.vertex),
      count: packed.indices.length,
      origin,
    };
  }

  /** Writes the view's terms: the eye from the entrances' origin, and the time. */
  private termsWritten(fromEye: Float32Array, shot: Shot, time: number): Drawn | null {
    const drawn = this.drawn;
    if (!drawn) return null;
    const uniforms = new Float32Array(VIEW_BYTES / 4);
    uniforms.set(fromEye, 0);
    uniforms.set([shot.eye[0] - drawn.origin[0], shot.eye[1] - drawn.origin[1], shot.eye[2], time], 16);
    this.gpu.device.queue.writeBuffer(drawn.view, 0, uniforms);
    return drawn;
  }

  private drawWith(pass: GPURenderPassEncoder, drawn: Drawn): void {
    pass.setBindGroup(0, drawn.group);
    pass.setVertexBuffer(0, drawn.vertices);
    pass.setVertexBuffer(1, drawn.place);
    pass.setIndexBuffer(drawn.indices, 'uint32');
    pass.drawIndexed(drawn.count);
  }

  castInto(pass: GPURenderPassEncoder, fromEye: Float32Array, shot: Shot, time: number, shadow: ShadowMap): void {
    const drawn = this.termsWritten(fromEye, shot, time);
    if (!drawn) return;
    pass.setPipeline(this.pipelines.modelsCast);
    pass.setBindGroup(1, shadow.casterGroup(this.pipelines.modelsCast));
    this.drawWith(pass, drawn);
  }

  drawInto(pass: GPURenderPassEncoder, fromEye: Float32Array, shot: Shot, time: number, shadow: ShadowMap): void {
    const drawn = this.termsWritten(fromEye, shot, time);
    if (!drawn) return;
    if (painting(drawn.painter)) standIn('entrance pictures');
    pass.setPipeline(this.pipelines.models);
    pass.setBindGroup(1, shadow.receiverGroup(this.pipelines.models));
    // The sky, as the city binds it: the terrain drawn just before leaves groups only its own pipeline can read.
    skyUniformFor(this.gpu.device).bindShared(pass, [2]);
    this.drawWith(pass, drawn);
  }

  /** Stops drawing any entrance and frees what they drew with. */
  clear(): void {
    const drawn = this.drawn;
    if (!drawn) return;
    drawn.painter.destroy();
    drawn.tiles.destroy();
    drawn.dark.destroy();
    for (const buffer of drawn.buffers) buffer.destroy();
    this.drawn = null;
  }
}
