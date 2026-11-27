// A dungeon drawn on WebGPU: its floor's mesh, dressed in its styles' pieces and landmarks and an Elite Dungeon's
// encounters, its drowned floors' water while their seals hold, and its cache in its pictures, painted by the city's
// painter, lit by the lights nearest the eye, each fragment by those its cluster lists, the light a player carries
// among them. A Drawer the dungeon's scene draws into its pass, its depth first and then lit; its torches', fixtures'
// and lamps' flames are fires (`flames`), each seeded by its light's number so it flickers with the light it casts.
import { CITY_BUFFER_USAGE } from '../city/cityGpu.ts';
import { modelBuffers } from '../city/cityModels.ts';
import { CityPainter, painting } from '../city/painter.ts';
import { Flames } from '../cinema/flames.ts';
import { CARRIED_SEED, HAND_M } from '../sky/lamps.ts';
import { standIn } from '../standIns.ts';
import { MATERIALS } from '../city/pictures.ts';
import type { CityClimate } from '../city/plan.ts';
import type { Gpu } from '../gpu.ts';
import { type ForgedModel, type MeshBuilder, meshBuilder } from '../models/model.ts';
import { dungeonBook, type SmallBook } from './dungeonBook.ts';
import { propPlans } from './dungeonCells.ts';
import { CLUSTER_COUNT, LightClusters, MOST_LISTED } from './dungeonClusters.ts';
import { type Cache, chestMesh, chestsMesh, foundChest } from './dungeonChest.ts';
import type { ChestDrawn } from './finds.ts';
import { type DungeonLayout, SIDE_STEPS, STOREY_M, storeysOf, storeyUnder, type StyleKey } from './dungeonLayout.ts';
import { reachOf, seenFrom, type Spaces, spaceAt, spacesOf } from './dungeonSpaces.ts';
import { dressingOf } from './dungeonDressing.ts';
import { burningOf, cellWords, LIGHT_KINDS, type Light, lightAt, MOODS, NearestLights } from './dungeonLight.ts';
import { dungeonMesh } from './dungeonMesh.ts';
import type { StoreyPlane } from './dungeonStoreyPlanes.ts';
import { drownedNow, layEncounters, waterMesh } from './encounterMesh.ts';
import type { EncounterSeen } from '../network/encounterMessages.ts';
import type { ModulePack } from './dungeonModules.ts';
import { type DungeonPipelines, dungeonPipelines } from './dungeonPipelines.ts';
import { bedOf, fixtureMesh } from './dungeonFixtures.ts';
import { layModel } from './entrances.ts';
import { propModel } from '../models/props.ts';
import type { PropTable } from '../models/tables.ts';
import { LIGHT_FLOATS, lightFloats, MOST_LIGHTS, MOST_LOOKS, VIEW_FLOATS } from './dungeonShaders.ts';

/** How far out from its face the open portal's light stands, metres. */
const PORTAL_OUT_M = 0.6;
/** Each flame after a light's first is seeded this much past it, so a cluster's candles burn each their own way. */
const FLAME_SEED_STEP = 0.37;

/** The flames of the dungeon last shown, which its scene draws over the finished picture; none once it is let go. */
export const DUNGEON_FLAMES: { current: Flames | null } = { current: null };

/** The light a player carries under ground: where it burns, moved each frame, and how. */
type CarriedLight = {
  readonly at: [number, number, number];
  readonly number: number;
  readonly burning: Light['burning'];
};

type Buffers = { vertices: GPUBuffer; indices: GPUBuffer; count: number };

/** What one dungeon draws with, made when it is set. */
type Drawn = {
  readonly layout: DungeonLayout;
  /** The torches and the fixtures, each as it burns. */
  readonly burning: readonly Light[];
  /** The open portal's light, half way up its face and a little out from it. */
  readonly portalLight: Light;
  /** A passage zone's pieces' lights as they burn now, numbered after the portal's. */
  pieceLights: readonly Light[];
  /** Picks the lights each frame is lit by. */
  picker: NearestLights;
  /** What joins its storeys, for the spaces each light and surface lies in (`dungeonSpaces.ts`). */
  readonly spaces: Spaces;
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
  /** The chests the dungeon stands for the player to find, and what they were last built from. */
  finds: Buffers | null;
  findsShown: string;
  /** The still water over the Ascents' floors whose seals hold, and which those are, as last built. */
  water: Buffers | null;
  drowned: string;
  /** The lights the walls were last drawn by, the nearest the eye: the figures are lit by the same. */
  nearest: readonly Light[] | null;
  /** A passage zone's pieces from their pack, and what they were last laid for. */
  pieces: Buffers | null;
  piecesKey: string;
  /** The light the player carries, while they carry one. */
  carried: CarriedLight | null;
};

export class DungeonView {
  private readonly gpu: Gpu;
  private readonly pipelines: DungeonPipelines;
  private drawn: Drawn | null = null;
  /** What a frame writes, kept from frame to frame: the view's parts before its grid, the lights, the clusters. */
  private readonly frame = new Float32Array(VIEW_FLOATS.grid);
  private readonly burningFloats = new Float32Array(MOST_LIGHTS * LIGHT_FLOATS);
  private readonly clusters = new LightClusters(MOST_LIGHTS);
  /** The flames its lights burn from, drawn as fires over the finished picture: one of the scene's drawers. */
  readonly flames: Flames;

  constructor(gpu: Gpu) {
    this.gpu = gpu;
    this.pipelines = dungeonPipelines(gpu);
    this.flames = new Flames(gpu);
  }

  /** Lights a fire for each flame the lights burn from, seeded by the light's number. */
  private lightFlames(lights: readonly Light[]): void {
    this.flames.clear();
    for (const { number, flames } of lights)
      flames?.forEach((flame, index) =>
        this.flames.light(flame.at, flame.sizeM, number + index * FLAME_SEED_STEP, flame.along),
      );
  }

  /** Picks each frame's lights from the dungeon's, a passage's pieces' and the carried one's, and the portal's while
   *  it stands open. */
  private pickerOf(drawn: Drawn): NearestLights {
    const carried = drawn.carried ? [drawn.carried] : [];
    return new NearestLights([...drawn.burning, ...drawn.pieceLights, ...carried], drawn.portalLight);
  }

  /** The light the player carries (`torch` or `lantern`), at the hand over their `feet` (the dungeon's metres), or
   *  none. */
  setCarried(light: 'torch' | 'lantern' | null, feet: readonly [number, number, number]): void {
    const drawn = this.drawn;
    if (!drawn) return;
    const burning = light && LIGHT_KINDS[light];
    if ((drawn.carried?.burning ?? null) !== burning) {
      drawn.carried = burning ? { at: [0, 0, 0], number: CARRIED_SEED, burning } : null;
      drawn.picker = this.pickerOf(drawn);
    }
    if (drawn.carried) drawn.carried.at.splice(0, 3, feet[0], feet[1], feet[2] + HAND_M);
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
   *  climate's timber, and each style's pieces and landmarks from its pack in `packs`; `pieces` lays a passage
   *  zone's pieces as they first stand, so the pictures they wear are in the dungeon's book (`setPieces`). */
  set(
    layout: DungeonLayout,
    climate: CityClimate,
    door: readonly [number, number],
    props: PropTable,
    packs: ReadonlyMap<StyleKey, ModulePack> = new Map(),
    pieces?: (mesh: MeshBuilder) => void,
  ): void {
    this.clear();
    const { device } = this.gpu;
    const [timberArchive, timberRecord] = MATERIALS[climate.climate].timber;
    const wood = [timberArchive, timberRecord] as const;
    const forged = layout.props.map(([id]) => propModel(props, id));
    // Each storey is furnished from its own floor, with its own props, fixtures and seals.
    const forgedOn = (plane: StoreyPlane) => plane.props.map((index) => forged[index] ?? null);
    const dressing = dressingOf(layout, packs, climate.climate, (plane) => propPlans(plane.layout, forgedOn(plane)));
    const model = dungeonMesh(
      layout,
      door,
      (mesh, plane) => {
        const models = forgedOn(plane);
        plane.layout.props.forEach(([, x, y, z, yaw], index) => {
          const prop = models[index];
          if (prop) layModel(mesh, prop, [x, y, z], yaw);
        });
        for (const fixture of plane.layout.fixtures) fixtureMesh(mesh, fixture, bedOf(plane.layout, fixture));
        dressing.lay(mesh, plane);
        layEncounters(mesh, plane.layout);
      },
      dressing,
    );
    const laid = meshBuilder();
    pieces?.(laid);
    const book = dungeonBook(layout, climate, door, [...model.parts, ...laid.model().parts]);
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
    fixed.set([layout.cell, layout.columns, layout.rows, layout.storeyM ?? STOREY_M]);
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
    const spaces = spacesOf(layout);
    const portalAt = [x - east * PORTAL_OUT_M, y - south * PORTAL_OUT_M, (layout.portal.z ?? 0) + height / 2] as const;
    const portalLight: Light = {
      at: portalAt,
      number: burning.length,
      burning: LIGHT_KINDS.portal,
      ...(storeysOf(layout) > 1 ? { space: reachOf(layout, spaces, portalAt, LIGHT_KINDS.portal.reach) } : {}),
    };
    const floor = this.buffersOf(model, book);
    this.lightFlames(burning);
    DUNGEON_FLAMES.current = this.flames;
    this.drawn = {
      layout,
      burning,
      portalLight,
      pieceLights: [],
      picker: new NearestLights(burning, portalLight),
      spaces,
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
      finds: null,
      findsShown: '',
      water: null,
      drowned: '',
      nearest: null,
      pieces: null,
      piecesKey: '',
      carried: null,
    };
  }

  /** A passage zone's pieces as `lay` lays them and the lights they burn (`passagePieceLights`), built again only
   *  when `key` (what they stand as) changes; none without `lay`. */
  setPieces(lay: ((mesh: MeshBuilder) => void) | null, key: string, lit: readonly Light[] = []): void {
    const drawn = this.drawn;
    if (!drawn || (key === drawn.piecesKey && (drawn.pieces !== null) === (lay !== null))) return;
    drawn.piecesKey = key;
    const after = drawn.portalLight.number + 1;
    drawn.pieceLights = lit.map((light, index) => ({ ...light, number: after + index }));
    drawn.picker = this.pickerOf(drawn);
    this.lightFlames([...drawn.burning, ...drawn.pieceLights]);
    for (const buffer of [drawn.pieces?.vertices, drawn.pieces?.indices]) buffer?.destroy();
    const mesh = meshBuilder();
    lay?.(mesh);
    drawn.pieces = lay ? this.buffersOf(mesh.model(), drawn.book) : null;
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

  /** The chests standing for the player to find (finds.ts), each centred where the room stands it, its lid swung
   *  back as the player opens it; built again only as one stands, goes or swings. */
  setFinds(chests: readonly ChestDrawn[]): void {
    const drawn = this.drawn;
    if (!drawn) return;
    const shown = chests.map(foundChest);
    const key = shown.map((chest) => `${chest.x},${chest.y},${(chest.lid ?? 0).toFixed(2)},${chest.vault}`).join(';');
    if (key === drawn.findsShown) return;
    drawn.findsShown = key;
    for (const buffer of [drawn.finds?.vertices, drawn.finds?.indices]) buffer?.destroy();
    drawn.finds = shown.length > 0 ? this.buffersOf(chestsMesh(shown, drawn.wood), drawn.book) : null;
  }

  /** An Elite Dungeon's encounters as the room last said: its drowned floors' water built again only as a seal over
   *  one breaks or the room says it holds again. */
  setEncounter(seen: EncounterSeen | null): void {
    const drawn = this.drawn;
    if (!drawn) return;
    const drowned = drownedNow(drawn.layout, seen);
    const key = drowned.join(',');
    if (key === drawn.drowned && (drawn.water !== null) === drowned.length > 0) return;
    drawn.drowned = key;
    for (const buffer of [drawn.water?.vertices, drawn.water?.indices]) buffer?.destroy();
    const water = waterMesh(drawn.layout, drowned);
    drawn.water = water ? this.buffersOf(water, drawn.book) : null;
  }

  /** The light a figure standing at a point is lit by at `time`, as the walls round it are: the lights they were last
   *  drawn by and the mood of the cell it stands in. */
  lightAt(point: readonly [number, number, number], time: number): [number, number, number] {
    const drawn = this.drawn;
    if (!drawn) return [1, 1, 1];
    const { layout } = drawn;
    const [column, row] = [Math.floor(point[0] / layout.cell), Math.floor(point[1] / layout.cell)];
    const inside = column >= 0 && row >= 0 && column < layout.columns && row < layout.rows;
    const cell = (storeyUnder(layout, point[2]) * layout.rows + row) * layout.columns + column;
    const look = layout.looks[Math.max(0, inside ? (layout.cellLooks[cell] ?? 0) : 0)];
    const space = spaceAt(layout, drawn.spaces, point);
    return lightAt(drawn.nearest ?? this.lights(drawn), point, time, MOODS[look?.style ?? layout.style], space);
  }

  /** The torches, the fixtures, the pieces' lights and the carried one, and the portal while it stands open, which is
   *  while the cache does. */
  private lights(drawn: Drawn): readonly Light[] {
    const burning = [...drawn.burning, ...drawn.pieceLights, ...(drawn.carried ? [drawn.carried] : [])];
    return drawn.shown?.open ? [...burning, drawn.portalLight] : burning;
  }

  /** The dungeon's mesh as drawn now, which its map inks from the same buffers; null with no dungeon set. */
  get mesh(): Buffers | null {
    return this.drawn?.floor ?? null;
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
    if (painting(drawn.painter)) standIn('dungeon pictures');
    const { device } = this.gpu;
    const { frame, burningFloats, clusters } = this;
    const open = drawn.shown?.open === true;
    const nearest = drawn.picker.nearest(eye, open, MOST_LIGHTS, seenFrom(drawn.layout, drawn.spaces, eye));
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

  /** Draws the floor, the cache's chest, the chests to find, the drowned floors' water and a passage's pieces with the
   *  pipeline set. */
  private drawMeshes(pass: GPURenderPassEncoder, drawn: Drawn): void {
    for (const buffers of [drawn.floor, drawn.chest, drawn.finds, drawn.water, drawn.pieces]) {
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
    this.flames.clear();
    if (DUNGEON_FLAMES.current === this.flames) DUNGEON_FLAMES.current = null;
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
      drawn.finds?.vertices,
      drawn.finds?.indices,
      drawn.water?.vertices,
      drawn.water?.indices,
      drawn.pieces?.vertices,
      drawn.pieces?.indices,
    ])
      buffer?.destroy();
    this.drawn = null;
  }
}
