// Every building of a city as its drawing lays it out (`cityBuild.ts`): its masses for the middle distance and its
// hull for far off, grouped by chunk; in a ruin each broken, and the Lattice's crystal grown through it.
import { buildingMasses, type Mass } from '../models/buildingPlan.ts';
import type { CityTables, Range } from './cityBuild.ts';
import { sideOf } from './cityGround.ts';
import {
  boxMass,
  hullOf,
  keptMasses,
  MASS_FLOATS,
  MASS_RUIN,
  MASS_TIER_HULLS,
  MASS_TIER_MASSES,
  massShape,
  writeMass,
} from './cityMasses.ts';
import type { ModelKey } from './cityModels.ts';
import { buildingGrowth, clearOfPlaza, type CrystalPlace, heapGrowth } from './overtaken.ts';
import type { PictureBook } from './pictures.ts';
import { CELL_M, type CityPlan, type Solid } from './plan.ts';
import { brokenMass, buildingRuin, type BuildingRuin, fallenHeap } from './ruins.ts';

/** A piece of a block or a layout placed in the city: its cell and chunk, its model, where it stands from the city's
 *  middle and its yaw, and its block's row. */
export type Placed = {
  cell: number;
  chunk: number;
  key: ModelKey;
  at: [number, number, number, number];
  row: readonly number[];
  /** In a ruin, how a building stands. */
  ruin?: BuildingRuin;
};

/** Every building's masses (for the middle distance) and hull (for far off), grouped by chunk: all the masses in
 *  chunk order, then all the hulls. In a ruin each building is broken (`ruins.ts`): a fallen one leaves a heap
 *  among the solids instead, a broken one's masses and hull end at its break, roofless; and the Lattice's crystal
 *  grows through each (`overtaken.ts`), none over the plaza, each great formation lighting a lamp. */
export function* buildingMassesOf(
  plan: CityPlan,
  pieces: readonly Placed[],
  tables: CityTables,
  book: PictureBook,
  chunkCount: number,
): Generator<
  void,
  {
    masses: ArrayBuffer;
    massRanges: Range[];
    hullRanges: Range[];
    tops: Float32Array;
    heaps: Solid[];
    crystal: { cell: number; place: CrystalPlace }[];
  }
> {
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
  const heaps: Solid[] = [];
  const crystal: { cell: number; place: CrystalPlace }[] = [];
  const overtake = (grown: readonly CrystalPlace[], cell: number) => {
    for (const place of grown) if (clearOfPlaza(place, plan, 0)) crystal.push({ cell, place });
  };
  // How near the city's heart a place stands: 1 at its middle, 0 at the grid's edge.
  const reachM = (sideOf(plan) * CELL_M) / 2;
  const heartOf = (east: number, south: number) =>
    Math.max(0, 1 - Math.hypot(east - plan.centre[0], south - plan.centre[1]) / reachM);
  const placeOf = (piece: Placed) => ({
    east: piece.at[0] + plan.centre[0],
    south: piece.at[1] + plan.centre[1],
    up: piece.at[2],
    yaw: piece.at[3],
  });
  for (const piece of pieces) {
    yield;
    const building = piece.key.startsWith('building:') || piece.key.startsWith('open:');
    if (!building && !(piece.row.length === 7 && tables.props[piece.row[0]])) continue;
    const shapes = shapesOf(piece.row[0]);
    if (plan.ruined && shapes.hull) {
      const place = placeOf(piece);
      // broken under its lowest wing's eaves, so no wing keeps its roof
      const eaves = Math.min(...shapes.kept.map((mass) => mass.eaves));
      piece.ruin = buildingRuin(place.east, place.south, { ...shapes.hull, eaves });
      if (piece.ruin.fallen) {
        const heap = fallenHeap(massShape(shapes.hull, place, plan.centre), plan.centre);
        heaps.push(heap);
        const heart = heartOf(place.east, place.south);
        if (building) overtake(heapGrowth(heap, [place.east, place.south], heart), piece.cell);
        continue;
      }
      const cut = piece.ruin.cut;
      const wings: Mass[] = [];
      for (const mass of shapes.kept) {
        const broken = brokenMass(mass, cut);
        if (broken) wings.push(broken);
      }
      for (const wing of wings) byChunk[piece.chunk].masses.push([wing, piece]);
      const hull = brokenMass(shapes.hull, cut);
      if (hull) {
        byChunk[piece.chunk].hulls.push([hull, piece]);
        if (building)
          overtake(
            buildingGrowth(
              wings.map((wing) => massShape(wing, place, plan.centre)),
              plan.centre,
              [place.east, place.south],
              heartOf(place.east, place.south),
            ),
            piece.cell,
          );
      }
      continue;
    }
    for (const mass of shapes.kept) byChunk[piece.chunk].masses.push([mass, piece]);
    if (shapes.hull) byChunk[piece.chunk].hulls.push([shapes.hull, piece]);
  }
  const total = byChunk.reduce((sum, chunk) => sum + chunk.masses.length + chunk.hulls.length, 0);
  const masses = new ArrayBuffer(total * MASS_FLOATS * 4);
  const [floats, whole] = [new Float32Array(masses), new Uint32Array(masses)];
  let next = 0;
  const scorched = plan.ruined ? MASS_RUIN : 0;
  const lay = (list: [Mass, Placed][], tier: number, chunk: number): Range => {
    const first = next;
    for (const [mass, piece] of list) {
      const shape = massShape(mass, placeOf(piece), plan.centre);
      tops[chunk] = Math.max(tops[chunk], shape.base + shape.wall + shape.rise);
      writeMass(floats, whole, next++, shape, shapesOf(piece.row[0]), piece.cell, tier | scorched);
    }
    return { first, count: next - first };
  };
  const [massRanges, hullRanges]: Range[][] = [[], []];
  for (const [k, chunk] of byChunk.entries()) {
    massRanges.push(lay(chunk.masses, MASS_TIER_MASSES, k));
    yield;
  }
  for (const [k, chunk] of byChunk.entries()) {
    hullRanges.push(lay(chunk.hulls, MASS_TIER_HULLS, k));
    yield;
  }
  return { masses, massRanges, hullRanges, tops, heaps, crystal };
}
