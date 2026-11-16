// Everything a city's drawing needs, worked out once when the city is set: its pictures, the models its blocks stand
// and where, every building's masses and hull, its solids and ground, grouped by chunks of cells so the view culls
// and picks tiers a chunk at a time. All positions are metres from the city's middle, so the GPU's floats keep
// their precision.
import { buildingMasses, type Mass } from '../models/buildingPlan.ts';
import type { BuildingTable, KitTable, PropTable } from '../models/tables.ts';
import { type ForgedTables, pictureUses, type PictureUse } from '../textures/picture.ts';
import { type RmbBlock, groundTiles, placed } from './blocks.ts';
import { cellIndex, clearedGround, groundPlates, levelledCells, plateSkirts, sideOf } from './cityGround.ts';
import {
  boxMass,
  hullOf,
  keptMasses,
  MASS_FLOATS,
  MASS_TIER_HULLS,
  MASS_TIER_MASSES,
  massShape,
  writeMass,
} from './cityMasses.ts';
import { forgedModel, type ModelBuffers, modelBuffers, type ModelKey, modelKeyOf } from './cityModels.ts';
import { appendMesh, emptyMesh, type MeshData } from './mesh.ts';
import { pictureBook, type PictureBook, type PictureWant } from './pictures.ts';
import { CELL_M, cellCorner, type CityClimate, type CityPlan, type Solid } from './plan.ts';
import { meshSolid } from './solidMesh.ts';

/** Cells a side of a chunk: about 400 m, a few hundred buildings. */
export const CHUNK_CELLS = 4;
/** The highest a block's building stands over its cell, for a chunk's bounds. */
const TALLEST_M = 60;

export type CityTables = {
  readonly buildings: BuildingTable;
  readonly props: PropTable;
  readonly roomkit?: KitTable;
};

/** A model standing in a near cell: the model's place in the buffers, its origin from the city's middle, its yaw. */
export type NearInstance = { readonly model: number; readonly at: readonly [number, number, number, number] };

export type Range = { first: number; count: number };

export type Chunk = {
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
};

export type CityData = {
  readonly origin: readonly [number, number];
  readonly side: number;
  readonly book: PictureBook;
  /** Each cell's middle from the city's origin and its level, four floats a cell. */
  readonly cells: Float32Array;
  readonly models: ModelBuffers;
  readonly near: ReadonlyMap<number, readonly NearInstance[]>;
  readonly masses: ArrayBuffer;
  readonly chunks: readonly Chunk[];
  readonly solids: MeshData;
  readonly plates: { readonly tops: Float32Array; readonly tiles: Uint8Array; readonly width: number };
  readonly cleared: (x: number, y: number) => boolean;
};

type Placed = {
  cell: number;
  chunk: number;
  key: ModelKey;
  at: [number, number, number, number];
  row: readonly number[];
};

/** Works out a city's drawing from its plan, climate, blocks and the forged tables. */
export function buildCity(
  plan: CityPlan,
  climate: CityClimate,
  blocks: ReadonlyMap<string, RmbBlock>,
  tables: CityTables,
): CityData {
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
  const groundRecords = new Set<number>([3]);
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
  }

  const keys = [...new Set(placedPieces.map((piece) => piece.key))].sort();
  const modelIndex = new Map(keys.map((key, k) => [key, k]));
  const models = keys.map((key) => forgedModel(tables, key));
  const wants = new Map<string, PictureWant>();
  for (const piece of placedPieces) {
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
  const book = pictureBook(climate, wants.values(), groundRecords, (archive, record) => [
    ...(uses.get(`${archive}.${record}`) ?? []),
  ]);

  const near = new Map<number, NearInstance[]>();
  for (const piece of placedPieces) {
    const list = near.get(piece.cell) ?? [];
    list.push({ model: modelIndex.get(piece.key) ?? 0, at: piece.at });
    near.set(piece.cell, list);
  }
  for (const list of near.values()) list.sort((a, b) => a.model - b.model);

  const chunkCount = chunkSide * chunkSide;
  const { masses, massRanges, hullRanges, tops } = buildingMassesOf(plan, placedPieces, tables, book, chunkCount);

  const chunkMeshes = Array.from({ length: chunkCount }, emptyMesh);
  const solidTops = new Float32Array(chunkCount).fill(-Infinity);
  const solidBottoms = new Float32Array(chunkCount).fill(Infinity);
  const reachOf = new Float32Array(chunkCount);
  const solids: Solid[] = [...plan.landmark, ...plan.works, ...plan.social.solids];
  for (const solid of solids) {
    const chunk = chunkOf(
      Math.floor((solid.at[0] - plan.grid.west) / CELL_M),
      Math.floor((solid.at[1] - plan.grid.north) / CELL_M),
    );
    const layer = book.materials[solid.material];
    const picture = book.pictures[layer] ?? { width: 64, height: 64 };
    meshSolid(solid, origin, { layer, width: picture.width, height: picture.height }, chunkMeshes[chunk]);
    const reach = Math.hypot(solid.size[0], solid.size[1]) / 2 + (solid.lean || solid.roll ? solid.size[2] : 0);
    reachOf[chunk] = Math.max(reachOf[chunk], reach);
    solidTops[chunk] = Math.max(solidTops[chunk], solid.at[2] + solid.size[2]);
    solidBottoms[chunk] = Math.min(solidBottoms[chunk], solid.at[2]);
  }
  const stone = book.materials.stone;
  const stonePicture = book.pictures[stone] ?? { width: 64, height: 128 };
  plateSkirts(plan, stone, stonePicture, (cell) => chunkMeshes[chunkOf(cell.column, cell.row)]);
  const allSolids = emptyMesh();
  const solidRanges: Range[] = chunkMeshes.map((mesh) => {
    const first = allSolids.indices.length;
    appendMesh(allSolids, mesh);
    return { first, count: mesh.indices.length };
  });

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
    const reach = reachOf[chunk];
    const hasSolids = solidRanges[chunk].count > 0;
    if (!members.length && !hasSolids) continue;
    const bottom = Math.min(members.length ? lowest - 30 : Infinity, hasSolids ? solidBottoms[chunk] : Infinity);
    const top = Math.max(
      members.length ? highest + TALLEST_M : -Infinity,
      tops[chunk],
      hasSolids ? solidTops[chunk] : -Infinity,
    );
    chunks.push({
      low: [west - reach, north - reach, bottom],
      high: [west + span + reach, north + span + reach, top],
      middlesLow: [west + CELL_M / 2, north + CELL_M / 2, members.length ? lowest : bottom],
      middlesHigh: [west + span - CELL_M / 2, north + span - CELL_M / 2, members.length ? highest : top],
      cells: members.filter((member) => near.has(member)),
      masses: massRanges[chunk],
      hulls: hullRanges[chunk],
      solids: solidRanges[chunk],
    });
  }

  return {
    origin,
    side,
    book,
    cells,
    models: modelBuffers(models, book.layerOf),
    near,
    masses,
    chunks,
    solids: allSolids,
    plates: groundPlates(plan, blocks, book.ground, book.materials.paving),
    cleared: clearedGround(plan),
  };
}

/** Every building's masses (for the middle distance) and hull (for far off), grouped by chunk: all the masses in
 *  chunk order, then all the hulls. */
function buildingMassesOf(
  plan: CityPlan,
  pieces: readonly Placed[],
  tables: CityTables,
  book: PictureBook,
  chunkCount: number,
): { masses: ArrayBuffer; massRanges: Range[]; hullRanges: Range[]; tops: Float32Array } {
  const known = new Map<number, { kept: Mass[]; hull: Mass | null; wall: number; roof: number }>();
  const shapesOf = (id: number) => {
    const found = known.get(id);
    if (found) return found;
    const measure = tables.buildings[id];
    const prop = tables.props[id];
    const all = measure ? buildingMasses(tables.buildings, id) : prop ? [boxMass(prop)] : [];
    const wallLook = measure?.walls[0] ?? measure?.looks[0] ?? prop?.looks[0];
    const roofLook = measure?.roofs[0] ?? measure?.walls[1] ?? wallLook;
    const wall = wallLook ? book.layerOf(wallLook[0], wallLook[1]) : 0;
    const roof = roofLook ? book.layerOf(roofLook[0], roofLook[1]) : wall;
    const made = { kept: all.length ? keptMasses(all) : [], hull: hullOf(all), wall, roof };
    known.set(id, made);
    return made;
  };
  const byChunk: { masses: [Mass, Placed][]; hulls: [Mass, Placed][] }[] = Array.from({ length: chunkCount }, () => ({
    masses: [],
    hulls: [],
  }));
  const tops = new Float32Array(chunkCount).fill(-Infinity);
  for (const piece of pieces) {
    if (!piece.key.startsWith('building:') && !(piece.row.length === 7 && tables.props[piece.row[0]])) continue;
    const shapes = shapesOf(piece.row[0]);
    for (const mass of shapes.kept) byChunk[piece.chunk].masses.push([mass, piece]);
    if (shapes.hull) byChunk[piece.chunk].hulls.push([shapes.hull, piece]);
  }
  const total = byChunk.reduce((sum, chunk) => sum + chunk.masses.length + chunk.hulls.length, 0);
  const masses = new ArrayBuffer(total * MASS_FLOATS * 4);
  const [floats, whole] = [new Float32Array(masses), new Uint32Array(masses)];
  let next = 0;
  const lay = (list: [Mass, Placed][], tier: number, chunk: number): Range => {
    const first = next;
    for (const [mass, piece] of list) {
      const place = {
        east: piece.at[0] + plan.centre[0],
        south: piece.at[1] + plan.centre[1],
        up: piece.at[2],
        yaw: piece.at[3],
      };
      const shape = massShape(mass, place, plan.centre);
      tops[chunk] = Math.max(tops[chunk], shape.base + shape.wall + shape.rise);
      writeMass(floats, whole, next++, shape, shapesOf(piece.row[0]), piece.cell, tier);
    }
    return { first, count: next - first };
  };
  const massRanges = byChunk.map((chunk, k) => lay(chunk.masses, MASS_TIER_MASSES, k));
  const hullRanges = byChunk.map((chunk, k) => lay(chunk.hulls, MASS_TIER_HULLS, k));
  return { masses, massRanges, hullRanges, tops };
}

/** Ranges laid end to end in one buffer, joined where one starts as the last ends, so a run of chunks is one draw. */
export function runs(ranges: readonly Range[]): Range[] {
  const joined: Range[] = [];
  for (const range of ranges) {
    if (!range.count) continue;
    const last = joined[joined.length - 1];
    if (last && last.first + last.count === range.first) last.count += range.count;
    else joined.push({ first: range.first, count: range.count });
  }
  return joined;
}
