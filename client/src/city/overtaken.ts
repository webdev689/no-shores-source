// The Lattice's red crystal grown through a ruined city's buildings, the ruined port's people turned to it where they
// stood: clusters of six-sided spires leaning out of each broken building's wall tops, veins of shards climbing its
// corners and seams, shards choking its foot where a doorway is and its walls where windows are, patches breaking
// through the paving round the most overtaken; spires rising through a fallen building's heap; a crust on the harbour's
// wrecks at the waterline. Each is seeded by its place, the same on every machine. The small crystal is a few dozen
// formations made once (`FORMATIONS`) and placed by instance near the eye, as the forged models are; a heavy building's
// great spire is a solid, drawn at every distance. The city crate crowns the landmark and crusts the rubble
// (crates/city/src/overtaken.rs) with the same spire.
import ships from '../../../content/ships/ships.json' with { type: 'json' };
import { randomFromSeed } from '../models/random.ts';
import type { LampPlace } from '../sky/lamps.ts';
import type { MassShape } from './cityMasses.ts';
import { CRYSTAL_LAMP } from './crystal.ts';
import { emptyMesh, type MeshData } from './mesh.ts';
import { type CityPlan, type Solid, solidReach, type Wreck } from './plan.ts';
import { placeSeed } from './ruins.ts';
import { meshSolid, solidTurn } from './solidMesh.ts';

/** The faces round a spire; its body's share of its height, its body's top a share of its width (as the crate's). */
const SPIRE_SIDES = 6;
const BODY_SHARE = 0.75;
const BODY_TOP = 0.8;
/** A spire at least this tall, metres, is a great one: drawn at every distance and lighting the night. */
export const GREAT_M = 8;
/** A heavily overtaken building's spire is never lower than this, metres, however low the building stands. */
const HEAVY_SPIRE_LEAST_M = 5.5;
/** The share of buildings the crystal leaves untouched, and the share it overtakes heavily (the rest lightly). */
export const OVERTAKEN = { untouched: 0.12, heavy: 0.33 } as const;
/** The window round the plaza no crystal of the page's lies in (crates/city/src/ruins.rs PLAZA_CLEAR_M). */
const PLAZA_CLEAR_M = 110;
/** Mixed into a place's seed, so its crystal draws apart from how it broke. */
const GROWTH_SALT = 0x4c415454;
/** A vein's formation: two shards a step apart up a wall, stacked a formation every two steps. */
const VEIN_STEP_M = 1.1;

/** A formation of the small crystal placed in the world: which, its foot (east, south, up, metres) and the bearing
 *  its own +east is turned to (radians clockwise from east, as a forged model's yaw turns its x). */
export type CrystalPlace = { readonly formation: number; readonly at: readonly number[]; readonly yaw: number };
/** What grows on one thing: its great spires, its small solids drawn only near, and its formations placed. */
export type Growth = { readonly great: Solid[]; readonly detail: Solid[]; readonly placed: CrystalPlace[] };
type Point = [number, number, number];
type Draw = () => number;

/** A spire of crystal on `foot`: a six-sided body tapering into a pointed tip, turned, leaned toward its own +y and
 *  rolled about its own y, radians. */
export function spire(
  foot: readonly number[],
  height: number,
  width: number,
  turns: readonly number[],
): [Solid, Solid] {
  const [turn = 0, lean = 0, roll = 0] = turns;
  const body: Solid = {
    shape: 'column',
    sides: SPIRE_SIDES,
    top: BODY_TOP,
    at: [foot[0], foot[1], foot[2]],
    size: [width, width, height * BODY_SHARE],
    turn,
    lean,
    roll,
    material: 'crystal',
  };
  const rise = solidTurn(body, [0, 0, height * BODY_SHARE]);
  const tip: Solid = {
    ...body,
    top: 0,
    at: [foot[0] + rise[0], foot[1] + rise[1], foot[2] + rise[2]],
    size: [width * BODY_TOP, width * BODY_TOP, height * (1 - BODY_SHARE)],
  };
  return [body, tip];
}

/** A shard: one six-sided point. */
function shard(foot: readonly number[], height: number, turns: readonly number[]): Solid {
  const [turn = 0, lean = 0, roll = 0] = turns;
  const width = height / 3.5;
  return {
    shape: 'column',
    sides: SPIRE_SIDES,
    top: 0,
    at: [foot[0], foot[1], foot[2]],
    size: [width, width, height],
    turn,
    lean,
    roll,
    material: 'crystal',
  };
}

const between = (draw: Draw, least: number, most: number): number => least + (most - least) * draw();
const countOf = (draw: Draw, least: number, most: number): number => least + Math.floor((most - least + 1) * draw());

/** The turns that lean a solid out along a direction (east, south), swung up to `swing` radians either way. */
function leaningOut(draw: Draw, out: readonly number[], lean: number, swing: number): number[] {
  const angle = Math.atan2(out[1], out[0]) + (draw() - 0.5) * 2 * swing;
  return [Math.atan2(-Math.cos(angle), Math.sin(angle)), lean, (draw() - 0.5) * 0.4];
}

/** A kind of formation and how it is made: its spires (count, heights, lean), then its shards, spread along its own
 *  y and out along its x; `radial` leans each piece away from the foot instead of out along x. */
type Kind = {
  readonly spires: readonly [number, number, number, number, number, number];
  readonly shards: readonly [number, number, number, number, number, number];
  readonly spread: number;
  readonly radial?: boolean;
  readonly climbs?: boolean;
};
// [least count, most count, least height m, most height m, least lean, most lean]
const KINDS = {
  breakHeavy: { spires: [2, 3, 2.8, 4.8, 0.15, 0.5], shards: [7, 10, 0.4, 1.4, 0.5, 1.2], spread: 1.8 },
  breakLight: { spires: [1, 2, 1.2, 2.6, 0.15, 0.5], shards: [3, 6, 0.3, 1, 0.5, 1.2], spread: 1.4 },
  vein: { spires: [0, 0, 0, 0, 0, 0], shards: [2, 2, 0.5, 1.3, 0.6, 1], spread: 0.15, climbs: true },
  doorway: { spires: [0, 0, 0, 0, 0, 0], shards: [4, 6, 0.8, 2.2, 0.2, 0.7], spread: 0.7 },
  sill: { spires: [0, 0, 0, 0, 0, 0], shards: [3, 3, 0.4, 1, 0.4, 0.9], spread: 0.5 },
  patch: { spires: [0, 0, 0, 0, 0, 0], shards: [4, 7, 0.4, 1.6, 0.1, 0.8], spread: 1.2, radial: true },
  heap: { spires: [3, 5, 1.5, 4.5, 0.1, 0.6], shards: [4, 7, 0.5, 1.5, 0.4, 1], spread: 2.5, radial: true },
} as const satisfies Record<string, Kind>;
type KindName = keyof typeof KINDS;
/** The formations made of each kind, so no two neighbours need match. */
const OF_EACH = 4;
const KIND_NAMES = Object.keys(KINDS) as KindName[];

/** A formation made from its kind's numbers and its own seed, its foot at the origin, growing out along +east. */
function formation(kind: Kind, seed: number): Solid[] {
  const random = randomFromSeed(seed);
  const draw: Draw = () => random.next();
  const solids: Solid[] = [];
  const pieces = (
    numbers: readonly number[],
    lay: (foot: Point, height: number, turns: number[]) => void,
    near = 1,
  ) => {
    const [least, most, low, high, leanLeast, leanMost] = numbers;
    for (let piece = 0, count = countOf(draw, least, most); piece < count; piece++) {
      const spread = kind.spread * (piece === 0 && kind.radial ? 0 : near);
      const foot: Point = kind.climbs
        ? [0.12, (draw() - 0.5) * 2 * spread, piece * VEIN_STEP_M]
        : kind.radial
          ? [(draw() - 0.5) * 2 * spread, (draw() - 0.5) * 2 * spread, 0]
          : [draw() * 0.3, (draw() - 0.5) * 2 * spread, 0];
      const out = kind.radial ? [foot[0] || 1e-3, foot[1]] : [1, 0];
      lay(
        foot,
        between(draw, low, high),
        leaningOut(draw, out, between(draw, leanLeast, leanMost), kind.radial ? 3.2 : 0.7),
      );
    }
  };
  pieces(
    kind.spires,
    (foot, height, turns) => solids.push(...spire(foot, height, Math.max(0.3, height / 6), turns)),
    0.4,
  );
  pieces(kind.shards, (foot, height, turns) => solids.push(shard(foot, height, turns)));
  return solids;
}

/** Every formation's solids, `OF_EACH` of each kind in `KINDS`' order, made once alike on every machine. */
export const FORMATIONS: readonly (readonly Solid[])[] = KIND_NAMES.flatMap((name, kind) =>
  Array.from({ length: OF_EACH }, (_unused, made) => formation(KINDS[name], 0x6c617474 + kind * 97 + made)),
);

/** Each formation meshed in a forged model's frame (x east, y up, z north), in the crystal's layer. */
export function formationMeshes(layer: number): MeshData[] {
  return FORMATIONS.map((solids) => {
    const mesh = emptyMesh();
    for (const solid of solids) meshSolid(solid, [0, 0], { layer, width: 64, height: 64 }, mesh);
    const turned = (values: number[]) => {
      for (let first = 0; first < values.length; first += 3) {
        const [south, up] = [values[first + 1], values[first + 2]];
        values[first + 1] = up;
        values[first + 2] = -south;
      }
    };
    turned(mesh.positions);
    turned(mesh.normals);
    return mesh;
  });
}

/** Which formation of a kind, by a draw. */
const formationOf = (name: KindName, draw: Draw): number =>
  KIND_NAMES.indexOf(name) * OF_EACH + Math.floor(draw() * OF_EACH);
/** The yaw that turns a formation's +east out along a direction (east, south). */
const yawOut = (out: readonly number[]): number => Math.atan2(out[1], out[0]);

/** The crystal grown through a broken building, its hull (from the city's middle, `origin` away) ending at the break,
 *  by its place in the world (east, south): none, light or heavy, by the place's seed. */
export function buildingGrowth(hull: MassShape, origin: readonly number[], place: readonly number[]): Growth {
  const growth: Growth = { great: [], detail: [], placed: [] };
  const random = randomFromSeed(placeSeed(place[0], place[1]) ^ GROWTH_SALT);
  const draw: Draw = () => random.next();
  const kind = draw();
  if (kind < OVERTAKEN.untouched) return growth;
  const heavy = kind >= 1 - OVERTAKEN.heavy;
  const along = [Math.cos(hull.turn), Math.sin(hull.turn)];
  const across = [-Math.sin(hull.turn), Math.cos(hull.turn)];
  const [half, wall, base] = [[hull.halfAlong, hull.halfAcross], hull.wall, hull.base];
  const point = (ahead: number, aside: number, up: number): Point => [
    hull.east + origin[0] + along[0] * ahead + across[0] * aside,
    hull.south + origin[1] + along[1] * ahead + across[1] * aside,
    up,
  ];
  // the four sides: their outward direction, the direction along them, where their middle lies and half their run
  const sides = [
    { out: along, side: across, at: [half[0], 0], run: half[1] },
    { out: [-along[0], -along[1]], side: across, at: [-half[0], 0], run: half[1] },
    { out: across, side: along, at: [0, half[1]], run: half[0] },
    { out: [-across[0], -across[1]], side: along, at: [0, -half[1]], run: half[0] },
  ];
  /** A point on a side, `share` of the way along it from its middle toward its end, `out` metres out from it. */
  const onSide = (which: number, share: number, up: number, out = 0): Point => {
    const { at, side, run, out: outward } = sides[which];
    const middle = point(at[0], at[1], up);
    return [
      middle[0] + side[0] * share * run + outward[0] * out,
      middle[1] + side[1] * share * run + outward[1] * out,
      up,
    ];
  };
  const lay = (name: KindName, foot: Point, out: readonly number[]) =>
    growth.placed.push({ formation: formationOf(name, draw), at: foot, yaw: yawOut(out) });
  // Out of the break: heavy, a great spire standing well over it among its clusters; light, lower ones.
  const clusters = heavy ? countOf(draw, 2, 3) : countOf(draw, 1, 2);
  for (let cluster = 0; cluster < clusters; cluster++) {
    const which = Math.floor(draw() * 4);
    const foot = onSide(which, between(draw, -0.85, 0.85), base + wall - 0.2);
    lay(heavy && wall >= 3.5 ? 'breakHeavy' : 'breakLight', foot, sides[which].out);
    if (heavy && cluster === 0) {
      // never under a great spire's height, so even a low ruin reads as overtaken from afar
      const height = Math.min(16, Math.max(HEAVY_SPIRE_LEAST_M, between(draw, 1.2, 2.2) * wall));
      const great = spire(
        foot,
        height,
        Math.max(0.3, height / 6),
        leaningOut(draw, sides[which].out, between(draw, 0.1, 0.35), 0.5),
      );
      (height >= GREAT_M ? growth.great : growth.detail).push(...great);
    }
  }
  // Veins up the corners (and heavy, up a seam of each long side), from the ground toward the break.
  const corners = [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ];
  const veins = (heavy ? corners : corners.filter(() => draw() < 0.5)).map(([ahead, aside]) => ({
    at: [ahead * half[0], aside * half[1]],
    out: [along[0] * ahead + across[0] * aside, along[1] * ahead + across[1] * aside],
  }));
  if (heavy)
    for (const aside of [1, -1]) {
      const ahead = between(draw, -0.6, 0.6) * half[0];
      veins.push({ at: [ahead, aside * half[1]], out: [across[0] * aside, across[1] * aside] });
    }
  for (const vein of veins)
    for (let up = base + 0.3; up < base + wall - 1.2; up += 2 * VEIN_STEP_M)
      if (draw() >= 0.2) lay('vein', point(vein.at[0], vein.at[1], up), vein.out);
  // Where a doorway is, at the foot of a long side, and heavy, where windows are.
  const door = 2 + Math.floor(draw() * 2);
  lay('doorway', onSide(door, between(draw, -0.5, 0.5), base, 0.15), sides[door].out);
  if (heavy && wall >= 3)
    for (const which of [2, 3]) lay('sill', onSide(which, between(draw, -0.5, 0.5), base + 1.8, 0.1), sides[which].out);
  // Heavy, it breaks through the paving round its foot.
  if (heavy)
    for (let patch = 0, patches = countOf(draw, 1, 2); patch < patches; patch++) {
      const which = Math.floor(draw() * 4);
      lay('patch', onSide(which, between(draw, -0.8, 0.8), base - 0.15, between(draw, 1.5, 4)), sides[which].out);
    }
  return growth;
}

/** Spires rising through a fallen building's heap, a formation at its heart, by its place in the world (east,
 *  south); none for the untouched share. */
export function heapGrowth(heap: Solid, place: readonly number[]): Growth {
  const growth: Growth = { great: [], detail: [], placed: [] };
  const random = randomFromSeed(placeSeed(place[0], place[1]) ^ GROWTH_SALT);
  const draw: Draw = () => random.next();
  if (draw() < OVERTAKEN.untouched) return growth;
  const heart = [heap.at[0], heap.at[1], heap.at[2] + heap.size[2] * 0.5];
  growth.placed.push({ formation: formationOf('heap', draw), at: heart, yaw: draw() * 2 * Math.PI });
  return growth;
}

/** Shards crusting a wreck where its hull meets the water, round the hull as long and broad as its ship's. */
export function wreckCrust(wreck: Wreck): Solid[] {
  const [low, high] = ships.ships[wreck.ship].boxes.hull;
  const [halfLength, halfBeam] = [(high[0] - low[0]) / 2, (high[1] - low[1]) / 2];
  const forward = [Math.sin(wreck.heading), -Math.cos(wreck.heading)];
  const starboard = [Math.cos(wreck.heading), Math.sin(wreck.heading)];
  const random = randomFromSeed(placeSeed(wreck.at[0], wreck.at[1]) ^ GROWTH_SALT);
  const draw: Draw = () => random.next();
  const crust: Solid[] = [];
  const steps = Math.round((2 * Math.PI * Math.hypot(halfLength, halfBeam)) / Math.SQRT2 / 1.4);
  for (let step = 0; step < steps; step++) {
    if (draw() < 0.3) continue;
    const angle = ((step + draw() * 0.6) / steps) * 2 * Math.PI;
    const [ahead, aside] = [Math.cos(angle) * halfLength * 0.92, Math.sin(angle) * (halfBeam + 0.1)];
    const out = [0, 1].map((axis) => forward[axis] * Math.cos(angle) + starboard[axis] * Math.sin(angle));
    const foot = [0, 1].map((axis) => wreck.at[axis] + forward[axis] * ahead + starboard[axis] * aside);
    const turns = leaningOut(draw, out, between(draw, 0.5, 1.1), 0.5);
    crust.push(shard([foot[0], foot[1], between(draw, -0.3, 0.1)], between(draw, 0.4, 1.4), turns));
  }
  return crust;
}

/** The night's lamps a formation's crystal lights: at the `most` tallest of its great spires, half way up each. */
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
      };
    });
}

/** Whether a point (east, south), or a solid round its base and as far as it leans, reaches into the window round
 *  the plaza, where no crystal of the page's lies; `reach` metres round the point. */
export function inPlazaWindow(point: readonly number[], reach: number, plan: CityPlan): boolean {
  const [west, north, east, south] = plan.social.bounds;
  return (
    point[0] + reach > west - PLAZA_CLEAR_M &&
    point[0] - reach < east + PLAZA_CLEAR_M &&
    point[1] + reach > north - PLAZA_CLEAR_M &&
    point[1] - reach < south + PLAZA_CLEAR_M
  );
}

/** The solids of a growth clear of the plaza's window: a spire's body (a column with a top) and the tip after it are
 *  kept or left out together, so no body is left open at its top. */
export function clearOfPlaza(solids: readonly Solid[], plan: CityPlan): Solid[] {
  const kept: Solid[] = [];
  for (let index = 0; index < solids.length; index++) {
    const solid = solids[index];
    const body = solid.shape === 'column' && solid.top > 0 && index + 1 < solids.length;
    const piece = body ? [solid, solids[index + 1]] : [solid];
    if (body) index++;
    if (piece.every((each) => !inPlazaWindow(each.at, solidReach(each), plan))) kept.push(...piece);
  }
  return kept;
}

/** How far a formation reaches from its foot across the ground, metres. */
export const FORMATION_REACH: readonly number[] = FORMATIONS.map((solids) =>
  Math.max(...solids.map((solid) => Math.hypot(solid.at[0], solid.at[1]) + solidReach(solid))),
);
