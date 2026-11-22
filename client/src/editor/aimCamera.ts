// The aim camera: while a broadside is laid the view eases out to its battery's station (aimStation) on the side
// taken, riding the ship as it is drawn, and looks square off it at the water where the guns are laid, so the sight
// at the view's middle stands on the landing zone; let go, it eases home. A crippled ship's guns are silent, so its
// eye never moves (the caller asks for no side).
import type { FightLook } from '../rules/fightRules.ts';
import { hullBox, hullMouths, hullSails } from '../ships/hulls.ts';
import { shipAxes } from '../ships/shipAxes.ts';
import { lookPitch, lookReach } from './aim.ts';
import { aimStation } from './aimStation.ts';
import { clearAround, sweptBoxes } from './shipClear.ts';

/** How long the eye takes to ease in or out, and from one battery to the other: its time constant, seconds. */
export const AIM_CAM_TAU = 0.22;
/** How far short of a ship alongside the eye stops on its way out from its ports, metres. */
export const AIM_CAM_CLEAR = 1.2;
/** How far a hull's rail stands over its box's top, metres. */
const RAIL_OVER_BOX_M = 1;
/** A ship alongside's yards over its side count as its side up to this far over its box, metres. */
const YARDS_OVER_BOX_M = 4;
/** The landing zone's drift along the keel (the ship's own way carried by the balls) is followed this slowly,
 *  seconds, so a late answer from the rules never jerks the view. */
const DRIFT_TAU = 0.25;
/** Taken again on the other side, the view goes out there once it has eased this near home. */
const SWAP_SHARE = 0.05;
/** On its way between the camera's own place and the battery the eye keeps this far out past the ship and its rig,
 *  and this far over and under each part of it, metres, coming in to the battery's station at the end. */
const ROUND_CLEAR_M = 0.6;
/** However close a ship alongside, the aim's eye stays this far clear of its own hull and sails' swing, metres. */
const OWN_CLEAR_M = 0.5;
/** The eye's way round the ship is felt every this many radians of bearing (5°). */
const ROUND_STEP = Math.PI / 36;

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

/** The ship the guns are laid from, as it is drawn: its middle (metres east and south), heading (radians clockwise
 *  from north), its waterline's height, its bow's rise and its heel to starboard (radians), its hull's number, and the
 *  hull whose guns the rules fire where that is another (the story's Brig fires a Sloop's). */
export interface AimShip {
  readonly x: number;
  readonly y: number;
  readonly heading: number;
  readonly heave: number;
  readonly pitch: number;
  readonly roll: number;
  readonly hull: number;
  readonly guns?: number;
}

/** A view: its eye (world metres) and its look, yaw clockwise from north and pitch down from the horizon (radians). */
export interface AimView {
  readonly eye: Point;
  readonly yaw: number;
  readonly pitch: number;
}

/** A frame of the aim: the view drawn, and the look laid while aiming (its bearing square off the side, its range
 *  out from the ship's middle, its ray from the eye along the view's middle), none while it eases home; and the look's
 *  pitch held where the guns' nearest or longest stopped it. */
export interface AimFrame extends AimView {
  readonly look: FightLook | null;
  readonly heldPitch: number;
}

/** A lay as the aim follows it, the sea's or a fleet room's: its side, each gun's launch (its mouth, then its
 *  velocity), where each stops, and its guns' longest throw from where they leave. */
export interface Laid {
  readonly side: 'port' | 'starboard';
  readonly launches: readonly (readonly number[])[];
  readonly ends: readonly ({ readonly point: readonly number[] } | null)[];
  readonly reach: number;
}

/** A ship's hull as the eye keeps clear of it, from its numbers and pose: its box from its keel to its rail, as wide
 *  as its hull, its guns' mouths or the low yards over its side. */
export function aimHullOf(ship: readonly number[], heave: number, hull: number): AimHull {
  const [x = 0, y = 0, heading = 0] = ship;
  const [low, high] = hullBox(hull);
  const yards = hullSails(hull).flatMap((sail) =>
    sail.kind === 'square' && sail.foot_port[2] < high[2] + YARDS_OVER_BOX_M
      ? [Math.abs(sail.foot_port[1]), Math.abs(sail.foot_starboard[1])]
      : [],
  );
  const mouths = hullMouths(hull).map((mouth) => Math.abs(mouth[1]));
  return {
    x,
    y,
    heading,
    halfLength: Math.max(Math.abs(low[0]), Math.abs(high[0])),
    halfBeam: Math.max(Math.abs(low[1]), Math.abs(high[1]), ...mouths, ...yards),
    bottom: heave + low[2],
    top: heave + high[2] + RAIL_OVER_BOX_M,
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

/** The turn from `from` to `to` the short way round, radians. */
function turnTo(from: number, to: number): number {
  return to - from - 2 * Math.PI * Math.round((to - from) / (2 * Math.PI));
}

/** A point in a ship's frame (along its keel, out to starboard, up from its waterline) in the world as it lies, and
 *  back. */
function toWorld(ship: AimShip, local: Point): Point {
  const [bow, starboard, up] = shipAxes(ship.heading, ship.pitch, ship.roll);
  const along = (axis: number) =>
    (bow[axis] ?? 0) * local[0] + (starboard[axis] ?? 0) * local[1] + (up[axis] ?? 0) * local[2];
  return [ship.x + along(0), ship.y + along(1), ship.heave + along(2)];
}
function toLocal(ship: AimShip, point: Point): Point {
  const [bow, starboard, up] = shipAxes(ship.heading, ship.pitch, ship.roll);
  const offset = [point[0] - ship.x, point[1] - ship.y, point[2] - ship.heave];
  const onto = (axis: readonly number[]) => offset.reduce((sum, value, index) => sum + value * (axis[index] ?? 0), 0);
  return [onto(bow), onto(starboard), onto(up)];
}

/** Where along the segment from `from` to `to` (0 to 1) it first enters `box` grown by `pad` on every side; null if it
 *  never does (DFO's segmentBoxEntry). */
export function segmentBoxEntry(from: Point, to: Point, box: AimHull, pad: number): number | null {
  const ship = { x: box.x, y: box.y, heading: box.heading, heave: 0, pitch: 0, roll: 0, hull: 0 };
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

/** How far along its keel a lay's balls fall from where they leave (metres): the ship's own way they carry, and their
 *  ripple; none where it lays nothing on that side or nothing falls. */
export function laidDrift(lay: Laid | null, side: 1 | -1, heading: number): number {
  if (!lay || (lay.side === 'starboard' ? 1 : -1) !== side) return 0;
  const [east, south] = [Math.sin(heading), -Math.cos(heading)];
  const along = (point: readonly number[]) => (point[0] ?? 0) * east + (point[1] ?? 0) * south;
  const fell = lay.ends.flatMap((end) => (end ? [along(end.point)] : []));
  if (!fell.length) return 0;
  const left = lay.launches.map(along);
  const mean = (values: readonly number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  return mean(fell) - mean(left);
}

/** The farthest out from its middle a lay reaches on the water, metres: its guns' longest throw from where they
 *  leave; none without a lay on that side. */
export function laidReach(lay: Laid | null, side: 1 | -1, ship: { x: number; y: number; heading: number }) {
  if (!lay || (lay.side === 'starboard' ? 1 : -1) !== side || !lay.launches.length) return Infinity;
  const [east, south] = [Math.cos(ship.heading) * side, Math.sin(ship.heading) * side];
  const out = lay.launches.map((launch) => ((launch[0] ?? 0) - ship.x) * east + ((launch[1] ?? 0) - ship.y) * south);
  return out.reduce((sum, value) => sum + value, 0) / out.length + lay.reach;
}

/** What the aim is given each frame: the view it eases from, the side wanted (1 starboard, -1 port, null to ease
 *  home), the ship as drawn, the look's pitch (down positive, its input: how far out the guns are laid), the lay the
 *  rules last answered, and each hull alongside to keep short of. */
export interface AimAsk {
  readonly home: AimView;
  readonly want: 1 | -1 | null;
  readonly ship: AimShip;
  readonly pitch: number;
  readonly lay: Laid | null;
  readonly alongside: readonly AimHull[];
}

/** The aim's view, eased in and out, kept from frame to frame. A held aim keeps the side it was taken on; taken
 *  again on the other side, the view eases home before it goes out there, never across the ship. */
export class AimCamera {
  /** How far in the eye has eased, 0 home to 1 at the battery, before it is smoothstepped. */
  private share = 0;
  private side: 1 | -1 | null = null;
  /** The side the aim held now was taken on, kept until it is let go. */
  private held: 1 | -1 | null = null;
  /** The eye's place in its ship's frame, eased as a ship alongside comes and goes. */
  private local: Point | null = null;
  /** The landing zone's drift along the keel, eased. */
  private drift = 0;

  /** The frame `seconds` on. */
  frame(ask: AimAsk, seconds: number): AimFrame {
    const step = 1 - Math.exp(-Math.max(0, seconds) / AIM_CAM_TAU);
    const { home, ship } = ask;
    if (!ask.want || !this.held) this.held = ask.want;
    const wanted = this.held;
    const swapping = wanted !== null && this.side !== null && wanted !== this.side;
    this.share += ((wanted && !swapping ? 1 : 0) - this.share) * step;
    if (swapping && this.share < SWAP_SHARE) [this.side, this.local, this.drift] = [wanted, null, 0];
    else if (!this.side) this.side = wanted;
    if (!wanted && this.share < 1e-3) [this.share, this.side, this.local, this.drift] = [0, null, null, 0];
    const side = this.side;
    if (!side || this.share <= 0) return { ...home, look: null, heldPitch: ask.pitch };
    const station = aimStation(ship.hull);
    const mirrored = (point: Point): Point => [point[0], point[1] * side, point[2]];
    const ports = toWorld(ship, mirrored(station.ports));
    let eye = toWorld(ship, mirrored(station.eye));
    const alongside = Math.min(
      1,
      ...ask.alongside.map((hull) => segmentBoxEntry(ports, eye, hull, AIM_CAM_CLEAR) ?? 1),
    );
    // Never so far in that its own hull or a sail's swing stands in the view, however close the other ship lies.
    const clear = Math.max(alongside, ownClear(ship.hull, station));
    if (clear < 1) eye = toward(ports, eye, clear);
    const local = toLocal(ship, eye);
    this.local = this.local ? toward(this.local, local, step) : local;
    eye = toWorld(ship, this.local);
    const driftStep = 1 - Math.exp(-Math.max(0, seconds) / DRIFT_TAU);
    this.drift += (laidDrift(ask.lay, side, ship.heading) - this.drift) * driftStep;
    const height = station.eye[2];
    const asked = station.eye[1] + lookReach(-ask.pitch, height);
    const { nearestM } = aimStation(ship.guns ?? ship.hull);
    const range = Math.min(laidReach(ask.lay, side, ship), Math.max(nearestM, asked));
    const heldPitch = range === asked ? ask.pitch : -lookPitch(range - station.eye[1], height);
    // The point laid on the water, square off the battery's middle and on along the keel as far as the balls drift.
    const along = station.eye[0] + this.drift;
    const out = range * side;
    const target = [
      ship.x + Math.sin(ship.heading) * along + Math.cos(ship.heading) * out,
      ship.y - Math.cos(ship.heading) * along + Math.sin(ship.heading) * out,
      0,
    ];
    const [east, south, up] = [target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]];
    const flat = Math.hypot(east, south);
    const [yaw, pitch] = [Math.atan2(east, -south), Math.atan2(-up, flat)];
    const length = Math.hypot(flat, up) || 1;
    const k = this.share * this.share * (3 - 2 * this.share);
    const drawn = toWorld(ship, roundShip(ship.hull, toLocal(ship, home.eye), this.local, k));
    const laying = wanted === side;
    const look = laying
      ? { bearing: 90 * side, range, ray: [...eye, east / length, south / length, up / length] }
      : null;
    return {
      eye: drawn,
      yaw: home.yaw + turnTo(home.yaw, yaw) * k,
      pitch: home.pitch + (pitch - home.pitch) * k,
      look,
      heldPitch,
    };
  }
}

/** How far out from its ports toward its station (0 to 1) the eye must stay to stand `OWN_CLEAR_M` clear of its own
 *  hull and every sail's swing. */
function ownClear(hull: number, station: ReturnType<typeof aimStation>): number {
  const within = (share: number) => {
    const [along, out, up] = [0, 1, 2].map(
      (axis) => (station.ports[axis] ?? 0) + ((station.eye[axis] ?? 0) - (station.ports[axis] ?? 0)) * share,
    ) as [number, number, number];
    return sweptBoxes(hull).some(
      ([low, high]) =>
        along > low[0] - OWN_CLEAR_M &&
        along < high[0] + OWN_CLEAR_M &&
        out > low[1] - OWN_CLEAR_M &&
        out < high[1] + OWN_CLEAR_M &&
        up > low[2] - OWN_CLEAR_M &&
        up < high[2] + OWN_CLEAR_M,
    );
  };
  let share = 1;
  while (share > 0 && !within(share - 0.05)) share -= 0.05;
  return Math.max(0, share);
}

/** A place in a ship's frame as its bearing from its bow (radians, to starboard positive), its distance out from its
 *  middle, and its height. */
function roundOf(point: Point): [number, number, number] {
  return [Math.atan2(point[1], point[0]), Math.hypot(point[0], point[1]), point[2]];
}

/** How far out a level look along `bearing` at `up` keeps clear of every part of a hull and its sails' swing, from
 *  `ROUND_CLEAR_M` under to over it, with that margin out past it. */
const clearOf = (hull: number, bearing: number, up: number): number =>
  Math.max(...[-ROUND_CLEAR_M, 0, ROUND_CLEAR_M].map((over) => clearAround(hull, bearing, up + over))) + ROUND_CLEAR_M;

/** The point `share` of the way round a ship (by its hull's number) from `from` to `to`, both in its frame: out from
 *  `from` to the one distance that clears its hull and every sail's swing all the way round, round at that distance
 *  (or farther, eased between the two ends' own) as its height eases, and in to `to`; the way round its bow or its
 *  stern that is shorter. One distance for the whole way never steps in and out as the eye passes a sail's edge, and a
 *  straight line from one beam to a battery on the other would pass through its rig. */
export function roundShip(hull: number, from: Point, to: Point, share: number): Point {
  if (share >= 1) return to;
  const [[bearing, out, up], [toBearing, toOut, toUp]] = [roundOf(from), roundOf(to)];
  const { turn, safe, outward, inward, length } = sweepOf(hull, from, to);
  if (length < 1e-9) return to;
  const placed = (round: number, reach: number, height: number): Point => [
    Math.cos(round) * reach,
    Math.sin(round) * reach,
    height,
  ];
  const along = share * length;
  if (along < outward) return placed(bearing, out + along, up);
  const arc = length - outward - inward;
  if (along < outward + arc) {
    const part = arc > 0 ? (along - outward) / arc : 1;
    return placed(bearing + turn * part, Math.max(safe, out + (toOut - out) * part), up + (toUp - up) * part);
  }
  return placed(toBearing, Math.max(toOut, safe - (along - outward - arc)), toUp);
}

/** The way round a hull from `from` to `to`, as `roundShip` goes: the turn, the distance it keeps, how far out and in
 *  it goes at either end, and its length; the last one kept, as both ends hold still while the aim eases. */
let swept: { hull: number; from: Point; to: Point; way: ReturnType<typeof sweepFor> } | null = null;
function sweepOf(hull: number, from: Point, to: Point) {
  const same = (one: Point, other: Point) => one.every((part, index) => Math.abs(part - (other[index] ?? 0)) < 1e-3);
  if (swept?.hull !== hull || !same(swept.from, from) || !same(swept.to, to))
    swept = { hull, from, to, way: sweepFor(hull, from, to) };
  return swept.way;
}

function sweepFor(hull: number, from: Point, to: Point) {
  const [[bearing, out, up], [toBearing, toOut, toUp]] = [roundOf(from), roundOf(to)];
  const short = turnTo(bearing, toBearing);
  // A box's farthest from the middle along any bearing lies along one of its corners', so each is felt too.
  const corners = sweptBoxes(hull).flatMap(([low, high]) =>
    [low[0], high[0]].flatMap((along) => [low[1], high[1]].map((out) => Math.atan2(out, along))),
  );
  const ways = [short, short - Math.sign(short || 1) * 2 * Math.PI].map((turn) => {
    const steps = Math.max(1, Math.ceil(Math.abs(turn) / ROUND_STEP));
    const partOf = (round: number) => {
      const ahead = (((Math.sign(turn) * (round - bearing)) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      return turn === 0 ? 0 : ahead / Math.abs(turn);
    };
    const felt = [
      ...Array.from({ length: steps + 1 }, (_unused, index) => index / steps),
      ...corners.flatMap((round) => [round - 1e-4, round + 1e-4].map(partOf)).filter((part) => part <= 1),
    ];
    const safe = Math.max(...felt.map((part) => clearOf(hull, bearing + turn * part, up + (toUp - up) * part)));
    const [outward, inward] = [Math.max(0, safe - out), Math.max(0, safe - toOut)];
    return { turn, safe, outward, inward, length: outward + Math.abs(turn) * Math.max(safe, out, toOut) + inward };
  });
  const [first, second] = ways as [(typeof ways)[0], (typeof ways)[0]];
  return first.length <= second.length ? first : second;
}
