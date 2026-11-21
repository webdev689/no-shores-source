// The aim camera, DFO's: while a broadside is laid the eye eases out to the battery's
// aim eye, from one battery's to the other's in its own frame, and stops short of a ship alongside; let go, it eases
// home. A crippled ship's guns are silent, so its eye never moves (the caller asks for no side).
import { headingFrame } from '../rules/landRules.ts';
import { hullPaint, hullWaterline, SLOOP_HULL } from '../ships/hulls.ts';
import { aimEye, type Lying } from './aim.ts';

/** How long the eye takes to ease in or out, and from one battery to the other: its time constant, seconds. */
export const AIM_CAM_TAU = 0.22;
/** How far short of a ship alongside the eye stops on its way out from its ports, metres. */
export const AIM_CAM_CLEAR = 1.2;
/** How far a hull's rail stands over its upper gun line, metres. */
const RAIL_OVER_GUNS_M = 1;

type Point = readonly [number, number, number];

/** A hull the eye keeps clear of, in the world: its middle on the water (east, south), heading, half length and half
 *  beam, and the heights its keel and its rail stand at. */
export interface AimHull {
  readonly x: number;
  readonly y: number;
  readonly heading: number;
  readonly halfLength: number;
  readonly halfBeam: number;
  readonly bottom: number;
  readonly top: number;
}

/** A ship's hull as the eye keeps clear of it, from its numbers and pose: its waterline's box, its draught under it
 *  and its rail over it. */
export function aimHullOf(ship: readonly number[], heave: number, hull: number): AimHull {
  const [x = 0, y = 0, heading = 0] = ship;
  const waterline = hullWaterline(hull);
  return {
    x,
    y,
    heading,
    halfLength: waterline.lengthM / 2,
    halfBeam: waterline.beamM / 2,
    bottom: heave - waterline.draughtM,
    top: heave + hullPaint(hull).atM + RAIL_OVER_GUNS_M,
  };
}

/** The point `share` of the way from `from` to `to`. */
function toward(from: Point, to: Point, share: number): Point {
  return [
    from[0] + (to[0] - from[0]) * share,
    from[1] + (to[1] - from[1]) * share,
    from[2] + (to[2] - from[2]) * share,
  ];
}

/** A point in its own frame (along its keel, out to starboard, up from its waterline), and back. */
function toLocal(ship: Lying, point: Point): Point {
  const { forward, starboard } = headingFrame(ship.heading);
  const [east, south] = [point[0] - ship.x, point[1] - ship.y];
  return [east * forward[0] + south * forward[1], east * starboard[0] + south * starboard[1], point[2] - ship.heave];
}
function toWorld(ship: Lying, local: Point): Point {
  const { forward, starboard } = headingFrame(ship.heading);
  return [
    ship.x + forward[0] * local[0] + starboard[0] * local[1],
    ship.y + forward[1] * local[0] + starboard[1] * local[1],
    ship.heave + local[2],
  ];
}

/** Where along the segment from `from` to `to` (0 to 1) it first enters `box` grown by `pad` on every side; null if it
 *  never does (DFO's segmentBoxEntry). */
export function segmentBoxEntry(from: Point, to: Point, box: AimHull, pad: number): number | null {
  const ship = { x: box.x, y: box.y, heading: box.heading, heave: 0 };
  const [start, end] = [toLocal(ship, from), toLocal(ship, to)];
  const slabs = [
    [-box.halfLength - pad, box.halfLength + pad],
    [-box.halfBeam - pad, box.halfBeam + pad],
    [box.bottom - pad, box.top + pad],
  ] as const;
  let [enter, leave] = [0, 1];
  for (let axis = 0; axis < 3; axis++) {
    const [low, high] = slabs[axis] ?? [0, 0];
    const [begin, way] = [start[axis] ?? 0, (end[axis] ?? 0) - (start[axis] ?? 0)];
    if (Math.abs(way) < 1e-12) {
      if (begin < low || begin > high) return null;
      continue;
    }
    const [one, other] = [(low - begin) / way, (high - begin) / way];
    enter = Math.max(enter, Math.min(one, other));
    leave = Math.min(leave, Math.max(one, other));
    if (enter > leave) return null;
  }
  return enter;
}

/** The eye while aiming, eased in and out and from side to side, kept from frame to frame. */
export class AimCamera {
  /** How far in the eye has eased, 0 home to 1 at the battery, before it is smoothstepped. */
  private share = 0;
  private side: 1 | -1 | null = null;
  /** The eye's place in its own frame, eased from one battery's to the other's. */
  private local: Point | null = null;

  /** The frame's eye, `seconds` on: `home` (the camera's own) eased toward the aim eye on `want`'s side of `ship` (1
   *  starboard, -1 port) while it is given, kept short of every hull `alongside`; null eases it home. */
  eye(home: Point, want: 1 | -1 | null, ship: Lying, alongside: readonly AimHull[], seconds: number): Point {
    const step = 1 - Math.exp(-Math.max(0, seconds) / AIM_CAM_TAU);
    if (want) this.side = want;
    this.share += ((want ? 1 : 0) - this.share) * step;
    if (!want && this.share < 1e-3) [this.share, this.side, this.local] = [0, null, null];
    if (!this.side || this.share <= 0) return home;
    const { starboard } = headingFrame(ship.heading);
    const out = (hullWaterline(SLOOP_HULL).beamM / 2) * this.side;
    // Its ports' middle on that side, which the eye goes out from.
    const ports: Point = [
      ship.x + starboard[0] * out,
      ship.y + starboard[1] * out,
      ship.heave + hullPaint(SLOOP_HULL).atM,
    ];
    let eye = aimEye(ship, this.side) as Point;
    const clear = Math.min(1, ...alongside.map((hull) => segmentBoxEntry(ports, eye, hull, AIM_CAM_CLEAR) ?? 1));
    if (clear < 1) eye = toward(ports, eye, clear);
    const local = toLocal(ship, eye);
    this.local = this.local ? toward(this.local, local, step) : local;
    const k = this.share * this.share * (3 - 2 * this.share);
    return toward(home, toWorld(ship, this.local), k);
  }
}
