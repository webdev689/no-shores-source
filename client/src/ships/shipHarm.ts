// What a fight leaves on a ship as it is drawn: the holes shot in its hull and its canvas, the sails torn from its
// yards, the masts gone over its side, its colours struck, and its going down. Only the look of it: the rules say
// what happened (the fight's events, or its hurts in its view until an event says more), and this keeps it for the
// rest of the fight, each part's motion worked out from the moment it began.
import { SAIL_CELLS, SAIL_COLUMNS, SAIL_ROWS, type SailCorners } from './sails.ts';

type Point = readonly [number, number, number];

/** With no canvas left, a third of each sail's cells are shot through. */
const MOST_HOLED_SHARE = 1 / 3;
/** A sail's heads stand this close along the ship on one mast, metres (as its yards' tags say). */
const MAST_M = 1.5;
/** A mast falls over its side in this long, seconds; a torn sail takes this long to reach the water. */
export const FALL_S = 3;
/** A fallen mast or a torn sail floats this long once in the water, seconds, then is gone under. */
export const FLOAT_S = 40;
/** Its colours come down its mast in this long, seconds. */
export const STRIKE_S = 4;
/** It goes down in this long (its `Sinking` to its `Gone`), seconds: the foam's and the flag's timing. */
export const SINK_S = 20;
const GRAVITY = 9.81;

/** Where its masts stand along it (x in its frame, fore to aft) and which mast each sail is on: a square sail's by its
 *  head, a gaff's by its luff, a staysail's the mast its head is set to. */
export interface MastLayout {
  readonly masts: readonly number[];
  readonly sailMast: readonly number[];
}

export function mastsOf(corners: readonly SailCorners[]): MastLayout {
  const standing = corners.flatMap((sail) =>
    sail.kind === 'square'
      ? [(sail.head_port[0] + sail.head_starboard[0]) / 2]
      : sail.kind === 'gaff'
        ? [sail.tack[0]]
        : [],
  );
  const masts: number[] = [];
  for (const x of standing) if (!masts.some((mast) => Math.abs(mast - x) < MAST_M)) masts.push(x);
  masts.sort((one, other) => other - one);
  if (masts.length === 0) masts.push(0);
  const nearest = (x: number) =>
    masts.reduce((best, mast, index) => (Math.abs(mast - x) < Math.abs((masts[best] ?? 0) - x) ? index : best), 0);
  const sailMast = corners.map((sail) =>
    nearest(
      sail.kind === 'square'
        ? (sail.head_port[0] + sail.head_starboard[0]) / 2
        : sail.kind === 'gaff'
          ? sail.tack[0]
          : sail.head[0],
    ),
  );
  return { masts, sailMast };
}

/** A part gone from it: when (seconds of the page), to which side (1 starboard, -1 port), and how far astern of its
 *  it has drifted since it reached the water (metres). */
interface Gone {
  readonly at: number;
  readonly side: 1 | -1;
  astern: number;
}

/** How a gone part lies `now`: its share of the way down (0 in place to 1 in the water), how far astern it has
 *  drifted (metres), how far it has sunk under (metres) and whether it still shows. */
export interface Fallen {
  readonly down: number;
  readonly astern: number;
  readonly sunk: number;
  readonly shows: boolean;
  readonly side: 1 | -1;
}

/** A hole in its hull: where in its frame, and how large (metres). */
export interface Scar {
  readonly at: Point;
  readonly size: number;
}

export class ShipHarm {
  readonly layout: MastLayout;
  /** Each sail's holed cells, by their number (row × columns + column). */
  readonly holes: Set<number>[];
  readonly scars: Scar[] = [];
  private readonly lost = new Map<number, Gone>();
  private readonly fallen = new Map<number, Gone>();
  private struckAt: number | null = null;
  private sinkingAt: number | null = null;
  private seed = 7;
  /** How many times it has changed: a canvas laid from it holds until this moves. */
  changes = 0;

  constructor(corners: readonly SailCorners[]) {
    this.layout = mastsOf(corners);
    this.holes = corners.map(() => new Set<number>());
  }

  /** A draw in [0, 1): which cell a hole spreads to, not anything the fight decides. */
  private draw(): number {
    this.seed = (Math.imul(this.seed, 1_664_525) + 1_013_904_223) >>> 0;
    return this.seed / 4_294_967_296;
  }

  /** A ball through its hull at `at` (its frame): a ragged hole stays there. */
  scar(spot: Point): void {
    this.changes += 1;
    this.scars.push({ at: spot, size: 0.4 + this.draw() * 0.3 });
  }

  /** A ball through a sail's cell: the canvas there is gone. */
  hole(sail: number, cell: number): void {
    this.changes += 1;
    if (!this.lost.has(sail) && cell >= 0 && cell < SAIL_CELLS) this.holes[sail]?.add(cell);
  }

  /** Its canvas's harm, `share` of it gone (0 to 1): each sail standing is holed to match, new holes beside old. */
  wear(share: number): void {
    this.changes += 1;
    const wanted = Math.round(Math.min(1, Math.max(0, share)) * SAIL_CELLS * MOST_HOLED_SHARE);
    this.holes.forEach((holes, sail) => {
      if (this.lost.has(sail)) return;
      while (holes.size < wanted) {
        const from = [...holes][Math.floor(this.draw() * holes.size)];
        let cell = Math.floor(this.draw() * SAIL_CELLS);
        if (from !== undefined) {
          const [row, column] = [Math.floor(from / (SAIL_COLUMNS - 1)), from % (SAIL_COLUMNS - 1)];
          const step = [
            [0, 1],
            [0, -1],
            [1, 0],
            [-1, 0],
          ][Math.floor(this.draw() * 4)] ?? [0, 1];
          const [next, across] = [row + (step[0] ?? 0), column + (step[1] ?? 0)];
          if (next >= 0 && next < SAIL_ROWS - 1 && across >= 0 && across < SAIL_COLUMNS - 1)
            cell = next * (SAIL_COLUMNS - 1) + across;
        }
        holes.add(cell);
      }
    });
  }

  /** A sail torn from it at `now`: it falls to leeward of it (`side`). */
  loseSail(sail: number, now: number, side: 1 | -1): void {
    this.changes += 1;
    if (!this.lost.has(sail) && sail >= 0 && sail < this.holes.length)
      this.lost.set(sail, { at: now, side, astern: 0 });
  }

  /** A mast gone over its `side` at `now`, every sail on it with it. */
  fellMast(mast: number, now: number, side: 1 | -1): void {
    this.changes += 1;
    if (this.fallen.has(mast) || mast < 0 || mast >= this.layout.masts.length) return;
    this.fallen.set(mast, { at: now, side, astern: 0 });
  }

  strike(now: number): void {
    this.changes += 1;
    this.struckAt ??= now;
  }

  sink(now: number): void {
    this.changes += 1;
    this.sinkingAt ??= now;
  }

  get sinking(): boolean {
    return this.sinkingAt !== null;
  }

  /** Whether a mast has gone over its side. */
  isFallen(mast: number): boolean {
    return this.fallen.has(mast);
  }

  /** Its gone parts drift astern of it as it sails on at `way` (m/s): a part in the water stays where it fell. With
   *  none gone, nothing it draws moves. */
  step(seconds: number, way: number, now: number): void {
    if (this.lost.size + this.fallen.size === 0) return;
    this.changes += 1;
    for (const gone of [...this.lost.values(), ...this.fallen.values()])
      if (now - gone.at >= FALL_S) gone.astern += Math.max(0, way) * seconds;
  }

  private lies(gone: Gone | undefined, now: number): Fallen | null {
    if (!gone) return null;
    const age = Math.max(0, now - gone.at);
    // It goes over slowly, then fast, as a falling thing does.
    const down = Math.min(1, (age / FALL_S) ** 2);
    const afloat = age - FALL_S;
    const sunk = afloat > 0 ? Math.min(1, afloat / FLOAT_S) * 1.5 : 0;
    return { down, astern: gone.astern, sunk, shows: afloat < FLOAT_S, side: gone.side };
  }

  /** How a sail torn from it lies `now`; null while it stands. A sail on a fallen mast goes with the mast. */
  sailLost(sail: number, now: number): Fallen | null {
    return this.lies(this.lost.get(sail), now);
  }

  /** How a fallen mast lies `now`; null while it stands. */
  mastFallen(mast: number, now: number): Fallen | null {
    return this.lies(this.fallen.get(mast), now);
  }

  /** How far its colours have come down `now`: 0 flying, 1 struck. */
  struck(now: number): number {
    return this.struckAt === null ? 0 : Math.min(1, Math.max(0, now - this.struckAt) / STRIKE_S);
  }

  /** How far it has gone down `now`, 0 afloat to 1 gone under. */
  sunkShare(now: number): number {
    return this.sinkingAt === null ? 0 : Math.min(1, Math.max(0, now - this.sinkingAt) / SINK_S);
  }
}

/** Where a falling part's point goes as it lies (`Fallen`), in its frame: turned over its side about the line along
 *  it at `footZ` (a mast's foot; a torn sail drops instead, by `dropOf`), drifted astern and sunk. */
export function fallenPoint(
  point: Point,
  lies: Fallen,
  turn: { readonly footZ: number; readonly most: number },
): Point {
  const angle = lies.down * turn.most * lies.side;
  const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
  const [across, up] = [point[1], point[2] - turn.footZ];
  return [point[0] - lies.astern, across * cos + up * sin, turn.footZ - across * sin + up * cos - lies.sunk];
}

/** How far over a mast `heightM` tall from its foot `footZ` over the water goes before its head is in the water,
 *  radians. */
export function fallAngle(footZ: number, heightM: number): number {
  return Math.acos(Math.min(1, Math.max(-1, -footZ / Math.max(heightM, 1e-6))));
}

/** How far a torn sail's point has dropped `seconds` after it tore, metres: falling, down to the water's face. */
export function dropOf(z: number, seconds: number): number {
  return Math.min(z - 0.05, (GRAVITY * seconds * seconds) / 2);
}
