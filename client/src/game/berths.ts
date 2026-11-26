// Where a ship docks for a landing, and the way in to it and out of it again: at a living port a place of its pier no
// ship lies in, or, every place taken, anchored off it clear of the others; at a coast with no port just off the shore
// nearest where it was clicked; at a sea island its anchorage. Each berth has its offing, out at sea, which the ship
// sails in from and out to: the port's roadstead, 600 m off the coast, the island's offing.
import { insideRing } from '../editor/placeDrawing.ts';
import type { Point2 } from '../overworld/ground.ts';
import { coastDistance, coastPoint, ringCentre } from '../overworld/islandView.ts';
import { approach, type IsleAt } from './isleLaw.ts';
import type { LandingAim } from './landingAsk.ts';
import type { Landmass } from './landmass.ts';
import { OFFSHORE, offshore, offshoreStretch } from './seaLaw.ts';

/** Where a ship lies docked, and its offing, out at sea, the way in to it and out again. */
export interface Berth {
  readonly at: Point2;
  readonly offing: Point2;
}

/** A ship as the sea shows it: where it lies. */
type Lying = { readonly x: number; readonly y: number };

/** How near a place of a pier another ship lies to take it, metres: under half the way between its places. */
export const TAKEN_M = 15;
/** How far apart ships anchored off a pier lie, metres: a Frigate's length and room to swing round her anchor. */
export const ANCHORED_APART_M = 100;

const apart = (point: Point2, ship: Lying) => Math.hypot(point[0] - ship.x, point[1] - ship.y);

/** The places of a pier (each `[x, y, bearing]`) no ship lies in. */
export function freePlaces<T extends readonly [number, number, number]>(places: readonly T[], ships: readonly Lying[]) {
  return places.filter(([x, y]) => ships.every((ship) => apart([x, y], ship) > TAKEN_M));
}

/** A living port's berth, among the ships the sea shows (`ships`): the first place of its pier none lies in; every place
 *  taken, or with no pier, anchored at its roadstead, or across the way out from it, a place at a time either side,
 *  where the water is deep and no ship lies within `ANCHORED_APART_M`. Its offing is the roadstead. None with no
 *  harbour. */
export function portBerth(
  landmass: Pick<Landmass, 'plan' | 'heightAt' | 'outline'>,
  ships: readonly Lying[],
): Berth | null {
  const { plan, heightAt, outline } = landmass;
  if (!plan?.harbour) return null;
  const offing = offshore(heightAt, plan.centre, plan.harbour);
  const [place] = freePlaces(plan.social.moorings ?? [], ships);
  if (place) return { at: [place[0], place[1]], offing };
  const out = [offing[0] - plan.harbour[0], offing[1] - plan.harbour[1]];
  const length = Math.hypot(out[0] ?? 0, out[1] ?? 0) || 1;
  const across = [-(out[1] ?? 0) / length, (out[0] ?? 0) / length] as const;
  const deep = ([x, y]: Point2) => !(heightAt(x, y) > -OFFSHORE.depthM) && !insideRing(outline, [x, y]);
  // Each ship keeps at most two of these places, so one of them is clear.
  for (let step = 0; step <= 2 * ships.length; step++) {
    const side = step % 2 === 1 ? (step + 1) / 2 : -step / 2;
    const anchorage: Point2 = [
      offing[0] + across[0] * side * ANCHORED_APART_M,
      offing[1] + across[1] * side * ANCHORED_APART_M,
    ];
    const clear = ships.every((ship) => apart(anchorage, ship) >= ANCHORED_APART_M);
    if (deep(anchorage) && clear) return { at: anchorage, offing };
  }
  return { at: offing, offing };
}

/** A coast's berth, for a landing toward `toward` (a point clicked on its land, or the ship off it): just off the shore
 *  nearest it, straight out from it where the water is first deep and a step clear of the room's coast; its offing
 *  600 m on. */
export function coastBerth(landmass: Pick<Landmass, 'heightAt' | 'outline'>, toward: Point2): Berth {
  const { heightAt, outline } = landmass;
  const shore = coastPoint(toward, outline);
  // Out from the shore is away from a point inland, toward one at sea; from the land's middle on the shore itself.
  const away = Math.hypot(toward[0] - shore[0], toward[1] - shore[1]) < 1;
  const inland = insideRing(outline, toward) ? toward : [2 * shore[0] - toward[0], 2 * shore[1] - toward[1]];
  const from: Point2 = away ? ringCentre(outline) : [inland[0] ?? 0, inland[1] ?? 0];
  // The room refuses a course that ends on its coast, so the berth keeps a step off it.
  const land = (point: Point2) => insideRing(outline, point) || coastDistance(point, outline) < OFFSHORE.stepM;
  const { inshore, offing } = offshoreStretch(heightAt, from, shore, land);
  return { at: inshore, offing };
}

/** The berth for a landing: at the open landmass's port or on its coast, or at one of the sea's islands told of
 *  (`isles`), among the ships the sea shows; none for an island not told of or not yet built. */
export function berthOf(
  aim: LandingAim,
  landmass: Pick<Landmass, 'plan' | 'heightAt' | 'outline'>,
  isles: readonly IsleAt[],
  ships: readonly Lying[],
): Berth | null {
  if (aim.kind === 'dock') return portBerth(landmass, ships);
  if (aim.kind === 'ashore') return coastBerth(landmass, aim.toward);
  const isle = isles.find((each) => each.seen.id === aim.id);
  const way = isle && approach(isle);
  return way ? { at: way.anchorage, offing: way.offing } : null;
}
