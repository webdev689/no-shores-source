// The aim camera: while a broadside is laid the view eases to its battery's station (aimStation) on the side taken,
// aboard over its deck as Black Flag's is, riding the ship as it is drawn, zoomed a little, and looks off the side at
// the water where the guns are laid, so the sight at the view's middle stands on the landing zone; let go, it eases
// home. A sinking ship's guns are silent, so its eye never moves (the caller asks for no side).
import type { FightLook } from '../rules/fightRules.ts';
import { hullBox } from '../ships/hulls.ts';
import { shipAxes } from '../ships/shipAxes.ts';
import { lookPitch, lookReach } from './aim.ts';
import { aimStation } from './aimStation.ts';
import { clearAround, sweptBoxes } from './shipClear.ts';

/** How long the eye takes to ease in or out, and from one battery to the other: its time constant, seconds. */
export const AIM_CAM_TAU = 0.22;
/** The landing zone's drift along the keel (the ship's own way carried by the balls) is followed this slowly,
 *  seconds, so a late answer from the rules never jerks the view. */
const DRIFT_TAU = 0.25;
/** Taken again on the other side, the view goes out there once it has eased this near home. */
const SWAP_SHARE = 0.05;
/** On its way between the camera's own place and the battery the eye keeps this far out past the ship and its rig,
 *  and this far over and under each part of it, metres, coming in to the battery's station at the end. */
const ROUND_CLEAR_M = 0.6;
/** The eye's way round the ship is felt every this many radians of bearing (5°), and every this many metres of height. */
const ROUND_STEP = Math.PI / 36;
const ROUND_RISE_M = 0.5;

type Point = readonly [number, number, number];

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
 *  out from the ship's middle, its ray from the eye along the view's middle), none while it eases home; the look's
 *  pitch held where the guns' nearest or longest stopped it; how far the view has eased to the aim (0 home, 1 there),
 *  for its zoom; and how long the look has been laid on its side, seconds. */
export interface AimFrame extends AimView {
  readonly look: FightLook | null;
  readonly heldPitch: number;
  readonly eased: number;
  readonly heldS: number;
}

/** How much narrower the view is, eased in to the aim: a little zoom, as Black Flag's. */
export const AIM_ZOOM = 0.15;

/** A lay as the aim follows it, the sea's or a fleet room's: its side, each gun's launch (its mouth, then its
 *  velocity), where each stops, and its guns' longest throw from where they leave. */
export interface Laid {
  readonly side: 'port' | 'starboard';
  readonly launches: readonly (readonly number[])[];
  readonly ends: readonly ({ readonly point: readonly number[] } | null)[];
  readonly reach: number;
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
 *  home), the ship as drawn, the look's pitch (down positive, its input: how far out the guns are laid), and the lay
 *  the rules last answered. */
export interface AimAsk {
  readonly home: AimView;
  readonly want: 1 | -1 | null;
  readonly ship: AimShip;
  readonly pitch: number;
  readonly lay: Laid | null;
}

/** The aim's view, eased in and out, kept from frame to frame. A held aim keeps the side it was taken on; taken
 *  again on the other side, the view eases home before it goes out there, never across the ship. */
export class AimCamera {
  /** How far in the eye has eased, 0 home to 1 at the battery, before it is smoothstepped. */
  private share = 0;
  private side: 1 | -1 | null = null;
  /** The side the aim held now was taken on, kept until it is let go. */
  private held: 1 | -1 | null = null;
  /** The landing zone's drift along the keel, eased. */
  private drift = 0;
  /** How long the look has been laid on its side, seconds. */
  private laid = 0;

  /** The frame `seconds` on. */
  frame(ask: AimAsk, seconds: number): AimFrame {
    const step = 1 - Math.exp(-Math.max(0, seconds) / AIM_CAM_TAU);
    const { home, ship } = ask;
    if (!ask.want || !this.held) this.held = ask.want;
    const wanted = this.held;
    const swapping = wanted !== null && this.side !== null && wanted !== this.side;
    this.share += ((wanted && !swapping ? 1 : 0) - this.share) * step;
    if (swapping && this.share < SWAP_SHARE) [this.side, this.drift] = [wanted, 0];
    else if (!this.side) this.side = wanted;
    if (!wanted && this.share < 1e-3) [this.share, this.side, this.drift] = [0, null, 0];
    const side = this.side;
    if (!side || this.share <= 0) {
      this.laid = 0;
      return { ...home, look: null, heldPitch: ask.pitch, eased: 0, heldS: 0 };
    }
    const station = aimStation(ship.hull);
    const local = [station.eye[0], station.eye[1] * side, station.eye[2]] as const;
    const eye = toWorld(ship, local);
    const driftStep = 1 - Math.exp(-Math.max(0, seconds) / DRIFT_TAU);
    this.drift += (laidDrift(ask.lay, side, ship.heading) - this.drift) * driftStep;
    const height = station.eye[2];
    const asked = station.eye[1] + lookReach(-ask.pitch, height);
    const { nearestM } = aimStation(ship.guns ?? ship.hull);
    const range = Math.min(laidReach(ask.lay, side, ship), Math.max(nearestM, asked));
    const heldPitch = range === asked ? ask.pitch : -lookPitch(range - station.eye[1], height);
    // The point laid on the water, square off the battery's middle and on along the keel as far as the balls drift.
    const along = station.ports[0] + this.drift;
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
    const drawn = toWorld(ship, wayAboard(ship.hull, toLocal(ship, home.eye), local, k, station.onDeck));
    const laying = wanted === side;
    const look = laying
      ? { bearing: 90 * side, range, ray: [...eye, east / length, south / length, up / length] }
      : null;
    this.laid = laying ? this.laid + Math.max(0, seconds) : 0;
    return {
      eye: drawn,
      yaw: home.yaw + turnTo(home.yaw, yaw) * k,
      pitch: home.pitch + (pitch - home.pitch) * k,
      look,
      heldPitch,
      eased: k,
      heldS: this.laid,
    };
  }
}

/** The point `share` of the way from `from` to an eye `to` (both in a ship's frame): round the ship as `roundShip`
 *  goes to a point abeam of `to` clear of its hull and every sail's swing, then straight in over its rail, square to
 *  its side, to the eye aboard; an eye out past its side, round to it alone. */
export function wayAboard(hull: number, from: Point, to: Point, share: number, onDeck: boolean): Point {
  if (!onDeck) return roundShip(hull, from, to, share);
  const side = Math.sign(to[1]) || 1;
  const [, high] = hullBox(hull);
  const past = sweptBoxes(hull)
    .filter(
      ([low, top]) =>
        to[0] > low[0] && to[0] < top[0] && to[2] > low[2] - ROUND_CLEAR_M && to[2] < top[2] + ROUND_CLEAR_M,
    )
    .map(([, top]) => top[1]);
  const abeam: Point = [to[0], side * (Math.max(Math.abs(high[1]), ...past) + ROUND_CLEAR_M), to[2]];
  const [round, last] = [sweepOf(hull, from, abeam).length, Math.abs(abeam[1] - to[1])];
  const split = round / Math.max(1e-9, round + last);
  if (share < split) return roundShip(hull, from, abeam, share / split);
  return toward(abeam, to, (share - split) / Math.max(1e-9, 1 - split));
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
    // Felt every 5° round and every half metre up or down, so a drop through a sail's swing is felt however short.
    const steps = Math.max(1, Math.ceil(Math.abs(turn) / ROUND_STEP), Math.ceil(Math.abs(toUp - up) / ROUND_RISE_M));
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
    // The way round counts its climb or drop too, so a change of height is eased over it, never taken in a frame.
    const round = Math.hypot(Math.abs(turn) * Math.max(safe, out, toOut), toUp - up);
    return { turn, safe, outward, inward, length: outward + round + inward };
  });
  const [first, second] = ways as [(typeof ways)[0], (typeof ways)[0]];
  return first.length <= second.length ? first : second;
}
