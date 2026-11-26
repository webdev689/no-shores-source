// A ship's sails as DFO set them (its galleonRig.js poses, its Come Sail Away's updateSails and autoTrim), on the
// corners its own model gives each sail: a canvas of grid points filled from the side the wind blows to, flapping in
// its eye, a gaff swung to leeward, a square sail hung from its yard, braced round and bellied forward, and furled
// or set as its sails come down or go up.

import { ShipHarm } from './shipHarm.ts';

type Point = readonly [number, number, number];

/** A sail's corners as its export measured them, in its frame (x to its bow, y to starboard, z up), metres. */
export type SailCorners =
  | { readonly kind: 'gaff'; readonly tack: Point; readonly clew: Point; readonly throat: Point; readonly peak: Point }
  | { readonly kind: 'stay'; readonly tack: Point; readonly clew: Point; readonly head: Point }
  | {
      readonly kind: 'square';
      readonly foot_port: Point;
      readonly foot_starboard: Point;
      readonly head_port: Point;
      readonly head_starboard: Point;
    };

/** A canvas's grid: points along its foot, and rows from its foot to its head. */
export const SAIL_COLUMNS = 8;
export const SAIL_ROWS = 7;
/** A canvas's cells: one between each four of its grid's points, numbered row by row from its foot. */
export const SAIL_CELLS = (SAIL_COLUMNS - 1) * (SAIL_ROWS - 1);
/** How far DFO's Large Boat's gaff and staysail belly set full, metres, and a hanging gaff's and staysail's. */
const GAFF_BELLY_M = 1.1;
const GAFF_HANGING_M = 0.12;
const STAY_BELLY_M = 0.55;
const STAY_HANGING_M = 0.1;
/** How far a square sail bellies forward set full, and hanging, metres: about a tenth of its foot, as a staysail's. */
const SQUARE_BELLY_M = 1.2;
const SQUARE_HANGING_M = 0.15;
/** A square sail furled is gathered to this share of its drop below its yard. */
const SQUARE_FURLED = 0.05;
/** A staysail's grid stops this share of the way to its head, its head row a short cut across it. */
const STAY_TOP = 0.985;
/** A sail's wind walks this far a second; a gaff swings 100 degrees a second, 300 when DFO's rule says. */
const WIND_PER_S = 1;
const TRIM_DEG_S = 100;
const TRIM_FAST_DEG_S = 300;
/** A sail this many degrees off the wind's way luffs: it flaps on a sine of the clock. */
const LUFF_DEG = 150;
/** A sail is set or furled over this many seconds. */
const SET_S = 2;

/** What the sails answer to: the degrees from its bow to where the wind blows (to starboard positive), and whether
 *  its sails are set. The sea's one steady wind is always enough to fill them. */
export interface SailWind {
  readonly offDeg: number;
  readonly set: boolean;
  /** Its way through the water (m/s), which leaves its wreckage astern of it. */
  readonly way?: number;
}

/** The degrees from a heading to where the wind blows, both radians clockwise from north: to starboard positive. */
export function windOff(heading: number, bearing: number): number {
  return wrap(((bearing - heading) * 180) / Math.PI);
}

const lerp = (from: Point, to: Point, share: number): [number, number, number] => [
  from[0] + (to[0] - from[0]) * share,
  from[1] + (to[1] - from[1]) * share,
  from[2] + (to[2] - from[2]) * share,
];
/** An angle in degrees put between -180 and 180. */
const wrap = (degrees: number): number => degrees - 360 * Math.round(degrees / 360);
const toward = (from: number, to: number, step: number): number =>
  Math.abs(to - from) <= step ? to : from + Math.sign(to - from) * step;
const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/** A gaff sail's grid in a pose: its sideways belly at full (-1 to port, 1 to starboard), furled to its luff, or flat
 *  between its corners (null). */
function gaffPose(sail: Extract<SailCorners, { kind: 'gaff' }>, pose: number | 'stowed' | null): Float32Array {
  const points = new Float32Array(SAIL_COLUMNS * SAIL_ROWS * 3);
  for (let row = 0; row < SAIL_ROWS; row++)
    for (let column = 0; column < SAIL_COLUMNS; column++) {
      const [along, up] = [column / (SAIL_COLUMNS - 1), row / (SAIL_ROWS - 1)];
      let point = lerp(lerp(sail.tack, sail.clew, along), lerp(sail.throat, sail.peak, along), up);
      const arch = Math.sin(Math.PI * along) * Math.sin(Math.PI * (0.1 + 0.85 * up));
      if (pose === 'stowed') {
        // Brailed in to the mast, in loose folds.
        point = lerp(lerp(sail.tack, sail.throat, up), point, 0.07 + 0.05 * Math.sin(along * Math.PI * 3));
        point[1] += 0.18 * Math.sin(along * 7 + up * 3);
      } else if (pose !== null) point[1] += pose === 0 ? GAFF_HANGING_M * arch : pose * GAFF_BELLY_M * arch;
      points.set(point, (row * SAIL_COLUMNS + column) * 3);
    }
  return points;
}

/** A staysail's grid in a pose: its belly at `pose` of full (-1 to port, 1 to starboard), rolled down its stay, or
 *  flat between its corners (null). */
function stayPose(sail: Extract<SailCorners, { kind: 'stay' }>, pose: number | 'stowed' | null): Float32Array {
  const points = new Float32Array(SAIL_COLUMNS * SAIL_ROWS * 3);
  for (let row = 0; row < SAIL_ROWS; row++)
    for (let column = 0; column < SAIL_COLUMNS; column++) {
      const [along, up] = [column / (SAIL_COLUMNS - 1), row / (SAIL_ROWS - 1)];
      let point = lerp(lerp(sail.tack, sail.clew, along), sail.head, up * STAY_TOP);
      const arch = Math.sin(Math.PI * along) * (1 - up) * 1.6 * Math.sin(Math.PI * (0.2 + 0.6 * (1 - up)));
      if (pose === 'stowed') {
        // DFO numbers its rows from the head down.
        const fromHead = SAIL_ROWS - 1 - row;
        const stay = lerp(sail.tack, sail.head, Math.min(1, up * 0.97 + along * 0.03));
        point = [stay[0] + 0.06 * Math.cos(along * 5), stay[1] + 0.12 * Math.sin(along * 6 + fromHead), stay[2] - 0.12];
      } else if (pose !== null) point[1] += pose === 0 ? STAY_HANGING_M * arch : pose * STAY_BELLY_M * arch;
      points.set(point, (row * SAIL_COLUMNS + column) * 3);
    }
  return points;
}

/** A square sail's grid in a pose: its belly at `pose` of full (-1 aback, 1 forward), gathered up to its yard, or
 *  flat between its corners (null). Columns run along it from port to starboard, rows from its foot up to its yard. */
function squarePose(sail: Extract<SailCorners, { kind: 'square' }>, pose: number | 'stowed' | null): Float32Array {
  const points = new Float32Array(SAIL_COLUMNS * SAIL_ROWS * 3);
  for (let row = 0; row < SAIL_ROWS; row++)
    for (let column = 0; column < SAIL_COLUMNS; column++) {
      const [along, up] = [column / (SAIL_COLUMNS - 1), row / (SAIL_ROWS - 1)];
      const yard = lerp(sail.head_port, sail.head_starboard, along);
      let point = lerp(lerp(sail.foot_port, sail.foot_starboard, along), yard, up);
      // Laced to its yard along its head, sheeted at its two foot corners: fullest amidst, its foot bellying too.
      const arch = Math.sin(Math.PI * along) * (0.8 * Math.sin(Math.PI * up) + 0.4 * (1 - up));
      if (pose === 'stowed') {
        point = lerp(yard, point, SQUARE_FURLED * (1 + Math.sin(along * Math.PI * 6 + up)));
        point[0] += 0.2 * (1 - up) * Math.sin(Math.PI * along);
      } else if (pose !== null) point[0] += pose === 0 ? SQUARE_HANGING_M * arch : pose * SQUARE_BELLY_M * arch;
      points.set(point, (row * SAIL_COLUMNS + column) * 3);
    }
  return points;
}

/** Where a sail's wind is drawn toward, `offDeg` from its own forward to the wind (Come Sail Away's sailWind): a gaff
 *  fullest with the wind square across it, a staysail fullest with the wind astern; a square sail, braced round, full
 *  forward with the wind astern, half full with it abeam, hanging with it ahead. */
export function sailWind(kind: SailCorners['kind'], offDeg: number): number {
  const off = Math.abs(offDeg);
  const side = offDeg > 0 ? 1 : -1;
  if (kind === 'square') return (1 + Math.cos((off * Math.PI) / 180)) / 2;
  if (off === 0) return 0;
  if (kind === 'gaff') return (side * (off <= 90 ? off : 180 - off)) / 90;
  return side * (off <= 90 ? 1 - 0.75 * (off / 90) : 0.25 * (1 - (off - 90) / 90));
}

/** Where a gaff's boom is trimmed, degrees to starboard of its centreline aft (autoTrim): square off before the wind,
 *  45 with it abeam, home by 150 off it. */
export function gaffTrim(offDeg: number): number {
  const off = Math.abs(offDeg);
  const side = offDeg > 0 ? 1 : -1;
  if (off === 0) return 0;
  return side * (off <= 90 ? 90 - 45 * (off / 90) : 45 * (1 - clamp01((off - 90) / 60)));
}

/** Where a square sail's yard is braced, degrees round its mast its leeward arm going aft: square before the wind, 45
 *  with it abeam, and held braced there closer to it, as far round as a gaff swings abeam. */
export function squareBrace(offDeg: number): number {
  const off = Math.abs(offDeg);
  const side = offDeg > 0 ? 1 : -1;
  if (off === 0) return 0;
  return side * 45 * Math.min(1, off / 90);
}

interface Rigged {
  readonly corners: SailCorners;
  /** Its grid flat between its corners, where its picture is laid; furled; and full to port, hanging and full to
   *  starboard (a staysail's halves between). */
  readonly flat: Float32Array;
  readonly stowed: Float32Array;
  readonly poses: readonly (readonly [number, Float32Array])[];
  wind: number;
  trimDeg: number;
}

/** A ship's sails: stepped by the wind, and their canvas where it stands now. */
export class SailRig {
  readonly sails: readonly Rigged[];
  /** 1 with its sails set, 0 furled, between while they are set or furled. */
  private setShare = 0;
  /** The wind's way off its bow and the clock at its last step, which its flag streams by. */
  offDeg = 0;
  time = 0;
  /** How many times it has been stepped or mended: a canvas laid from it holds until this, or its harm's, moves. */
  changes = 0;
  /** What a fight has done to its rig and hull, as drawn (`ShipHarm`). */
  harm: ShipHarm;

  constructor(corners: readonly SailCorners[]) {
    this.harm = new ShipHarm(corners);
    this.sails = corners.map((sail) => {
      const poseOf = (pose: number | 'stowed' | null) =>
        sail.kind === 'gaff'
          ? gaffPose(sail, pose)
          : sail.kind === 'square'
            ? squarePose(sail, pose)
            : stayPose(sail, pose);
      const winds = sail.kind === 'gaff' ? [-1, 0, 1] : [-1, -0.5, 0, 0.5, 1];
      const poses = winds.map((wind) => [wind, poseOf(wind)] as const);
      return { corners: sail, flat: poseOf(null), stowed: poseOf('stowed'), poses, wind: 0, trimDeg: 0 };
    });
  }

  /** One step of `seconds` at `time` (seconds, for a luff's flapping). It counts as a change only when what its
   *  canvas reads moved: the share set, a sail's trim, or a sail's wind while any canvas is set. */
  step(seconds: number, wind: SailWind, time: number): void {
    const before = this.drawn();
    this.stepped(seconds, wind, time);
    if (this.drawn() !== before) this.changes += 1;
  }

  /** What its canvas reads, as one string. */
  private drawn(): string {
    const winds = this.setShare > 0 ? this.sails.map((sail) => Math.min(1, Math.max(-1, sail.wind))) : [];
    return JSON.stringify([this.setShare, this.sails.map((sail) => sail.trimDeg), winds]);
  }

  private stepped(seconds: number, wind: SailWind, time: number): void {
    [this.offDeg, this.time] = [wind.offDeg, time];
    this.harm.step(seconds, wind.way ?? 0, time);
    this.setShare = toward(this.setShare, wind.set ? 1 : 0, seconds / SET_S);
    this.sails.forEach((sail, index) => {
      const { kind } = sail.corners;
      const gaff = kind === 'gaff';
      if (gaff) {
        const target = wind.set ? gaffTrim(wind.offDeg) : 0;
        const now = sail.trimDeg;
        // DFO's rule for the faster swing, as its trim compares the boom's angle with its mark.
        const fast = wind.set && ((now < 0 && now < -target) || (now > 0 && now > -target));
        sail.trimDeg = toward(now, target, (fast ? TRIM_FAST_DEG_S : TRIM_DEG_S) * seconds);
      } else if (kind === 'square')
        sail.trimDeg = toward(sail.trimDeg, wind.set ? squareBrace(wind.offDeg) : 0, TRIM_DEG_S * seconds);
      // The boom swung to starboard turns the sail's forward to port; a yard braced round turns its face with it.
      const off = wrap(wind.offDeg + (gaff ? sail.trimDeg : kind === 'square' ? -sail.trimDeg : 0));
      const pull = sailWind(kind, off);
      const target =
        Math.abs(off) > LUFF_DEG ? Math.sin((time + index) * 2) * 0.25 : gaff ? (pull >= 0 ? 1 : -1) : pull;
      sail.wind = toward(sail.wind, target, WIND_PER_S * seconds);
    });
  }

  /** Its rig made whole again, the fight's harm gone with the fight. */
  mend(): void {
    this.changes += 1;
    this.harm = new ShipHarm(this.sails.map((sail) => sail.corners));
  }

  /** Each sail's canvas now, its grid's points in its frame: set and furled mixed as they are being set, the poses
   *  mixed by its wind, a gaff swung about its luff and a square sail braced round its mast, about its yard's `pivots`
   *  as its model measures them (under its head's middle without one). */
  canvas(pivots: readonly (Point | null)[] = []): Float32Array[] {
    return this.sails.map((sail, index) => {
      const { poses, corners } = sail;
      const wind = Math.min(1, Math.max(-1, sail.wind));
      let upper = 1;
      while (upper < poses.length - 1 && (poses[upper]?.[0] ?? 1) < wind) upper++;
      const [low, high] = [poses[upper - 1], poses[upper]];
      if (!low || !high) throw new Error('a sail has fewer than two poses');
      const share = (wind - low[0]) / (high[0] - low[0]);
      const points = new Float32Array(sail.stowed.length);
      for (let index = 0; index < points.length; index++) {
        const set = (low[1][index] ?? 0) * (1 - share) + (high[1][index] ?? 0) * share;
        points[index] = (sail.stowed[index] ?? 0) * (1 - this.setShare) + set * this.setShare;
      }
      if (sail.trimDeg === 0) return points;
      if (corners.kind === 'gaff') swing(points, corners.tack, corners.throat, sail.trimDeg);
      else if (corners.kind === 'square') {
        // A leeward arm braced aft is the turn the other way.
        const mast = pivots[index] ?? lerp(corners.head_port, corners.head_starboard, 0.5);
        swing(points, mast, [mast[0], mast[1], mast[2] + 1], -sail.trimDeg);
      }
      return points;
    });
  }

  /** The cell of its standing canvas nearest a point of its frame, and how far its middle is from it (metres); null
   *  for a rig with no canvas standing. */
  cellNear(point: Point): { readonly sail: number; readonly cell: number; readonly distanceM: number } | null {
    let best: { sail: number; cell: number; distanceM: number } | null = null;
    this.canvas().forEach((points, sail) => {
      if (this.harm.sailLost(sail, Infinity) || this.harm.isFallen(this.harm.layout.sailMast[sail] ?? -1)) return;
      for (let row = 0; row < SAIL_ROWS - 1; row++)
        for (let column = 0; column < SAIL_COLUMNS - 1; column++) {
          const corner = (row * SAIL_COLUMNS + column) * 3;
          const middle = [0, 1, 2].map(
            (axis) =>
              ((points[corner + axis] ?? 0) +
                (points[corner + 3 + axis] ?? 0) +
                (points[corner + SAIL_COLUMNS * 3 + axis] ?? 0) +
                (points[corner + SAIL_COLUMNS * 3 + 3 + axis] ?? 0)) /
              4,
          );
          const distanceM = Math.hypot(
            (middle[0] ?? 0) - point[0],
            (middle[1] ?? 0) - point[1],
            (middle[2] ?? 0) - point[2],
          );
          if (!best || distanceM < best.distanceM) best = { sail, cell: row * (SAIL_COLUMNS - 1) + column, distanceM };
        }
    });
    return best;
  }
}

/** Turns points about the line from `foot` to `head` (its luff), `degrees` taking what lies aft of it to starboard. */
function swing(points: Float32Array, foot: Point, head: Point, degrees: number): void {
  const axis = [head[0] - foot[0], head[1] - foot[1], head[2] - foot[2]];
  const length = Math.hypot(axis[0] ?? 0, axis[1] ?? 0, axis[2] ?? 0);
  const [axisX, axisY, axisZ] = axis.map((value) => value / length) as [number, number, number];
  // About an axis pointing up, a positive turn (right-handed) takes aft (-x) to port (-y): starboard is the other way.
  const turn = (-degrees * Math.PI) / 180;
  const [cos, sin] = [Math.cos(turn), Math.sin(turn)];
  for (let point = 0; point < points.length; point += 3) {
    const [x, y, z] = [
      (points[point] ?? 0) - foot[0],
      (points[point + 1] ?? 0) - foot[1],
      (points[point + 2] ?? 0) - foot[2],
    ];
    const dot = axisX * x + axisY * y + axisZ * z;
    const [crossX, crossY, crossZ] = [axisY * z - axisZ * y, axisZ * x - axisX * z, axisX * y - axisY * x];
    points[point] = foot[0] + x * cos + crossX * sin + axisX * dot * (1 - cos);
    points[point + 1] = foot[1] + y * cos + crossY * sin + axisY * dot * (1 - cos);
    points[point + 2] = foot[2] + z * cos + crossZ * sin + axisZ * dot * (1 - cos);
  }
}
