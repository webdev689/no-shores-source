// The aim camera: while a broadside is laid the view eases to its battery's station (aimStation) on the side taken,
// aboard over its deck as Black Flag's is, riding the ship as it is drawn, zoomed a little, and looks off the side at
// the water where the guns are laid, so the sight at the view's middle stands on the landing zone; let go, it eases
// home. A sinking ship's guns are silent, so its eye never moves (the caller asks for no side).
import type { FightLook } from '../rules/fightRules.ts';
import { shipAxes } from '../ships/shipAxes.ts';
import { lookPitch, lookReach } from './aim.ts';
import { aimStation, batteryOf, LOWEST_ELEVATION } from './aimStation.ts';
import { abeamOut, clearAround, ROUND_CLEAR_M, sweptBoxes } from './shipClear.ts';

/** How long the eye takes to ease in or out, and from one battery to the other: its time constant, seconds. */
export const AIM_CAM_TAU = 0.22;
/** The view's turn along the keel to stand over the volley's fall (`laidAlong`) is followed this slowly, seconds, so a
 *  late answer from the rules never jerks the view. */
const DRIFT_TAU = 0.25;
/** Taken again on the other side, the view goes out there once it has eased this near home. */
const SWAP_SHARE = 0.05;
/** A held aim's drags across this many pixels, their last fading over `fadeS` seconds, swing it round to the other
 *  side: a deliberate turn, not a slip of the hand laying range; the right stick leant whole does it in half a
 *  second. */
export const SWING = { px: 120, fadeS: 0.3 } as const;
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
 *  pitch held where the guns' nearest or longest stopped it; and how far the view has eased to the aim (0 home, 1
 *  there), for its zoom. */
export interface AimFrame extends AimView {
  readonly look: FightLook | null;
  readonly heldPitch: number;
  readonly eased: number;
}

/** How much narrower the view is, eased in to the aim: a little zoom, as Black Flag's. */
export const AIM_ZOOM = 0.15;

/** A lay as the aim follows it, the sea's or a fleet room's: its side, each gun's launch (its mouth, then its
 *  velocity), where each stops, its elevation (radians), and its guns' longest throw from where they leave. */
export interface Laid {
  readonly side: 'port' | 'starboard';
  readonly launches: readonly (readonly number[])[];
  readonly ends: readonly ({ readonly point: readonly number[] } | null)[];
  readonly elevation: number;
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

/** Where along its keel (metres from its middle) the view's middle should meet the water `range` out so that, seen
 *  from `eye`, it stands over the volley's fall: the ship's own way the balls carry and their ripple, and a look that
 *  grazes the swell meeting a crest short of `range`, its balls falling there. None where nothing of a lay on that
 *  side falls. */
export function laidAlong(lay: Laid | null, side: 1 | -1, ship: AimShip, eye: Point, range: number): number | null {
  if (!lay || (lay.side === 'starboard' ? 1 : -1) !== side) return null;
  const fell = lay.ends.flatMap((end) => (end ? [end.point] : []));
  if (!fell.length) return null;
  const [bow, out] = [
    [Math.sin(ship.heading), -Math.cos(ship.heading)],
    [Math.cos(ship.heading) * side, Math.sin(ship.heading) * side],
  ] as const;
  const flat = (point: readonly number[]) => {
    const [east, south] = [(point[0] ?? 0) - ship.x, (point[1] ?? 0) - ship.y];
    return [east * bow[0] + south * bow[1], east * out[0] + south * out[1]] as const;
  };
  const placed = fell.map(flat);
  const fallAlong = placed.reduce((sum, [along]) => sum + along, 0) / placed.length;
  const fallOut = placed.reduce((sum, [, out]) => sum + out, 0) / placed.length;
  const [eyeAlong, eyeOut] = flat(eye);
  return eyeAlong + ((fallAlong - eyeAlong) * (range - eyeOut)) / Math.max(1, fallOut - eyeOut);
}

/** The farthest out from its middle a lay reaches on the water, metres: its guns' longest throw from where they
 *  leave; none without a lay on that side. */
export function laidReach(lay: Laid | null, side: 1 | -1, ship: { x: number; y: number; heading: number }) {
  if (!lay || (lay.side === 'starboard' ? 1 : -1) !== side || !lay.launches.length) return Infinity;
  const [east, south] = [Math.cos(ship.heading) * side, Math.sin(ship.heading) * side];
  const out = lay.launches.map((launch) => ((launch[0] ?? 0) - ship.x) * east + ((launch[1] ?? 0) - ship.y) * south);
  return out.reduce((sum, value) => sum + value, 0) / out.length + lay.reach;
}

/** How far out from its middle a lay's balls fall while its guns stand at their lowest, metres: the nearest they lay
 *  as the ship lies on the swell now, which a crest under it or a trough out there carries farther than at rest; none
 *  while they could go lower, or without a lay on that side. */
export function laidNearest(lay: Laid | null, side: 1 | -1, ship: { x: number; y: number; heading: number }) {
  if (!lay || (lay.side === 'starboard' ? 1 : -1) !== side || lay.elevation > 1e-6 - LOWEST_ELEVATION) return 0;
  const [east, south] = [Math.cos(ship.heading) * side, Math.sin(ship.heading) * side];
  const out = lay.ends.flatMap((end) =>
    end ? [((end.point[0] ?? 0) - ship.x) * east + ((end.point[1] ?? 0) - ship.y) * south] : [],
  );
  return out.length ? out.reduce((sum, value) => sum + value, 0) / out.length : 0;
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

/** The aim's view, eased in and out, kept from frame to frame. A held aim keeps the side it was taken on until it is
 *  let go or swung to the other by a drag across (`drag`); taken again or swung there, the view eases home before it
 *  goes out there, never across the ship. */
export class AimCamera {
  /** How far in the eye has eased, 0 home to 1 at the battery, before it is smoothstepped. */
  private share = 0;
  private side: 1 | -1 | null = null;
  /** The side the aim held now was taken on, kept until it is let go. */
  private held: 1 | -1 | null = null;
  /** How far along the keel past its battery's middle the view's middle meets the water, eased (`laidAlong`). */
  private drift = 0;
  /** The drags across the aim held now, pixels to the right, fading; and while it swings, the bearing off its bow
   *  its home looks along in place of the orbit's. */
  private swingPx = 0;
  private swungHome: number | null = null;

  /** A drag of the view while an aim is held, pixels to the right and down: one more across than down counts, so a
   *  hand laying range up and down swings nothing; far enough, the aim laid swings round to the
   *  other side the way the drag turns the view, aiming all the while. Its home turns to look along the keel that way
   *  (from starboard, astern for a drag to the right and ahead for one to the left; the mirror from port), so the view
   *  eases out over that end of the ship, its look turning as the drag did, and in to the other battery as an aim
   *  taken again does; nothing is laid on the way round, so nothing fires. */
  drag(right: number, down = 0): void {
    if (this.held && Math.abs(right) > Math.abs(down)) this.swingPx += right;
  }

  /** The frame `seconds` on. */
  frame(ask: AimAsk, seconds: number): AimFrame {
    const step = 1 - Math.exp(-Math.max(0, seconds) / AIM_CAM_TAU);
    const { ship } = ask;
    if (!ask.want || !this.held) [this.held, this.swingPx, this.swungHome] = [ask.want, 0, null];
    this.swingPx *= Math.exp(-Math.max(0, seconds) / SWING.fadeS);
    if (this.held && this.side === this.held && this.share > 0.99 && Math.abs(this.swingPx) >= SWING.px) {
      this.swungHome = ((this.held + Math.sign(this.swingPx)) * Math.PI) / 2;
      [this.held, this.swingPx] = [this.held === 1 ? -1 : 1, 0];
    }
    const home = this.swungHome === null ? ask.home : turnedRound(ask.home, ship, ship.heading + this.swungHome);
    const wanted = this.held;
    const swapping = wanted !== null && this.side !== null && wanted !== this.side;
    this.share += ((wanted && !swapping ? 1 : 0) - this.share) * step;
    if (swapping && this.share < SWAP_SHARE) [this.side, this.drift] = [wanted, 0];
    else if (!this.side) this.side = wanted;
    if (!wanted && this.share < 1e-3) [this.share, this.side, this.drift] = [0, null, 0];
    const side = this.side;
    if (!side || this.share <= 0) return { ...home, look: null, heldPitch: ask.pitch, eased: 0 };
    const station = aimStation(ship.hull);
    const local = [station.eye[0], station.eye[1] * side, station.eye[2]] as const;
    const eye = toWorld(ship, local);
    const height = station.eye[2];
    const asked = station.eye[1] + lookReach(-ask.pitch, height);
    // No nearer than the guns lay at rest, nor than where they fall at their lowest as the ship lies now: the marks
    // then stand under the sight however the swell lifts the ship.
    const nearest = Math.max(batteryOf(ship.guns ?? ship.hull).nearestM, laidNearest(ask.lay, side, ship));
    const range = Math.min(laidReach(ask.lay, side, ship), Math.max(nearest, asked));
    const heldPitch = range === asked ? ask.pitch : -lookPitch(range - station.eye[1], height);
    // The point laid on the water, square off the battery's middle and on along the keel to stand over the fall.
    const driftStep = 1 - Math.exp(-Math.max(0, seconds) / DRIFT_TAU);
    const over = (laidAlong(ask.lay, side, ship, eye, range) ?? station.ports[0]) - station.ports[0];
    this.drift += (over - this.drift) * driftStep;
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
    const drawn = toWorld(ship, wayAboard(ship.hull, toLocal(ship, home.eye), local, k, side, station.onDeck));
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
      eased: k,
    };
  }
}

/** `view` turned round the ship's middle to look along `yaw`, its eye as far out and as high. */
function turnedRound(view: AimView, ship: AimShip, yaw: number): AimView {
  const [east, south] = [view.eye[0] - ship.x, view.eye[1] - ship.y];
  const bearing = Math.atan2(east, -south) + yaw - view.yaw;
  const out = Math.hypot(east, south);
  return {
    eye: [ship.x + Math.sin(bearing) * out, ship.y - Math.cos(bearing) * out, view.eye[2]],
    yaw,
    pitch: view.pitch,
  };
}

/** The point `share` of the way from `from` to an eye `to` (both in a ship's frame) laying `side` (1 starboard, -1
 *  port): round the ship as `roundShip` goes to a point abeam of `to` on that side clear of its hull and every sail's
 *  swing, then straight in over its rail, square to its side, to the eye aboard; an eye out past its side, round to it
 *  alone. */
export function wayAboard(hull: number, from: Point, to: Point, share: number, side: 1 | -1, onDeck: boolean): Point {
  // There, the way is not looked for: the ship heels and pitches under the eye, and no frame of a held aim searches.
  if (share >= 1) return to;
  if (!onDeck) return roundShip(hull, from, to, share);
  const abeam: Point = [to[0], side * abeamOut(hull, to), to[2]];
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
