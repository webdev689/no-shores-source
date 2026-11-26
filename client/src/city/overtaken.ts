// The Lattice's red crystal grown through a ruined city, the ruined port's people turned to it where they stood,
// placed as formations (`crystalFormations.ts`) by their places' seeds, the same on every machine. Each broken
// building grows clusters out of its break, sheets of shards over its walls, veins up its corners, crystal at its
// doorway and windows, and heavily a mass of spires over the break and patches through the paving; each fallen heap a
// formation at its heart. Great formations stand on the wall's towers and in its breaches, along the quay and at the
// broken piers' ends, out of the largest heaps and some of the most overtaken buildings, most often by the heart of
// the city: the overtaking spread from there. The wrecks are crusted at the waterline. The city crate crowns the
// landmark and crusts the rubble (crates/city/src/overtaken.rs).
import ships from '../../../content/ships/ships.json' with { type: 'json' };
import { randomFromSeed } from '../models/random.ts';
import type { LampPlace } from '../sky/lamps.ts';
import type { MassShape } from './cityMasses.ts';
import { CRYSTAL_LAMP } from './crystal.ts';
import {
  between,
  countOf,
  FORMATION_HEIGHT,
  FORMATION_REACH,
  formationOf,
  type KindName,
  VEIN_STEP_M,
} from './crystalFormations.ts';
import type { CityPlan, Solid, Wreck } from './plan.ts';
import { placeSeed } from './ruins.ts';
import { solidTurn } from './solidMesh.ts';

/** The share of buildings the crystal leaves untouched, and the share it overtakes heavily (the rest lightly). */
export const OVERTAKEN = { untouched: 0.12, heavy: 0.33 } as const;
/** The chance a heavily overtaken building or a large heap bears a great formation: at the city's edge, and at its
 *  heart (the landmark), growing as the square of the nearness. */
export const GREAT_CHANCE = { edge: 0.03, heart: 0.45 } as const;
/** A heap this large across (square metres) is large enough to bear a great formation. */
const LARGE_HEAP_M2 = 150;
/** The window round the plaza no crystal of the page's lies in (crates/city/src/ruins.rs PLAZA_CLEAR_M). */
const PLAZA_CLEAR_M = 110;
/** Mixed into a place's seed, so its crystal draws apart from how it broke. */
const GROWTH_SALT = 0x4c415454;
/** How far apart along the quay a great formation may stand, and the share of those places that bear one. */
const QUAY_STEP_M = 60;
const QUAY_SHARE = 0.6;
/** How far apart round a wreck's waterline its crust's patches lie, metres at its true size. */
const WRECK_STEP_M = 3;

/** How far a formation is drawn: near (in the near cells, with the forged models), in the middle distance (a heavily
 *  overtaken building's, `crystalInstances.ts` MIDDLE_M), or at every distance (a great one). */
export type Reach = 'near' | 'middle' | 'great';
/** A formation placed in the world: which, its foot (east, south, up, metres), the bearing its own +east is turned
 *  to (radians clockwise from east, as a forged model's yaw turns its x), its size and how far it is drawn. */
export type CrystalPlace = {
  readonly formation: number;
  readonly at: readonly number[];
  readonly yaw: number;
  readonly scale: number;
  readonly reach: Reach;
};
type Point = [number, number, number];
type Draw = () => number;

const clamp = (value: number, least: number, most: number) => Math.min(most, Math.max(least, value));
/** The yaw that turns a formation's +east out along a direction (east, south). */
const yawOut = (out: readonly number[]): number => Math.atan2(out[1], out[0]);
const drawsAt = (place: readonly number[]): Draw => {
  const random = randomFromSeed(placeSeed(place[0], place[1]) ^ GROWTH_SALT);
  return () => random.next();
};
/** Whether a place nearness `heart` (0 at the city's edge, 1 at its landmark) bears a great formation, by a draw. */
const bearsGreat = (draw: Draw, heart: number) =>
  draw() < GREAT_CHANCE.edge + (GREAT_CHANCE.heart - GREAT_CHANCE.edge) * heart * heart;

/** The crystal grown through a broken building, its kept masses (its wings, largest first, from the city's middle,
 *  `origin` away) ending at the break, by its place in the world (east, south): none, light or heavy, by the place's
 *  seed; `heart` how near the city's heart it stands (1 at the landmark, 0 at the edge). */
export function buildingGrowth(
  masses: readonly MassShape[],
  origin: readonly number[],
  place: readonly number[],
  heart: number,
): CrystalPlace[] {
  const placed: CrystalPlace[] = [];
  const draw = drawsAt(place);
  const kind = draw();
  if (kind < OVERTAKEN.untouched || !masses.length) return placed;
  const heavy = kind >= 1 - OVERTAKEN.heavy;
  const shapes = masses.map((mass) => massGeometry(mass, origin));
  const [largest] = shapes;
  const any = () => shapes[Math.floor(draw() * shapes.length)];
  const lay = (name: KindName, foot: Point, out: readonly number[], reach: Reach, scale = 1) =>
    placed.push({ formation: formationOf(name, draw), at: foot, yaw: yawOut(out), scale, reach });
  // Out of the break, from the wall tops of its masses.
  const clusters = heavy ? countOf(draw, 2, 3) : countOf(draw, 1, 2);
  for (let cluster = 0; cluster < clusters; cluster++) {
    const mass = any();
    const which = Math.floor(draw() * 4);
    const foot = mass.onSide(which, between(draw, -0.85, 0.85), mass.top);
    if (heavy) lay('breakHeavy', foot, mass.sides[which].out, 'middle', clamp(mass.wall / 3.5, 0.9, 2));
    else lay('breakLight', foot, mass.sides[which].out, 'near');
  }
  // Heavily, a mass of spires rooted on the floor of its largest wing's open shell, rising well over the break, and
  // by the heart's chance a great formation beside it.
  if (heavy) {
    const { half, wall, base } = largest;
    const size = clamp(Math.max(Math.min(half[0], half[1]) / 2.5, (wall * 1.5) / 6), 0.6, 2.5);
    lay('mass', largest.point(0, 0, base), largest.along, 'middle', size);
    if (bearsGreat(draw, heart))
      lay('great', largest.point(0, 0, base), largest.along, 'great', clamp(wall / 4, 0.8, 1.8));
  }
  // Sheets of short shards over its walls' faces, from the ground up.
  for (let sheet = 0, sheets = heavy ? countOf(draw, 2, 4) : countOf(draw, 0, 1); sheet < sheets; sheet++) {
    const mass = any();
    const which = Math.floor(draw() * 4);
    const foot = mass.onSide(which, between(draw, -0.6, 0.6), mass.base + 0.2);
    lay('sheet', foot, mass.sides[which].out, 'near', clamp(mass.wall / 3, 0.6, 2));
  }
  // Veins up its outer corners (a wing's corner inside another wing is none), and heavily up a seam of each long side
  // of its largest wing, from the ground toward the break.
  const inside = (point: Point) => shapes.some((shape) => shape.holds(point));
  for (const mass of shapes) {
    const corners = mass.corners.filter((corner) => !inside(corner.at) && (heavy || draw() < 0.5));
    const seams = heavy && mass === largest ? mass.seams(between(draw, -0.6, 0.6)) : [];
    for (const vein of [...corners, ...seams])
      for (let up = mass.base + 0.3; up < mass.base + mass.wall - 1.2; up += 2 * VEIN_STEP_M)
        if (draw() >= 0.2) lay('vein', [vein.at[0], vein.at[1], up], vein.out, 'near');
  }
  // Where a doorway is, at the foot of its largest wing's long side, and heavily, where windows are.
  const door = 2 + Math.floor(draw() * 2);
  lay('doorway', largest.onSide(door, between(draw, -0.5, 0.5), largest.base, 0.15), largest.sides[door].out, 'near');
  if (heavy && largest.wall >= 3)
    for (const which of [2, 3]) {
      const sill = largest.onSide(which, between(draw, -0.5, 0.5), largest.base + 1.8, 0.1);
      lay('sill', sill, largest.sides[which].out, 'near');
    }
  // Heavy, it breaks through the paving round its foot, where no wing stands.
  if (heavy)
    for (let patch = 0, patches = countOf(draw, 1, 2); patch < patches; patch++) {
      const which = Math.floor(draw() * 4);
      const foot = largest.onSide(which, between(draw, -0.8, 0.8), largest.base - 0.15, between(draw, 1.5, 4));
      if (!inside(foot)) lay('patch', foot, largest.sides[which].out, 'near');
    }
  return placed;
}

/** A wing of a building, broken off at its break, as the crystal grows on it: where a point of its own frame (ahead
 *  along its length, aside across it) stands, its four sides (each's outward direction, its run, where its middle
 *  lies and half its length), its corners and the seams of its long sides, and whether it holds a point. */
function massGeometry(mass: MassShape, origin: readonly number[]) {
  const along = [Math.cos(mass.turn), Math.sin(mass.turn)];
  const across = [-Math.sin(mass.turn), Math.cos(mass.turn)];
  const half = [mass.halfAlong, mass.halfAcross];
  const middle = [mass.east + origin[0], mass.south + origin[1]];
  const point = (ahead: number, aside: number, up: number): Point => [
    middle[0] + along[0] * ahead + across[0] * aside,
    middle[1] + along[1] * ahead + across[1] * aside,
    up,
  ];
  const sides = [
    { out: along, side: across, at: [half[0], 0], run: half[1] },
    { out: [-along[0], -along[1]], side: across, at: [-half[0], 0], run: half[1] },
    { out: across, side: along, at: [0, half[1]], run: half[0] },
    { out: [-across[0], -across[1]], side: along, at: [0, -half[1]], run: half[0] },
  ];
  /** A point on a side, `share` of the way along it from its middle toward its end, `out` metres out from it. */
  const onSide = (which: number, share: number, up: number, out = 0): Point => {
    const { at, side, run, out: outward } = sides[which];
    const centre = point(at[0], at[1], up);
    return [
      centre[0] + side[0] * share * run + outward[0] * out,
      centre[1] + side[1] * share * run + outward[1] * out,
      up,
    ];
  };
  const corners = [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ].map(([ahead, aside]) => ({
    at: point(ahead * half[0], aside * half[1], 0),
    out: [along[0] * ahead + across[0] * aside, along[1] * ahead + across[1] * aside],
  }));
  const seams = (share: number) =>
    [1, -1].map((aside) => ({
      at: point(share * half[0], aside * half[1], 0),
      out: [across[0] * aside, across[1] * aside],
    }));
  /** Whether a point (east, south) stands inside it, short of its walls. */
  const holds = ([east, south]: readonly number[]) => {
    const [x, y] = [east - middle[0], south - middle[1]];
    const ahead = x * along[0] + y * along[1];
    const aside = x * across[0] + y * across[1];
    return Math.abs(ahead) < half[0] - 0.05 && Math.abs(aside) < half[1] - 0.05;
  };
  const top = mass.base + mass.wall - 0.2;
  return { along, half, point, sides, onSide, corners, seams, holds, wall: mass.wall, base: mass.base, top };
}

/** Spires rising through a fallen building's heap, a formation at its heart, by its place in the world (east,
 *  south); none for the untouched share; a large heap may bear a great formation, as a building does. */
export function heapGrowth(heap: Solid, place: readonly number[], heart: number): CrystalPlace[] {
  const draw = drawsAt(place);
  if (draw() < OVERTAKEN.untouched) return [];
  const middle = [heap.at[0], heap.at[1], heap.at[2] + heap.size[2] * 0.5];
  const yaw = draw() * 2 * Math.PI;
  const scale = clamp(heap.size[2] / 2, 0.8, 1.6);
  const placed: CrystalPlace[] = [{ formation: formationOf('heap', draw), at: middle, yaw, scale, reach: 'near' }];
  const across = heap.size[0] * heap.size[1];
  if (across >= LARGE_HEAP_M2 && bearsGreat(draw, heart)) {
    const size = clamp(Math.sqrt(across) / 14, 0.8, 1.6);
    placed.push({ formation: formationOf('great', draw), at: middle, yaw, scale: size, reach: 'great' });
  }
  return placed;
}

/** The great formations on a ruin's works: on every tower and gatehouse tower of its wall (broken off at half its
 *  height, a stone column) and in every breach (a heap of its fall), at the far end of every broken pier, and along
 *  the quay; each by its place's seed. */
export function worksGrowth(works: readonly Solid[]): CrystalPlace[] {
  const placed: CrystalPlace[] = [];
  const great = (foot: readonly number[], least: number, most: number) => {
    const draw = drawsAt(foot);
    placed.push({
      formation: formationOf('great', draw),
      at: foot,
      yaw: draw() * 2 * Math.PI,
      scale: between(draw, least, most),
      reach: 'great',
    });
  };
  for (const solid of works) {
    const height = solid.size[2];
    const tower = solid.shape === 'column' && solid.material === 'stone' && solid.size[0] >= 13;
    if (tower) great([solid.at[0], solid.at[1], solid.at[2] + height - 0.3], 1, 1.6);
    if (solid.shape === 'pyramid' && solid.material === 'rubble' && height >= 4)
      great([solid.at[0], solid.at[1], solid.at[2] + height * 0.6], 0.9, 1.3);
    if (solid.shape !== 'block') continue;
    // a block's own +y runs along its length, turned
    const run = [-Math.sin(solid.turn), Math.cos(solid.turn)];
    const along = (metres: number) => [solid.at[0] + run[0] * metres, solid.at[1] + run[1] * metres];
    // a pier runs out to sea along its own +y (crates/city/src/walls.rs harbour_works): its broken end is there
    if (solid.material === 'timber') great([...along(solid.size[1] / 2), solid.at[2] + height], 0.8, 1.1);
    const quay = solid.material === 'stone' && Math.abs(solid.size[0] - 8) < 1e-6 && solid.at[2] < 0;
    if (quay)
      for (let metres = -solid.size[1] / 2 + QUAY_STEP_M / 2; metres < solid.size[1] / 2; metres += QUAY_STEP_M) {
        const [east, south] = along(metres);
        if (drawsAt([east, south])() < QUAY_SHARE) great([east, south, solid.at[2] + height], 0.7, 1);
      }
  }
  return placed;
}

/** A wreck's crust: patches of shards round its waterline, as long and broad as its ship's hull, each placed from
 *  the wreck's middle (east, south, up) at its true size; the page sets them out as large as it draws the wreck. */
export function wreckCrust(wreck: Wreck): CrystalPlace[] {
  const [low, high] = ships.ships[wreck.ship].boxes.hull;
  const [halfLength, halfBeam] = [(high[0] - low[0]) / 2, (high[1] - low[1]) / 2];
  const forward = [Math.sin(wreck.heading), -Math.cos(wreck.heading)];
  const starboard = [Math.cos(wreck.heading), Math.sin(wreck.heading)];
  const draw = drawsAt(wreck.at);
  const crust: CrystalPlace[] = [];
  const steps = Math.round((2 * Math.PI * Math.hypot(halfLength, halfBeam)) / Math.SQRT2 / WRECK_STEP_M);
  for (let step = 0; step < steps; step++) {
    if (draw() < 0.3) continue;
    const angle = ((step + draw() * 0.6) / steps) * 2 * Math.PI;
    const [ahead, aside] = [Math.cos(angle) * halfLength * 0.92, Math.sin(angle) * halfBeam];
    const out = [0, 1].map((axis) => forward[axis] * Math.cos(angle) + starboard[axis] * Math.sin(angle));
    const from = [0, 1].map((axis) => forward[axis] * ahead + starboard[axis] * aside);
    crust.push({
      formation: formationOf('patch', draw),
      at: [from[0], from[1], -0.2],
      yaw: yawOut(out),
      scale: 1,
      reach: 'great',
    });
  }
  return crust;
}

/** The night's lamps the crown's crystal lights: at the `most` tallest of its spires, half way up each body. */
export function crystalLamps(great: readonly Solid[], most: number): LampPlace[] {
  return great
    .filter((solid) => solid.shape === 'column' && solid.top > 0)
    .sort((a, b) => b.size[2] - a.size[2])
    .slice(0, most)
    .map((solid, index) => {
      const middle = solidTurn(solid, [0, 0, solid.size[2] / 2]);
      return {
        at: [solid.at[0] + middle[0], solid.at[1] + middle[1], solid.at[2] + middle[2]],
        reachM: Math.min(30, 6 + solid.size[2]),
        light: CRYSTAL_LAMP,
        seed: index * 0.618 + solid.at[0] * 0.001,
        motion: 'stone',
      };
    });
}

/** The lamp a great formation lights at night: a third of the way up it, reaching as far as it stands tall and
 *  6 m more, at most 30 m. */
export function greatLamp(place: CrystalPlace, index: number): LampPlace {
  const height = FORMATION_HEIGHT[place.formation] * place.scale;
  return {
    at: [place.at[0], place.at[1], place.at[2] + height / 3],
    reachM: Math.min(30, 6 + height),
    light: CRYSTAL_LAMP,
    seed: index * 0.618,
    motion: 'stone',
  };
}

/** Whether a point (east, south), `reach` metres round it, reaches into the window round the plaza, where no crystal
 *  of the page's lies. */
export function inPlazaWindow(point: readonly number[], reach: number, plan: CityPlan): boolean {
  const [west, north, east, south] = plan.social.bounds;
  return (
    point[0] + reach > west - PLAZA_CLEAR_M &&
    point[0] - reach < east + PLAZA_CLEAR_M &&
    point[1] + reach > north - PLAZA_CLEAR_M &&
    point[1] - reach < south + PLAZA_CLEAR_M
  );
}

/** Whether a placed formation stands clear of the plaza's window, as far as it reaches at its size. */
export const clearOfPlaza = (place: CrystalPlace, plan: CityPlan): boolean =>
  !inPlazaWindow(place.at, FORMATION_REACH[place.formation] * place.scale, plan);
