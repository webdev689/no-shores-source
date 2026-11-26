// Where a ship docks for a landing, and the way in to it and out of it again: at a living port a place of its pier no
// ship lies in, come to along the pier, or, every place taken, anchored off it clear of the others; at a coast with no
// port just off the shore nearest where it was clicked; at a sea island its anchorage, or abreast of it clear of the
// ships there. Each berth has its offing, out at sea, which the ship sails in from and out to: the port's
// roadstead, 600 m off the coast, the island's offing.
import { insideRing } from '../editor/placeDrawing.ts';
import type { Point2 } from '../overworld/ground.ts';
import { coastDistance, coastPoint, ringCentre } from '../overworld/islandView.ts';
import { approach, type IsleAt } from './isleLaw.ts';
import type { LandingAim } from './landingAsk.ts';
import type { Landmass } from './landmass.ts';
import { OFFSHORE, offshore, offshoreStretch } from './seaLaw.ts';

/** Where a ship lies docked, and its offing, out at sea, the way in to it and out again; at a pier, the point out
 *  along it the last stretch in starts from, so the ship lies along the pier. */
export interface Berth {
  readonly at: Point2;
  readonly offing: Point2;
  readonly lead?: Point2;
}

/** A ship as the sea shows it: where it lies. */
type Lying = { readonly x: number; readonly y: number };

/** How near a place of a pier another ship lies to take it, metres: under half the way between its places. */
export const TAKEN_M = 15;
/** How far apart ships anchored off a pier lie, metres: a Frigate's length and room to swing round her anchor. */
export const ANCHORED_APART_M = 100;
/** How far apart ships lie abreast off a sea island's anchorage, metres: clear of each other's beam, and the fifth
 *  still within the 30 m of it the page anchors within, so the sea lands its player (`sea_islands.rs`, `LANDING_M`). */
export const ABREAST_M = 15;
/** How far out along a pier's bearing the last stretch in to a place of it starts, metres: over twice a Sloop's
 *  length, so the ship has come round onto the pier's line before she lies beside it. */
export const LEAD_M = 40;

const apart = (point: Point2, ship: Lying) => Math.hypot(point[0] - ship.x, point[1] - ship.y);
const clearOf = (point: Point2, ships: readonly Lying[]) =>
  ships.every((ship) => apart(point, ship) >= ANCHORED_APART_M);

/** The first point from `from` on out along `way` (a unit step), a ship's room at a time, that no ship lies near. Each
 *  ship keeps at most two of them, so one of the first few is clear. */
function clearOut(from: Point2, way: Point2, ships: readonly Lying[]): Point2 {
  let point = from;
  for (let step = 0; step <= 2 * ships.length; step++) {
    point = [from[0] + way[0] * step * ANCHORED_APART_M, from[1] + way[1] * step * ANCHORED_APART_M];
    if (clearOf(point, ships)) break;
  }
  return point;
}

/** The unit step from `from` toward `to`, or none where they meet. */
function unitTo(from: Point2, to: Point2): Point2 {
  const length = Math.hypot(to[0] - from[0], to[1] - from[1]) || 1;
  return [(to[0] - from[0]) / length, (to[1] - from[1]) / length];
}

/** The places of a pier (each `[x, y, bearing]`) no ship lies in. */
export function freePlaces<T extends readonly [number, number, number]>(places: readonly T[], ships: readonly Lying[]) {
  return places.filter(([x, y]) => ships.every((ship) => apart([x, y], ship) > TAKEN_M));
}

/** A living port's berth, among the ships the sea shows (`ships`): the first place of its pier none lies in, come to
 *  from `LEAD_M` out along its bearing; every place taken, or with no pier, anchored at its roadstead, or across the
 *  way out from it, a place at a time either side, where the water is deep and no ship lies within
 *  `ANCHORED_APART_M`; none of those, further out along the way out, clear of them. Its offing is the roadstead. None
 *  with no harbour. */
export function portBerth(
  landmass: Pick<Landmass, 'plan' | 'heightAt' | 'outline'>,
  ships: readonly Lying[],
): Berth | null {
  const { plan, heightAt, outline } = landmass;
  if (!plan?.harbour) return null;
  const offing = offshore(heightAt, plan.centre, plan.harbour);
  const [place] = freePlaces(plan.social.moorings ?? [], ships);
  if (place) {
    const [x, y, bearing] = place;
    // The bearing is clockwise from north, east x and south y: the way the pier runs out to sea.
    return { at: [x, y], offing, lead: [x + Math.sin(bearing) * LEAD_M, y - Math.cos(bearing) * LEAD_M] };
  }
  const out = unitTo(plan.harbour, offing);
  const across = [-out[1], out[0]] as const;
  const deep = ([x, y]: Point2) => !(heightAt(x, y) > -OFFSHORE.depthM) && !insideRing(outline, [x, y]);
  // Each ship keeps at most two of these places, so one of them is clear.
  for (let step = 0; step <= 2 * ships.length; step++) {
    const side = step % 2 === 1 ? (step + 1) / 2 : -step / 2;
    const anchorage: Point2 = [
      offing[0] + across[0] * side * ANCHORED_APART_M,
      offing[1] + across[1] * side * ANCHORED_APART_M,
    ];
    if (deep(anchorage) && clearOf(anchorage, ships)) return { at: anchorage, offing };
  }
  const anchorage = clearOut(offing, out, ships);
  return { at: anchorage, offing: anchorage };
}

/** A sea island's berth: its anchorage, or the first place abreast of it, `ABREAST_M` at a time either side across
 *  its way in, that no ship lies within half that of, its offing as far across from the island's own, so the ship
 *  comes straight in; every place taken, the anchorage, where the sea still lands its player. */
function isleBerth(way: { readonly offing: Point2; readonly anchorage: Point2 }, ships: readonly Lying[]): Berth {
  const { anchorage, offing } = way;
  const out = unitTo(anchorage, offing);
  for (let step = 0; step < 5; step++) {
    const side = (step % 2 === 1 ? (step + 1) / 2 : -step / 2) * ABREAST_M;
    const [acrossX, acrossY] = [-out[1] * side, out[0] * side];
    const lies: Point2 = [anchorage[0] + acrossX, anchorage[1] + acrossY];
    if (ships.every((ship) => apart(lies, ship) > ABREAST_M / 2))
      return { at: lies, offing: [offing[0] + acrossX, offing[1] + acrossY] };
  }
  return { at: anchorage, offing };
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
  return way ? isleBerth(way, ships) : null;
}
