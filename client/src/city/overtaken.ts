// The Lattice's red crystal grown through a ruined city's buildings, the ruined port's people turned to it where they
// stood: clusters of six-sided spires leaning out of each broken building's wall tops, veins of shards climbing its
// corners and seams, shards choking its foot where a doorway is and its walls where windows are, patches breaking
// through the paving round the most overtaken; spires rising through a fallen building's heap; a crust on the harbour's
// wrecks at the waterline. Each is seeded by its place, the same on every machine. The city crate crowns the landmark
// and crusts the rubble (crates/city/src/overtaken.rs) with the same spire. A formation's great spires are drawn at
// every distance; its small shards only near (`detail`).
import ships from '../../../content/ships/ships.json' with { type: 'json' };
import { randomFromSeed } from '../models/random.ts';
import type { LampPlace } from '../sky/lamps.ts';
import type { MassShape } from './cityMasses.ts';
import { CRYSTAL_LAMP } from './crystal.ts';
import { type CityPlan, type Solid, solidReach, type Wreck } from './plan.ts';
import { placeSeed } from './ruins.ts';
import { solidTurn } from './solidMesh.ts';

/** The faces round a spire; its body's share of its height, its body's top a share of its width (as the crate's). */
const SPIRE_SIDES = 6;
const BODY_SHARE = 0.75;
const BODY_TOP = 0.8;
/** A spire at least this tall, metres, is a great one: drawn at every distance. */
export const GREAT_M = 5;
/** The share of buildings the crystal leaves untouched, and the share it overtakes heavily (the rest lightly). */
export const OVERTAKEN = { untouched: 0.12, heavy: 0.33 } as const;
/** The window round the plaza no crystal of the page's lies in (crates/city/src/ruins.rs PLAZA_CLEAR_M). */
const PLAZA_CLEAR_M = 110;
/** Mixed into a place's seed, so its crystal draws apart from how it broke. */
const GROWTH_SALT = 0x4c415454;

/** A formation's crystal: its great spires, and its small shards and spires drawn only near. */
export type Growth = { readonly great: Solid[]; readonly detail: Solid[] };
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

/** A spire into the great or the detail by its height. */
function laySpire(into: Growth, foot: readonly number[], height: number, turns: readonly number[]): void {
  (height >= GREAT_M ? into.great : into.detail).push(...spire(foot, height, Math.max(0.3, height / 6), turns));
}

/** A cluster growing out along `out`: a few large spires and many small shards round `foot`, spread along `side`. */
function cluster(
  into: Growth,
  draw: Draw,
  place: { foot: Point; out: readonly number[]; side: readonly number[]; spread: number },
  large: { count: number; least: number; most: number },
  small: { count: number; least: number; most: number },
): void {
  const near = (spread: number): Point => {
    const [along, outward] = [(draw() - 0.5) * 2 * spread, draw() * 0.3];
    const { foot, out, side } = place;
    return [foot[0] + side[0] * along + out[0] * outward, foot[1] + side[1] * along + out[1] * outward, foot[2]];
  };
  for (let k = 0; k < large.count; k++)
    laySpire(into, near(place.spread * 0.4), between(draw, large.least, large.most), [
      ...leaningOut(draw, place.out, between(draw, 0.15, 0.5), 0.6),
    ]);
  for (let k = 0; k < small.count; k++) {
    const height = between(draw, small.least, small.most);
    into.detail.push(shard(near(place.spread), height, leaningOut(draw, place.out, between(draw, 0.5, 1.2), 0.9)));
  }
}

/** The crystal grown through a broken building, its hull (from the city's middle, `origin` away) ending at the break,
 *  by its place in the world (east, south): none, light or heavy, by the place's seed. */
export function buildingGrowth(hull: MassShape, origin: readonly number[], place: readonly number[]): Growth {
  const growth: Growth = { great: [], detail: [] };
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
  // Out of the break: heavy, spires standing well over it; light, lower ones.
  for (let k = 0, clusters = heavy ? countOf(draw, 2, 3) : countOf(draw, 1, 2); k < clusters; k++) {
    const which = Math.floor(draw() * 4);
    const foot = onSide(which, between(draw, -0.85, 0.85), base + wall - 0.2);
    const large = heavy
      ? { count: countOf(draw, 2, 3), least: 0.9 * wall, most: Math.min(16, 1.6 * wall) }
      : { count: countOf(draw, 1, 2), least: 0.25 * wall, most: 0.55 * wall };
    const small = { count: heavy ? countOf(draw, 6, 10) : countOf(draw, 3, 6), least: 0.4, most: 0.4 + 0.2 * wall };
    cluster(growth, draw, { foot, out: sides[which].out, side: sides[which].side, spread: 1.8 }, large, small);
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
    out: [along[0] * ahead + across[0] * aside, along[1] * ahead + across[1] * aside].map(
      (value) => value / Math.SQRT2,
    ),
  }));
  if (heavy)
    for (const aside of [1, -1]) {
      const ahead = between(draw, -0.6, 0.6) * half[0];
      veins.push({ at: [ahead, aside * half[1]], out: [across[0] * aside, across[1] * aside] });
    }
  for (const vein of veins)
    for (let up = base + 0.3; up < base + wall - 0.4; up += 1.1) {
      if (draw() < 0.2) continue;
      const corner = point(vein.at[0], vein.at[1], up);
      const foot: Point = [corner[0] + vein.out[0] * 0.12, corner[1] + vein.out[1] * 0.12, up];
      growth.detail.push(shard(foot, between(draw, 0.5, 1.3), leaningOut(draw, vein.out, between(draw, 0.6, 1), 0.5)));
    }
  // Where a doorway is, at the foot of a long side, and heavy, where windows are.
  const door = 2 + Math.floor(draw() * 2);
  const doorAt = onSide(door, between(draw, -0.5, 0.5), base, 0.15);
  for (let k = 0, shards = countOf(draw, 4, 6); k < shards; k++) {
    const aside = between(draw, -0.7, 0.7);
    const foot: Point = [doorAt[0] + sides[door].side[0] * aside, doorAt[1] + sides[door].side[1] * aside, base];
    growth.detail.push(
      shard(foot, between(draw, 0.8, 2.2), leaningOut(draw, sides[door].out, between(draw, 0.2, 0.7), 0.7)),
    );
  }
  if (heavy && wall >= 3)
    for (const which of [2, 3]) {
      const sill = onSide(which, between(draw, -0.5, 0.5), base + 1.8, 0.1);
      for (let k = 0; k < 3; k++)
        growth.detail.push(
          shard(sill, between(draw, 0.4, 1), leaningOut(draw, sides[which].out, between(draw, 0.4, 0.9), 0.8)),
        );
    }
  // Heavy, it breaks through the paving round its foot.
  if (heavy)
    for (let k = 0, patches = countOf(draw, 1, 2); k < patches; k++) {
      const which = Math.floor(draw() * 4);
      const middle = onSide(which, between(draw, -0.8, 0.8), base - 0.15, between(draw, 1.5, 4));
      for (let laid = 0, shards = countOf(draw, 4, 7); laid < shards; laid++) {
        const foot: Point = [middle[0] + between(draw, -1.2, 1.2), middle[1] + between(draw, -1.2, 1.2), middle[2]];
        const out = [foot[0] - middle[0], foot[1] - middle[1]];
        growth.detail.push(shard(foot, between(draw, 0.4, 1.6), leaningOut(draw, out, between(draw, 0.1, 0.8), 1.5)));
      }
    }
  return growth;
}

/** Spires rising through a fallen building's heap, a cluster at its heart, by its place in the world (east, south). */
export function heapGrowth(heap: Solid, place: readonly number[]): Growth {
  const growth: Growth = { great: [], detail: [] };
  const random = randomFromSeed(placeSeed(place[0], place[1]) ^ GROWTH_SALT);
  const draw: Draw = () => random.next();
  if (draw() < OVERTAKEN.untouched) return growth;
  const height = heap.size[2];
  const heart = (spread: number): Point => [
    heap.at[0] + (draw() - 0.5) * heap.size[0] * spread,
    heap.at[1] + (draw() - 0.5) * heap.size[1] * spread,
    heap.at[2] + height * 0.5,
  ];
  const tallest = between(draw, 2.5, 4.5) * height;
  const upward = (lean: number) => [draw() * 2 * Math.PI, lean, (draw() - 0.5) * 0.4];
  laySpire(growth, heart(0.1), tallest, upward(between(draw, 0.1, 0.3)));
  for (let k = 0, count = countOf(draw, 2, 4); k < count; k++)
    laySpire(growth, heart(0.3), tallest * between(draw, 0.4, 0.8), upward(between(draw, 0.3, 0.7)));
  for (let k = 0, count = countOf(draw, 4, 7); k < count; k++)
    growth.detail.push(shard(heart(0.6), between(draw, 0.5, 1.5), upward(between(draw, 0.4, 1))));
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
  for (let k = 0; k < steps; k++) {
    if (draw() < 0.3) continue;
    const angle = ((k + draw() * 0.6) / steps) * 2 * Math.PI;
    const [ahead, aside] = [Math.cos(angle) * halfLength * 0.92, Math.sin(angle) * (halfBeam + 0.1)];
    const out = [0, 1].map((axis) => forward[axis] * Math.cos(angle) + starboard[axis] * Math.sin(angle));
    const foot = [0, 1].map((axis) => wreck.at[axis] + forward[axis] * ahead + starboard[axis] * aside);
    crust.push(
      shard(
        [foot[0], foot[1], between(draw, -0.3, 0.1)],
        between(draw, 0.4, 1.4),
        leaningOut(draw, out, between(draw, 0.5, 1.1), 0.5),
      ),
    );
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

/** Whether a solid reaches into the window round the plaza, where no crystal of the page's lies. */
export function inPlazaWindow(solid: Solid, plan: CityPlan): boolean {
  const [west, north, east, south] = plan.social.bounds;
  const reach = solidReach(solid);
  return (
    solid.at[0] + reach > west - PLAZA_CLEAR_M &&
    solid.at[0] - reach < east + PLAZA_CLEAR_M &&
    solid.at[1] + reach > north - PLAZA_CLEAR_M &&
    solid.at[1] - reach < south + PLAZA_CLEAR_M
  );
}
