// Everything a city's drawing needs, worked out once when the city is set: its pictures, the models its blocks stand
// and where, every building's masses and hull, its solids and ground, grouped by chunks of cells so the view culls
// and picks tiers a chunk at a time. All positions are metres from the city's middle, so the GPU's floats keep
// their precision. The work goes a step at a time (`cityBuildSteps`), so a frame can take a few and leave the rest.
import type { BuildingTable, KitTable, PropTable } from '../models/tables.ts';
import { type ForgedTables, pictureUses, type PictureUse } from '../textures/picture.ts';
import { type RmbBlock, groundTiles, placed } from './blocks.ts';
import { buildingMassesOf, type Placed } from './cityBuildings.ts';
import {
  cellIndex,
  clearedGroundSteps,
  groundPlateSteps,
  levelledCells,
  plateSkirtSteps,
  sideOf,
} from './cityGround.ts';
import { forgedModel, type ModelBuffers, modelBufferSteps, modelKeyOf } from './cityModels.ts';
import { emptyMesh, laidMeshSteps } from './mesh.ts';
import { pictureBook, type PictureBook, type PictureWant } from './pictures.ts';
import { CELL_M, cellCorner, type CityClimate, type CityPlan, type Solid, solidReach, type Wreck } from './plan.ts';
import type { LampPlace } from '../sky/lamps.ts';
import { FORMATION_HEIGHT, FORMATION_REACH, FORMATIONS, formationMeshes } from './crystalFormations.ts';
import { type CrystalInstances, crystalInstances } from './crystalInstances.ts';
import { clearOfPlaza, type CrystalPlace, crystalLamps, greatLamp, worksGrowth, wreckCrust } from './overtaken.ts';
import { meshSolid } from './solidMesh.ts';
import { finished } from './steps.ts';
import { type Reach, reachesWhole, reachFrom } from './tiers.ts';

/** Cells a side of a chunk: about 400 m, a few hundred buildings. */
export const CHUNK_CELLS = 4;
/** The highest a block's building stands over its cell, and the most one reaches past its cell's edge, for a
 *  chunk's bounds. */
const TALLEST_M = 60;
const OVERHANG_M = 20;
/** The materials laid as ground, whose pieces join as one surface: a walk's flagstones, a lawn, trodden earth. */
const GROUNDS: ReadonlySet<Solid['material']> = new Set(['path', 'lawn', 'earth']);
/** A retaining wall's thickness, as the planner lays it. */
const RETAINING_THICK_M = 1.2;
const TERRACE_WALL_M = 16;
/** The great spires of the crown on a ruin's landmark that light the night. */
const CROWN_LAMPS = 3;

export type CityTables = {
  readonly buildings: BuildingTable;
  readonly props: PropTable;
  readonly roomkit?: KitTable;
};

/** A model standing in a near cell: the model's place in the buffers, its origin from the city's middle, its yaw,
 *  in a ruin the height over its origin it is broken off at (0 standing whole), and how many times its size it is
 *  drawn (a crystal formation's; 1 for a forged model). */
export type NearInstance = {
  readonly model: number;
  readonly at: readonly [number, number, number, number];
  readonly cut: number;
  readonly scale: number;
};

export type Range = { first: number; count: number };

export type Chunk = {
  /** Its place among the grid's chunks, row by row. */
  readonly index: number;
  /** The box everything in the chunk stands in, from the city's middle. */
  readonly low: [number, number, number];
  readonly high: [number, number, number];
  /** The box its cells' middles span, which the tiers are chosen by. */
  readonly middlesLow: [number, number, number];
  readonly middlesHigh: [number, number, number];
  readonly cells: number[];
  readonly masses: Range;
  readonly hulls: Range;
  readonly solids: Range;
  /** The Lattice's small crystal in a ruin, drawn only near: its shards and its lesser spires. */
  readonly detail: Range;
};

export type CityData = {
  readonly origin: readonly [number, number];
  /** The grid's north-west corner from the city's middle, and its cells a side. */
  readonly grid: readonly [number, number];
  readonly side: number;
  readonly book: PictureBook;
  /** Each cell's middle from the city's origin and its level, four floats a cell. */
  readonly cells: Float32Array;
  readonly models: ModelBuffers;
  readonly near: ReadonlyMap<number, readonly NearInstance[]>;
  readonly masses: ArrayBuffer;
  readonly chunks: readonly Chunk[];
  /** Every chunk's solids, then every chunk's detail, laid end to end as the GPU reads them (`laidMeshSteps`), each
   *  chunk's `solids` and `detail` its runs. */
  readonly solids: { readonly vertices: ArrayBuffer; readonly indices: Uint32Array };
  readonly plates: { readonly tops: Float32Array; readonly tiles: Uint8Array; readonly width: number };
  readonly cleared: (x: number, y: number) => boolean;
  /** Whether the city is a ruin, its broken buildings open to the sky. */
  readonly ruined: boolean;
  /** The lamps a ruin's crystal lights at night, a few at each great formation. */
  readonly lamps: readonly LampPlace[];
  /** A ruin's crystal formations drawn by instance past the near cells (`crystalInstances.ts`), the first of them
   *  model `firstFormation`. */
  readonly crystal: CrystalInstances;
  readonly firstFormation: number;
  /** A ruin's wrecks, each with its crust, placed from its middle at its true size. */
  readonly wrecks: readonly { readonly wreck: Wreck; readonly crust: readonly CrystalPlace[] }[];
};

/** Works out a city's drawing from its plan, climate, blocks and the forged tables, in one go. */
export function buildCity(
  plan: CityPlan,
  climate: CityClimate,
  blocks: ReadonlyMap<string, RmbBlock>,
  tables: CityTables,
): CityData {
  return finished(cityBuildSteps(plan, climate, blocks, tables));
}

/** Works out a city's drawing as `buildCity` does, a step at a time (`steps.ts`): a cell's pieces, a model, a piece's
 *  masses, a solid, a run of vertices. */
export function* cityBuildSteps(
  plan: CityPlan,
  climate: CityClimate,
  blocks: ReadonlyMap<string, RmbBlock>,
  tables: CityTables,
): Generator<void, CityData> {
  const origin = plan.centre;
  const side = sideOf(plan);
  const chunkSide = Math.ceil(side / CHUNK_CELLS);
  const chunkOf = (column: number, row: number): number =>
    Math.floor(Math.min(Math.max(row, 0), side - 1) / CHUNK_CELLS) * chunkSide +
    Math.floor(Math.min(Math.max(column, 0), side - 1) / CHUNK_CELLS);
  const levelled = levelledCells(plan);
  const cells = new Float32Array(side * side * 4);
  for (const [index, cell] of levelled) {
    const [west, north] = cellCorner(plan, cell);
    cells.set([west + CELL_M / 2 - origin[0], north + CELL_M / 2 - origin[1], cell.level, 1], index * 4);
  }

  const placedPieces: Placed[] = [];
  // grass and stone too: the lawns and kerbs laid where no block stands
  const groundRecords = new Set<number>([2, 3]);
  for (const [index, cell] of levelled) {
    const block = cell.use === 'block' && cell.block ? blocks.get(cell.block) : undefined;
    if (!block) continue;
    for (const tile of groundTiles(block)) groundRecords.add(tile.record);
    const corner = cellCorner(plan, cell);
    const chunk = chunkOf(cell.column, cell.row);
    for (const [rows, kind] of [
      [block.buildings, 'building'],
      [block.props, 'prop'],
    ] as const)
      for (const row of rows) {
        const place = placed(corner, cell.level, row);
        placedPieces.push({
          cell: index,
          chunk,
          key: modelKeyOf(tables, row[0], kind),
          at: [place.east - origin[0], place.south - origin[1], place.up, place.yaw],
          row,
        });
      }
    yield;
  }

  // models a layout placed in the world stand in the cell under them, at their own height and yaw
  for (const piece of plan.pieces ?? []) {
    const [column, row] = [
      Math.floor((piece.at[0] - plan.grid.west) / CELL_M),
      Math.floor((piece.at[1] - plan.grid.north) / CELL_M),
    ];
    const index = cellIndex(side, column, row);
    if (!levelled.has(index)) continue;
    const yaw = (piece.yaw * Math.PI) / 180;
    placedPieces.push({
      cell: index,
      chunk: chunkOf(column, row),
      key: modelKeyOf(tables, piece.model, piece.building ? 'building' : 'prop', piece.open),
      at: [piece.at[0] - origin[0], piece.at[1] - origin[1], piece.at[2], yaw],
      row: piece.building ? [piece.model, 0, 0, 0, piece.yaw, 0, 0] : [piece.model, 0, 0, 0, piece.yaw, 1],
    });
  }

  const keys = [...new Set(placedPieces.map((piece) => piece.key))].sort();
  const modelIndex = new Map(keys.map((key, k) => [key, k]));
  const models: ReturnType<typeof forgedModel>[] = [];
  for (const key of keys) {
    models.push(forgedModel(tables, key));
    yield;
  }
  const wants = new Map<string, PictureWant>();
  for (const piece of placedPieces) {
    yield;
    const model = models[modelIndex.get(piece.key) ?? 0];
    for (const part of model?.parts ?? []) {
      const key = `${part.archive}.${part.record}`;
      const found = wants.get(key) ?? {
        archive: part.archive,
        record: part.record,
        weight: 0,
        uses: new Set<PictureUse>(),
      };
      found.weight += part.count / 3;
      wants.set(key, found);
    }
  }
  // the models' tables mark a missing door picture null where the textures' type leaves it out; pictureUses skips both
  const forged = {
    buildings: tables.buildings,
    props: tables.props,
    roomkit: tables.roomkit ?? {},
  } as unknown as ForgedTables;
  const uses = pictureUses(forged);
  yield;
  const chalky = [...plan.landmark, ...plan.works, ...plan.social.solids].some((solid) => solid.material === 'chalk');
  const book = pictureBook(
    climate,
    wants.values(),
    groundRecords,
    (archive, record) => [...(uses.get(`${archive}.${record}`) ?? [])],
    chalky,
  );

  const chunkCount = chunkSide * chunkSide;
  yield;
  const { masses, massRanges, hullRanges, tops, heaps, crystal } = yield* buildingMassesOf(
    plan,
    placedPieces,
    tables,
    book,
    chunkCount,
  );
  const near = new Map<number, NearInstance[]>();
  for (const piece of placedPieces) {
    yield;
    if (piece.ruin?.fallen) continue;
    const list = near.get(piece.cell) ?? [];
    list.push({ model: modelIndex.get(piece.key) ?? 0, at: piece.at, cut: piece.ruin?.cut ?? 0, scale: 1 });
    near.set(piece.cell, list);
  }
  // The crystal's formations, after the forged models: the near ones by instance in their buildings' cells, with
  // them; the rest by chunk, or at every distance.
  const chunkAt = (point: readonly number[]) =>
    chunkOf(Math.floor((point[0] - plan.grid.west) / CELL_M), Math.floor((point[1] - plan.grid.north) / CELL_M));
  const works = plan.ruined ? worksGrowth(plan.works).filter((place) => clearOfPlaza(place, plan)) : [];
  yield;
  // the works' formations are all great ones, standing in no building's cell
  const placedCrystal = [
    ...crystal,
    ...works.map((place) => ({ cell: -1, place: { ...place, reach: 'great' as const } })),
  ];
  for (const { cell, place } of placedCrystal) {
    if (place.reach !== 'near') continue;
    const list = near.get(cell) ?? [];
    const stands = [place.at[0] - origin[0], place.at[1] - origin[1], place.at[2], place.yaw] as const;
    list.push({ model: models.length + place.formation, at: stands, cut: 0, scale: place.scale });
    near.set(cell, list);
  }
  for (const list of near.values()) list.sort((a, b) => a.model - b.model);
  yield;
  const inChunks = (reach: CrystalPlace['reach']) =>
    placedCrystal.flatMap(({ place }) => (place.reach === reach ? [{ chunk: chunkAt(place.at), place }] : []));
  const [great, middle] = [inChunks('great'), inChunks('middle')];

  const chunkMeshes = Array.from({ length: chunkCount }, emptyMesh);
  const detailMeshes = Array.from({ length: chunkCount }, emptyMesh);
  // each chunk's solids' box, west, north, bottom, then east, south, top, from the city's middle: a solid past the
  // grid's edge is kept with the edge chunk, so the chunk's box must reach it
  const solidBoxes = Array.from({ length: chunkCount }, () => [
    Infinity,
    Infinity,
    Infinity,
    -Infinity,
    -Infinity,
    -Infinity,
  ]);
  // The crate's crystal on a ruin's rubble is small, drawn near; its crown on the landmark is drawn at every distance.
  const crusting = (solid: Solid) => plan.ruined === true && solid.material === 'crystal' && solid.shape === 'column';
  const detail = plan.works.filter(crusting);
  const solids: Solid[] = [
    ...plan.landmark,
    ...plan.works.filter((solid) => !crusting(solid)),
    ...plan.social.solids,
    ...heaps,
  ];
  const onRamp = rampWall(plan);
  for (const [solid, meshes] of [
    ...solids.map((solid) => [solid, chunkMeshes] as const),
    ...detail.map((solid) => [solid, detailMeshes] as const),
  ]) {
    const chunk = chunkOf(
      Math.floor((solid.at[0] - plan.grid.west) / CELL_M),
      Math.floor((solid.at[1] - plan.grid.north) / CELL_M),
    );
    const layer = retaining(solid) || onRamp(solid) ? book.terrace : book.materials[solid.material];
    const picture = book.pictures[layer] ?? { width: 64, height: 64 };
    const grounded = GROUNDS.has(solid.material);
    meshSolid(solid, origin, { layer, width: picture.width, height: picture.height, grounded }, meshes[chunk]);
    const reach = solidReach(solid);
    const [east, south] = [solid.at[0] - origin[0], solid.at[1] - origin[1]];
    const box = solidBoxes[chunk];
    const reached = [east - reach, south - reach, solid.at[2] - reach, east + reach, south + reach];
    for (let axis = 0; axis < 3; axis++) box[axis] = Math.min(box[axis], reached[axis]);
    box[3] = Math.max(box[3], reached[3]);
    box[4] = Math.max(box[4], reached[4]);
    box[5] = Math.max(box[5], solid.at[2] + solid.size[2] + reach);
    yield;
  }
  // A chunk's box holds its crystal too, as far as each formation reaches and stands at its size.
  for (const { chunk, place } of [...great, ...middle]) {
    const box = solidBoxes[chunk];
    const [reach, height] = [FORMATION_REACH, FORMATION_HEIGHT].map((each) => each[place.formation] * place.scale);
    const [east, south] = [place.at[0] - origin[0], place.at[1] - origin[1]];
    const reached = [east - reach, south - reach, place.at[2], east + reach, south + reach, place.at[2] + height];
    for (let axis = 0; axis < 3; axis++) box[axis] = Math.min(box[axis], reached[axis]);
    for (let axis = 3; axis < 6; axis++) box[axis] = Math.max(box[axis], reached[axis]);
  }
  yield;
  const terracePicture = book.pictures[book.terrace] ?? { width: 64, height: 128 };
  yield* plateSkirtSteps(plan, book.terrace, terracePicture, (cell) => chunkMeshes[chunkOf(cell.column, cell.row)]);
  const laid = yield* laidMeshSteps([...chunkMeshes, ...detailMeshes]);
  const [solidRanges, detailRanges] = [laid.ranges.slice(0, chunkCount), laid.ranges.slice(chunkCount)];

  const chunks: Chunk[] = [];
  for (let chunk = 0; chunk < chunkCount; chunk++) {
    const [chunkColumn, chunkRow] = [chunk % chunkSide, Math.floor(chunk / chunkSide)];
    const west = plan.grid.west + chunkColumn * CHUNK_CELLS * CELL_M - origin[0];
    const north = plan.grid.north + chunkRow * CHUNK_CELLS * CELL_M - origin[1];
    const span = CHUNK_CELLS * CELL_M;
    const members: number[] = [];
    let [lowest, highest] = [Infinity, -Infinity];
    for (let row = chunkRow * CHUNK_CELLS; row < Math.min(side, (chunkRow + 1) * CHUNK_CELLS); row++)
      for (let column = chunkColumn * CHUNK_CELLS; column < Math.min(side, (chunkColumn + 1) * CHUNK_CELLS); column++) {
        const cell = levelled.get(cellIndex(side, column, row));
        if (!cell) continue;
        members.push(cellIndex(side, column, row));
        lowest = Math.min(lowest, cell.level);
        highest = Math.max(highest, cell.level);
      }
    const hasSolids = solidRanges[chunk].count + detailRanges[chunk].count > 0 || Number.isFinite(solidBoxes[chunk][0]);
    if (!members.length && !hasSolids) continue;
    const box = solidBoxes[chunk];
    const [cellLow, cellHigh] = members.length
      ? [
          [west - OVERHANG_M, north - OVERHANG_M, lowest - 30],
          [west + span + OVERHANG_M, north + span + OVERHANG_M, Math.max(highest + TALLEST_M, tops[chunk])],
        ]
      : [
          [Infinity, Infinity, Infinity],
          [-Infinity, -Infinity, -Infinity],
        ];
    const [bottom, top] = [Math.min(cellLow[2], box[2]), Math.max(cellHigh[2], box[5])];
    chunks.push({
      index: chunk,
      low: [Math.min(cellLow[0], box[0]), Math.min(cellLow[1], box[1]), bottom],
      high: [Math.max(cellHigh[0], box[3]), Math.max(cellHigh[1], box[4]), top],
      middlesLow: [west + CELL_M / 2, north + CELL_M / 2, members.length ? lowest : bottom],
      middlesHigh: [west + span - CELL_M / 2, north + span - CELL_M / 2, members.length ? highest : top],
      cells: members.filter((member) => near.has(member)),
      masses: massRanges[chunk],
      hulls: hullRanges[chunk],
      solids: solidRanges[chunk],
      detail: detailRanges[chunk],
    });
    yield;
  }

  const formations = plan.ruined ? formationMeshes(book.materials.crystal) : [];
  yield;
  const modelData = yield* modelBufferSteps(models, book.layerOf, formations);
  const plates = yield* groundPlateSteps(plan, blocks, book.ground, book.materials.paving);
  const cleared = yield* clearedGroundSteps(plan);
  const crystalDrawn = crystalInstances(great, middle, origin, FORMATIONS.length, chunkCount);
  yield;
  return {
    origin,
    grid: [plan.grid.west - origin[0], plan.grid.north - origin[1]],
    side,
    book,
    cells,
    models: modelData,
    near,
    masses,
    chunks,
    solids: { vertices: laid.vertices, indices: laid.indices },
    plates,
    cleared,
    ruined: plan.ruined === true,
    lamps: [
      ...crystalLamps(
        plan.landmark.filter((solid) => solid.material === 'crystal'),
        CROWN_LAMPS,
      ),
      ...great.map(({ place }, index) => greatLamp(place, index)),
    ],
    crystal: crystalDrawn,
    firstFormation: models.length,
    wrecks: (plan.ruined ? (plan.wrecks ?? []) : []).map((wreck) => ({ wreck, crust: wreckCrust(wreck) })),
  };
}

/** The ranges of the crystal's small detail to draw: those of the chunks within the whole tier's reach of the eye
 *  (measured from the city's middle), joined where they meet, laid into `into` (emptied first). */
export function detailRuns(chunks: readonly Chunk[], eye: readonly number[], into: Range[] = []): Range[] {
  let laid = 0;
  for (const chunk of chunks) {
    if (!chunk.detail.count || !reachesWhole(reachFrom(chunk.middlesLow, chunk.middlesHigh, eye, REACH).nearest))
      continue;
    laid = joinRun(into, laid, chunk.detail);
  }
  into.length = laid;
  return into;
}

/** A chunk's reach, laid afresh by each chunk over the last's. */
const REACH: Reach = { nearest: 0, farthest: 0 };

/** Lays `range` after the first `laid` runs of `into`, joined to the last where it starts as that ends, reusing a
 *  run already there; answers how many are laid. */
function joinRun(into: Range[], laid: number, range: Range): number {
  const last = laid > 0 ? into[laid - 1] : undefined;
  if (last && last.first + last.count === range.first) {
    last.count += range.count;
    return laid;
  }
  const slot = into[laid];
  if (slot) [slot.first, slot.count] = [range.first, range.count];
  else into[laid] = { first: range.first, count: range.count };
  return laid + 1;
}

/** Whether a solid is a terrace's retaining wall: a stone block a cell long (or a length of one a ramp cuts) and
 *  1.2 m thick, square to the grid, as the planner lays one along a terrace's edge, no taller than a terrace steps.
 *  The landmark's platform, far taller, keeps the city's stone. */
export function retaining(solid: Solid): boolean {
  const [long, thick] = [Math.max(solid.size[0], solid.size[1]), Math.min(solid.size[0], solid.size[1])];
  return (
    solid.shape === 'block' &&
    solid.material === 'stone' &&
    solid.turn === 0 &&
    solid.lean === 0 &&
    long < CELL_M + 0.01 &&
    Math.abs(thick - RETAINING_THICK_M) < 0.01 &&
    solid.size[2] <= TERRACE_WALL_M
  );
}

/** Whether a solid is one of a ramp's walls, which wear the terrace walls' picture: a stone block standing on a
 *  ramp's or a switchback's pad, as the planner stands every wall of theirs. */
export function rampWall(plan: CityPlan): (solid: Solid) => boolean {
  const ramps = plan.ramps ?? [];
  return (solid) =>
    solid.shape === 'block' &&
    solid.material === 'stone' &&
    ramps.some(
      ({ bounds: [west, north, east, south] }) =>
        solid.at[0] > west && solid.at[0] < east && solid.at[1] > north && solid.at[1] < south,
    );
}

/** Ranges laid end to end in one buffer, joined where one starts as the last ends, so a run of chunks is one draw:
 *  each item's range as `rangeOf` reads it, laid into `into` (emptied first, its runs reused, so a view keeps one
 *  list a draw). */
export function runs<Item>(items: readonly Item[], rangeOf: (item: Item) => Range, into: Range[] = []): Range[] {
  let laid = 0;
  for (const item of items) {
    const range = rangeOf(item);
    if (range.count) laid = joinRun(into, laid, range);
  }
  into.length = laid;
  return into;
}
