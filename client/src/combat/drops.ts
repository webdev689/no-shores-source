// The drops lying for the player, seen in the world after DFO's spoils: each thrown out of the fallen foe on an arc
// and bouncing twice to rest, then standing upright as its own picture turned to the eye, with a thin line of its
// rarity's colour rising out of its top, taller the rarer it is, a glint climbing it, a Legendary's and an Atheric's
// pulsing. The line rises as the drop comes to rest. Each is drawn as the marks are, the line as light added to what
// stands behind it.

import { DROPPED, type GearDrop } from '../network/gearMessages.ts';
import { RARITIES } from '../player/gear.ts';
import { AMMO_BOX, AMMO_CRATE, type PixelPicture, vestigePicture } from './dropPictures.ts';

type Point = readonly [number, number, number];

/** How long a drop flies before it rests, seconds: the room's 36 ticks. */
export const FLIGHT_S = 0.6;
const TICK_S = 1 / 60;
/** How long its line takes to rise once it rests, seconds. */
export const RISE_S = 0.4;
/** Each bounce gives back this share of the speed before it, so lasts this share of the arc before and covers its
 *  square of the ground. The flight is its first arc and two bounces. */
const BOUNCE = 0.5;
const ARCS = 3;
/** A drop leaves the body this high, and its first arc rises this much higher, metres. */
const LEAVES_M = 0.8;
const RISES_M = 0.5;
/** Each arc's share of the flight's time and of its ground. */
const TIMES = Array.from({ length: ARCS }, (unused, arc) => BOUNCE ** arc);
const GROUNDS = Array.from({ length: ARCS }, (unused, arc) => BOUNCE ** (2 * arc));
const TIME_WHOLE = TIMES.reduce((sum, each) => sum + each, 0);
const GROUND_WHOLE = GROUNDS.reduce((sum, each) => sum + each, 0);
/** The pull that brings the first arc down on time from its height: its rise and fall solved for its length. */
const FIRST_S = FLIGHT_S / TIME_WHOLE;
const PULL = ((Math.sqrt(2 * RISES_M) + Math.sqrt(2 * (RISES_M + LEAVES_M))) / FIRST_S) ** 2;

/** How tall a line stands by rarity, metres, and an Ammo box's or crate's, in white. */
export const LINE_M = [0.7, 1, 1.4, 1.9, 2.5] as const;
const AMMO_LINE_M = LINE_M[0];
const WHITE = [1, 1, 1] as const;
/** A picture's pixel on the ground, metres, and how far over the ground it stands. */
export const PIXEL_M = 0.035;
const LIFT_M = 0.01;
/** A line's width, and the least it keeps of the eye's view, radians, so one across the ground still shows; how many
 *  steps it is drawn in; its glint's and its pulse's rates, cycles a second. */
const LINE_WIDE_M = 0.07;
const LINE_LEAST = 0.0022;
const LINE_STEPS = 12;
const CLIMB_HZ = 1;
const PULSE_HZ = 1;
/** A line's opacity, below none: the marks' sign for light added to what stands behind it. */
const ADDED = -1;

/** Where a drop thrown from `from` to rest at `rest` is `seconds` into its flight, and whether it rests. */
export function flightAt(from: Point, rest: Point, seconds: number): { readonly at: Point; readonly resting: boolean } {
  if (seconds >= FLIGHT_S) return { at: rest, resting: true };
  let [start, ground] = [0, 0];
  for (let arc = 0; arc < ARCS; arc += 1) {
    const length = (FIRST_S * (TIMES[arc] ?? 0)) / (TIMES[0] ?? 1);
    if (seconds < start + length || arc === ARCS - 1) {
      const share = Math.min(1, Math.max(0, (seconds - start) / length));
      const along = (ground + share * (GROUNDS[arc] ?? 0)) / GROUND_WHOLE;
      const floor = from[2] + (rest[2] - from[2]) * along;
      const time = share * length;
      // The first arc leaves from the body's height; each bounce leaves the ground with the speed that lands it.
      const leaves = arc === 0 ? Math.sqrt(2 * PULL * RISES_M) : (PULL * length) / 2;
      const height = (arc === 0 ? LEAVES_M : 0) + leaves * time - (PULL * time * time) / 2;
      const across = (axis: 0 | 1) => from[axis] + (rest[axis] - from[axis]) * along;
      return { at: [across(0), across(1), floor + Math.max(0, height)], resting: false };
    }
    start += length;
    ground += GROUNDS[arc] ?? 0;
  }
  return { at: rest, resting: true };
}

/** A drop's picture: a Vestige's in its rarity's colours, an Ammo box's, a crate's. */
export function pictureOf(drop: Pick<GearDrop, 'kind' | 'rarity'>): PixelPicture {
  if (drop.kind === DROPPED.ammoBox) return AMMO_BOX;
  if (drop.kind === DROPPED.crate) return AMMO_CRATE;
  return VESTIGES[drop.rarity] ?? VESTIGES[0] ?? vestigePicture(drop.rarity);
}

/** Each rarity's Vestige, made once. */
const VESTIGES: readonly PixelPicture[] = RARITIES.map((unused, rarity) => vestigePicture(rarity));

/** A colour written `#rrggbb` as red, green and blue from 0 to 1. */
function rgbOf(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

/** Each rarity's line colour, read once. */
const LINE_COLOURS = RARITIES.map((rarity) => rgbOf(rarity.colour));

/** The numbers of a run of one colour along a picture's rows (as many rows as repeat it): its left and right (metres
 *  off its middle), its foot and its top (metres over the ground), and its red, green and blue. */
const RUN = 7;
const runsKept = new WeakMap<PixelPicture, readonly number[]>();

/** A picture's runs, worked out the first time it is laid. */
function runsOf(picture: PixelPicture): readonly number[] {
  const kept = runsKept.get(picture);
  if (kept) return kept;
  const colours = picture.colours.map(rgbOf);
  const width = picture.rows[0]?.length ?? 0;
  const runs: number[] = [];
  // A run open from the row above, by its columns and letter: where its foot is in `runs`.
  let open = new Map<string, number>();
  picture.rows.forEach((row, line) => {
    const foot = (picture.rows.length - line - 1) * PIXEL_M + LIFT_M;
    const next = new Map<string, number>();
    for (let column = 0; column < row.length;) {
      const letter = row[column] ?? '';
      let end = column + 1;
      while (end < row.length && row[end] === letter) end++;
      const colour = colours['abcdef'.indexOf(letter)];
      const key = `${column}:${end}:${letter}`;
      const above = open.get(key);
      if (colour && above !== undefined) {
        // The same run as the row above: that one reaches down to here.
        runs[above] = foot;
        next.set(key, above);
      } else if (colour) {
        next.set(key, runs.length + 2);
        runs.push((column - width / 2) * PIXEL_M, (end - width / 2) * PIXEL_M, foot, foot + PIXEL_M, ...colour);
      }
      column = end;
    }
    open = next;
  });
  runsKept.set(picture, runs);
  return runs;
}

/** Writes a mark vertex into `out` at `index`, by index rather than pushed (a frame lays tens of thousands), and answers
 *  where the next goes. */
function put(
  out: number[],
  index: number,
  east: number,
  south: number,
  up: number,
  red: number,
  green: number,
  blue: number,
  opacity: number,
): number {
  out[index] = east;
  out[index + 1] = south;
  out[index + 2] = up;
  out[index + 3] = red;
  out[index + 4] = green;
  out[index + 5] = blue;
  out[index + 6] = opacity;
  return index + 7;
}

/** The way across the eye's view at `base`, along the ground. */
function acrossFrom(eye: Point, base: Point): [number, number] {
  const [east, south] = [base[0] - eye[0], base[1] - eye[1]];
  const length = Math.hypot(east, south) || 1;
  return [-south / length, east / length];
}

/** A picture standing on `base`, turned to the eye, each run of one colour along a row two triangles, as marks'
 *  vertices into `out`. */
export function markPicture(out: number[], picture: PixelPicture, base: Point, eye: Point): void {
  const [right, ahead] = acrossFrom(eye, base);
  const runs = runsOf(picture);
  const [x, y, z] = base;
  let next = out.length;
  for (let start = 0; start < runs.length; start += RUN) {
    const left = runs[start] ?? 0;
    const end = runs[start + 1] ?? 0;
    const foot = z + (runs[start + 2] ?? 0);
    const top = z + (runs[start + 3] ?? 0);
    const red = runs[start + 4] ?? 0;
    const green = runs[start + 5] ?? 0;
    const blue = runs[start + 6] ?? 0;
    const leftX = x + right * left;
    const leftY = y + ahead * left;
    const endX = x + right * end;
    const endY = y + ahead * end;
    next = put(out, next, leftX, leftY, foot, red, green, blue, 1);
    next = put(out, next, endX, endY, foot, red, green, blue, 1);
    next = put(out, next, endX, endY, top, red, green, blue, 1);
    next = put(out, next, leftX, leftY, foot, red, green, blue, 1);
    next = put(out, next, endX, endY, top, red, green, blue, 1);
    next = put(out, next, leftX, leftY, top, red, green, blue, 1);
  }
}

/** How bright a line is `share` of the way up it at `seconds`: brightest where it leaves the picture, thinning to none
 *  at its tip, a glint climbing it. */
export function lineLight(share: number, seconds: number): number {
  const tail = (1 - share) ** 1.6;
  const root = Math.exp(-share * 14);
  const climb = (((share - seconds * CLIMB_HZ) % 1) + 1) % 1;
  const glint = Math.exp(-(((climb - 0.5) * 9) ** 2));
  return tail * (0.75 + 0.55 * glint) + 0.8 * root;
}

/** Each step's light up a line, worked out once a line. */
const lights = new Float64Array(LINE_STEPS + 1);

/** A line rising `height` from `root`, turned to the eye, its colour times `strength`, as marks' vertices added to what
 *  stands behind it: its middle lit, its sides dark. */
export function markLine(
  out: number[],
  root: Point,
  height: number,
  colour: readonly number[],
  strength: number,
  seconds: number,
  eye: Point,
): void {
  const [right, ahead] = acrossFrom(eye, root);
  const half = Math.max(LINE_WIDE_M, Math.hypot(root[0] - eye[0], root[1] - eye[1], root[2] - eye[2]) * LINE_LEAST) / 2;
  for (let step = 0; step <= LINE_STEPS; step += 1) lights[step] = lineLight(step / LINE_STEPS, seconds) * strength;
  const [red, green, blue] = [colour[0] ?? 0, colour[1] ?? 0, colour[2] ?? 0];
  const [x, y, z] = root;
  let next = out.length;
  for (let step = 0; step < LINE_STEPS; step += 1) {
    const low = z + (step / LINE_STEPS) * height;
    const high = z + ((step + 1) / LINE_STEPS) * height;
    const lowLight = lights[step] ?? 0;
    const highLight = lights[step + 1] ?? 0;
    for (let side = -1; side <= 1; side += 2) {
      const sideX = x + right * side * half;
      const sideY = y + ahead * side * half;
      next = put(out, next, sideX, sideY, low, 0, 0, 0, ADDED);
      next = put(out, next, x, y, low, red * lowLight, green * lowLight, blue * lowLight, ADDED);
      next = put(out, next, x, y, high, red * highLight, green * highLight, blue * highLight, ADDED);
      next = put(out, next, sideX, sideY, low, 0, 0, 0, ADDED);
      next = put(out, next, x, y, high, red * highLight, green * highLight, blue * highLight, ADDED);
      next = put(out, next, sideX, sideY, high, 0, 0, 0, ADDED);
    }
  }
}

/** A drop's key among the others: what it is and its number. */
const keyOf = (drop: GearDrop) => `${drop.kind}-${drop.id}`;

/**
 * The drops lying for the player as they are drawn: each flying from where the room threw it the moment it is first
 * told of (or resting already, told of late), standing and lit once it rests. Each frame answers the marks (laid into
 * `out` when given), the rarities of the Vestiges that came to rest since the last, for a Rare's or finer's chime, and
 * where every drop that came to rest since the last lies.
 */
export class DropsShown {
  /** When each drop's flight began, on the page's clock. */
  private readonly began = new Map<string, number>();
  private readonly rested = new Set<string>();

  frame(
    drops: readonly GearDrop[],
    seconds: number,
    eye: Point,
    out: number[] = [],
  ): { marks: number[]; rested: number[]; landed: Point[] } {
    const marks = out;
    const rested: number[] = [];
    const landed: Point[] = [];
    const lying = new Set<string>();
    for (const drop of drops) {
      const key = keyOf(drop);
      lying.add(key);
      if (!this.began.has(key)) {
        // Told of at rest, it is as though it rested long ago, and chimes no more.
        const flown = drop.flying > 0 ? FLIGHT_S - drop.flying * TICK_S : FLIGHT_S + RISE_S;
        this.began.set(key, seconds - Math.max(0, flown));
        if (drop.flying === 0) this.rested.add(key);
      }
      const since = seconds - (this.began.get(key) ?? seconds);
      const { at: place, resting } = flightAt(drop.from, drop.at, since);
      const picture = pictureOf(drop);
      markPicture(marks, picture, place, eye);
      if (!resting) continue;
      if (!this.rested.has(key)) {
        this.rested.add(key);
        landed.push(drop.at);
        if (drop.kind === DROPPED.vestige) rested.push(drop.rarity);
      }
      const rise = Math.min(1, (since - FLIGHT_S) / RISE_S);
      const ammo = drop.kind !== DROPPED.vestige;
      const colour = ammo ? WHITE : (LINE_COLOURS[drop.rarity] ?? WHITE);
      const tall = (ammo ? AMMO_LINE_M : (LINE_M[drop.rarity] ?? AMMO_LINE_M)) * rise;
      const pulse = !ammo && drop.rarity >= 3 ? 1 + 0.35 * Math.sin(seconds * 2 * Math.PI * PULSE_HZ) : 1;
      const crown: Point = [place[0], place[1], place[2] + picture.rows.length * PIXEL_M + LIFT_M];
      markLine(marks, crown, tall, colour, rise * pulse, seconds, eye);
    }
    for (const key of this.began.keys())
      if (!lying.has(key)) {
        this.began.delete(key);
        this.rested.delete(key);
      }
    return { marks, rested, landed };
  }
}
