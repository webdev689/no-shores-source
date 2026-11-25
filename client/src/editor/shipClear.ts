// What of a ship can come to the fight's eye, and how far back the fight's camera stands to be clear of it: its hull,
// and each sail as far as the wind can swing it (a square sail braced round its mast, a gaff swung about its luff
// to its beam), so no wind or turn of the ship ever brings its canvas onto the eye.
import { hullBox, hullSails } from '../ships/hulls.ts';
import type { SailCorners } from '../ships/sails.ts';
import { shipAxes } from '../ships/shipAxes.ts';

type Point = readonly [number, number, number];

/** A staysail bellies to either side of its stay this far at most, metres (its belly times its arch's peak). */
export const STAY_SWAY_M = 0.9;
/** The most any sail bellies off the lines between its corners, metres: a square sail's set full. A gaff swung off
 *  the wind bellies forward of its luff by up to this. */
export const BELLY_M = 1.2;
/** How far the fight's camera keeps back from the nearest part of its ship it would otherwise stand in, metres. */
export const ORBIT_CLEAR_M = 2;
/** On its way between the camera's own place and the battery the aim's eye keeps this far out past the ship and its
 *  rig, and this far over and under each part of it, metres, coming in to the battery's station at the end. */
export const ROUND_CLEAR_M = 0.6;

/** How a sail swings, in its ship's frame: about the point along its keel it turns on (its mast, or its luff), as
 *  far as its farthest corner from there, between its lowest and highest corners; a gaff aft of its luff alone, a
 *  staysail swaying on its stay. */
export interface Swing {
  readonly kind: SailCorners['kind'];
  readonly pivot: number;
  readonly reach: number;
  readonly low: number;
  readonly high: number;
  /** Its stay's ends along the keel, for a staysail. */
  readonly along: readonly [number, number];
}

/** `point` turned `angle` radians about the line through `from` along the unit `axis`. */
function turned(point: Point, from: Point, axis: Point, angle: number): Point {
  const offset = [point[0] - from[0], point[1] - from[1], point[2] - from[2]] as const;
  const along = offset[0] * axis[0] + offset[1] * axis[1] + offset[2] * axis[2];
  const across = [
    axis[1] * offset[2] - axis[2] * offset[1],
    axis[2] * offset[0] - axis[0] * offset[2],
    axis[0] * offset[1] - axis[1] * offset[0],
  ] as const;
  const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
  const onto = (index: 0 | 1 | 2) =>
    from[index] + offset[index] * cos + across[index] * sin + axis[index] * along * (1 - cos);
  return [onto(0), onto(1), onto(2)];
}

/** How a sail swings (`Swing`): a gaff's corners are turned about its raked luff to either beam, which lifts and
 *  drops them as well as swinging them out. */
export function swingOf(sail: SailCorners): Swing {
  const corners =
    sail.kind === 'square'
      ? [sail.foot_port, sail.foot_starboard, sail.head_port, sail.head_starboard]
      : sail.kind === 'gaff'
        ? [sail.tack, sail.clew, sail.throat, sail.peak]
        : [sail.tack, sail.clew, sail.head];
  const alongs = corners.map((corner) => corner[0]);
  const pivot =
    sail.kind === 'square'
      ? alongs.reduce((sum, value) => sum + value, 0) / alongs.length
      : sail.kind === 'gaff'
        ? Math.max(sail.tack[0], sail.throat[0])
        : 0;
  let swung: readonly Point[] = corners;
  if (sail.kind === 'gaff') {
    const luff = [0, 1, 2].map((axis) => sail.throat[axis] - sail.tack[axis]);
    const length = Math.hypot(...luff);
    const axis = luff.map((value) => value / length) as unknown as Point;
    swung = corners.flatMap((corner) =>
      Array.from({ length: 19 }, (_unused, step) => turned(corner, sail.tack, axis, ((step - 9) * Math.PI) / 18)),
    );
  }
  const heights = swung.map((corner) => corner[2]);
  const reach =
    sail.kind === 'stay' ? STAY_SWAY_M : Math.max(...swung.map((corner) => Math.hypot(corner[0] - pivot, corner[1])));
  return {
    kind: sail.kind,
    pivot,
    reach,
    low: Math.min(...heights),
    high: Math.max(...heights),
    along: [Math.min(...alongs), Math.max(...alongs)],
  };
}

/** A box in a ship's frame: its lowest corner, then its highest. */
export type Box = readonly [Point, Point];

const sweeps = new Map<number, readonly Box[]>();

/** Every part of a hull (by its number) that can stand in the way of an eye, as boxes in its frame: its hull's, then
 *  each sail's as far as it swings. */
export function sweptBoxes(hull: number): readonly Box[] {
  const kept = sweeps.get(hull);
  if (kept) return kept;
  const sails = hullSails(hull).map((sail): Box => {
    const swing = swingOf(sail);
    const [fore, aft] =
      swing.kind === 'stay'
        ? swing.along
        : [swing.pivot - swing.reach, swing.pivot + (swing.kind === 'gaff' ? BELLY_M : swing.reach)];
    return [
      [fore, -swing.reach, swing.low],
      [aft, swing.reach, swing.high],
    ];
  });
  const boxes = [hullBox(hull), ...sails];
  sweeps.set(hull, boxes);
  return boxes;
}

/** How far out from its centreline the aim's eye comes abeam of `to` (a point in a hull's frame), clear of the hull
 *  and of every sail's swing there, before it goes straight in over the rail to it. */
export function abeamOut(hull: number, to: Point): number {
  const past = sweptBoxes(hull)
    .filter(
      ([low, top]) =>
        to[0] > low[0] && to[0] < top[0] && to[2] > low[2] - ROUND_CLEAR_M && to[2] < top[2] + ROUND_CLEAR_M,
    )
    .map(([, top]) => top[1]);
  return Math.max(Math.abs(hullBox(hull)[1][1]), ...past) + ROUND_CLEAR_M;
}

/** Where a ray from `from` along `way` (both in a box's frame) leaves the box, if it ever is in it ahead of `from`. */
function exitOf(box: Box, from: Point, way: Point): number | null {
  let [enter, leave] = [-Infinity, Infinity];
  for (let axis = 0; axis < 3; axis++) {
    const [low, high, start, step] = [box[0][axis], box[1][axis], from[axis], way[axis]];
    if (Math.abs(step) < 1e-12) {
      if (start < low || start > high) return null;
      continue;
    }
    const [one, other] = [(low - start) / step, (high - start) / step];
    enter = Math.max(enter, Math.min(one, other));
    leave = Math.min(leave, Math.max(one, other));
  }
  return enter <= leave && leave > 0 ? leave : null;
}

/** The ship a camera keeps clear of, as drawn: its middle, heading, waterline's height, bow's rise and heel, and its
 *  hull's number. */
export interface ClearShip {
  readonly x: number;
  readonly y: number;
  readonly heading: number;
  readonly heave: number;
  readonly pitch: number;
  readonly roll: number;
  readonly hull: number;
}

/** How far back from `target` (world metres) a camera looking along `yaw` (clockwise from north) and `pitch` (down
 *  positive) must stand to be clear of every part of `ship` its look back passes through, metres; 0 where it passes
 *  through none. */
export function orbitClearance(ship: ClearShip, target: Point, yaw: number, pitch: number): number {
  const [bow, starboard, up] = shipAxes(ship.heading, ship.pitch, ship.roll);
  const onto = (axis: readonly number[], value: Point) =>
    value.reduce((sum, part, index) => sum + part * (axis[index] ?? 0), 0);
  const offset: Point = [target[0] - ship.x, target[1] - ship.y, target[2] - ship.heave];
  const back: Point = [-Math.sin(yaw) * Math.cos(pitch), Math.cos(yaw) * Math.cos(pitch), Math.sin(pitch)];
  const from: Point = [onto(bow, offset), onto(starboard, offset), onto(up, offset)];
  const way: Point = [onto(bow, back), onto(starboard, back), onto(up, back)];
  const exits = sweptBoxes(ship.hull).flatMap((box) => exitOf(box, from, way) ?? []);
  return exits.length ? Math.max(...exits) + ORBIT_CLEAR_M : 0;
}

/** How far out from its middle, level at `up` over its waterline, a look along `bearing` (radians from its bow, to
 *  starboard positive) leaves every part of a hull (by its number) it passes through, metres; 0 where it passes none. */
export function clearAround(hull: number, bearing: number, up: number): number {
  const from: Point = [0, 0, up];
  const way: Point = [Math.cos(bearing), Math.sin(bearing), 0];
  const exits = sweptBoxes(hull).flatMap((box) => exitOf(box, from, way) ?? []);
  return exits.length ? Math.max(...exits) : 0;
}
