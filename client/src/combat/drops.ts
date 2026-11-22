// The drops lying for the player, seen in the world after DFO's spoils: each thrown out of the fallen foe on an arc
// and bouncing twice to rest, then standing upright as its own picture turned to the eye, with a thin line of its
// rarity's colour rising out of its top, taller the rarer it is, a glint climbing it, a Legendary's and an Atheric's
// pulsing. The line rises as the drop comes to rest. Each is drawn as the marks are, the line as light added to what
// stands behind it. An Ammo box stepped onto with the ammunition full, which the room leaves lying, is told of.

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

/** The numbers of a rectangle of one colour: its left and right (metres off the picture's middle), its foot and its
 *  top (metres over the ground), its red, green and blue, and its layer. */
const RUN = 8;
/** How much nearer the eye each layer of a picture stands than the one under it, metres: far more than the depth
 *  buffer tells apart wherever a picture is seen, far less than the eye does. */
const LAYER_M = 0.002;
/** Each picture's rectangles, laid flat and in layers, worked out the first time it is laid so. */
const runsKept = [new WeakMap<PixelPicture, readonly number[]>(), new WeakMap<PixelPicture, readonly number[]>()];

/**
 * A picture's rectangles of one colour, each as far across and down as it may run. Laid in layers, its colours go on
 * in turn, the one spread widest first, each running under the colours laid after it, so a diamond inside a diamond
 * is a rectangle a step rather than a run a row. Laid flat, for a picture seen through, where one layer would show
 * through another, no rectangle covers another.
 */
function runsOf(picture: PixelPicture, layered: boolean): readonly number[] {
  const kept = runsKept[Number(layered)]?.get(picture);
  if (kept) return kept;
  const { rows } = picture;
  const [width, height] = [rows[0]?.length ?? 0, rows.length];
  const colours = picture.colours.map(rgbOf);
  const colourOf = (letter: string) => colours['abcdef'.indexOf(letter)];
  // Each drawn letter's spread: the area of the box round its cells.
  const boxes = new Map<string, [number, number, number, number]>();
  rows.forEach((row, line) =>
    [...row].forEach((letter, column) => {
      if (!colourOf(letter)) return;
      const [left, top, right, bottom] = boxes.get(letter) ?? [column, line, column, line];
      boxes.set(letter, [Math.min(left, column), top, Math.max(right, column), Math.max(bottom, line)]);
    }),
  );
  const spread = (letter: string) => {
    const [left, top, right, bottom] = boxes.get(letter) ?? [0, 0, -1, -1];
    return (right - left + 1) * (bottom - top + 1);
  };
  const letters = [...boxes.keys()].sort((one, other) => spread(other) - spread(one));
  const layerAt = (column: number, line: number) => letters.indexOf(rows[line]?.charAt(column) ?? '');
  const runs: number[] = [];
  letters.forEach((letter, layer) => {
    const [red, green, blue] = colourOf(letter) ?? [0, 0, 0];
    const laid = new Set<number>();
    const owed = (column: number, line: number) =>
      rows[line]?.charAt(column) === letter && !laid.has(line * width + column);
    const under = layered ? (column: number, line: number) => layerAt(column, line) >= layer : owed;
    const along = (line: number, left: number, right: number, test: typeof owed) =>
      Array.from({ length: right - left + 1 }, (unused, step) => test(left + step, line));
    for (let line = 0; line < height; line += 1)
      for (let column = 0; column < width; column += 1) {
        if (!owed(column, line)) continue;
        // Across as far as it may run and back to its last cell owed; then down the same.
        let [right, bottom] = [column, line];
        while (under(right + 1, line)) right += 1;
        while (!owed(right, line)) right -= 1;
        while (along(bottom + 1, column, right, under).every(Boolean)) bottom += 1;
        while (!along(bottom, column, right, owed).some(Boolean)) bottom -= 1;
        for (let row = line; row <= bottom; row += 1)
          for (let cell = column; cell <= right; cell += 1) laid.add(row * width + cell);
        const [foot, top] = [(height - bottom - 1) * PIXEL_M + LIFT_M, (height - line) * PIXEL_M + LIFT_M];
        runs.push(
          (column - width / 2) * PIXEL_M,
          (right + 1 - width / 2) * PIXEL_M,
          foot,
          top,
          red,
          green,
          blue,
          layer,
        );
      }
  });
  runsKept[Number(layered)]?.set(picture, runs);
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

/** A picture standing on `base`, turned to the eye, each rectangle of one colour two triangles, as marks' vertices
 *  into `out`: its pixels `scale` times a drop's, at `opacity` (below 1 seen through, and laid flat). */
export function markPicture(
  out: number[],
  picture: PixelPicture,
  base: Point,
  eye: Point,
  scale = 1,
  opacity = 1,
): void {
  const [right, ahead] = acrossFrom(eye, base);
  const runs = runsOf(picture, opacity >= 1);
  // Each layer stands a little nearer the eye than the one under it, so it covers it.
  const far = Math.hypot(eye[0] - base[0], eye[1] - base[1], eye[2] - base[2]) || 1;
  const [nearX, nearY, nearZ] = [0, 1, 2].map((axis) => (((eye[axis] ?? 0) - (base[axis] ?? 0)) / far) * LAYER_M);
  let next = out.length;
  for (let start = 0; start < runs.length; start += RUN) {
    const layer = runs[start + 7] ?? 0;
    const x = base[0] + (nearX ?? 0) * layer;
    const y = base[1] + (nearY ?? 0) * layer;
    const z = base[2] + (nearZ ?? 0) * layer;
    const left = (runs[start] ?? 0) * scale;
    const end = (runs[start + 1] ?? 0) * scale;
    const foot = z + (runs[start + 2] ?? 0) * scale;
    const top = z + (runs[start + 3] ?? 0) * scale;
    const red = runs[start + 4] ?? 0;
    const green = runs[start + 5] ?? 0;
    const blue = runs[start + 6] ?? 0;
    const leftX = x + right * left;
    const leftY = y + ahead * left;
    const endX = x + right * end;
    const endY = y + ahead * end;
    next = put(out, next, leftX, leftY, foot, red, green, blue, opacity);
    next = put(out, next, endX, endY, foot, red, green, blue, opacity);
    next = put(out, next, endX, endY, top, red, green, blue, opacity);
    next = put(out, next, leftX, leftY, foot, red, green, blue, opacity);
    next = put(out, next, endX, endY, top, red, green, blue, opacity);
    next = put(out, next, leftX, leftY, top, red, green, blue, opacity);
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

/** The line of light a drop at rest stands under, in its rarity's colour and height, rising from `over` metres above
 *  `place`: for a piece of gear the world lays down itself, drawn as it is. */
export function markDropLine(
  out: number[],
  { place, rarity, over }: { readonly place: Point; readonly rarity: number; readonly over: number },
  seconds: number,
  eye: Point,
): void {
  const crown: Point = [place[0], place[1], place[2] + over + LIFT_M];
  markLine(out, crown, LINE_M[rarity] ?? AMMO_LINE_M, LINE_COLOURS[rarity] ?? WHITE, 1, seconds, eye);
}

/** How near the player's feet come to a drop to take it, across and up, metres (crates/room/src/drops.rs
 *  PICK_UP_REACH). */
const REACH_M = 1.5;
const REACH_UP_M = 2;

/** Whether feet at `feet` are near enough a drop resting at `rest` to take it. */
export const inReach = (feet: Point, rest: Point): boolean =>
  Math.hypot(feet[0] - rest[0], feet[1] - rest[1]) <= REACH_M && Math.abs(feet[2] - rest[2]) <= REACH_UP_M;

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
  /** The Ammo boxes at rest the player stood on at the last `ammoFull`, their ammunition full. */
  private refused = new Set<string>();

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

  /** Whether the player, their feet at `feet` and their ammunition `full`, has just stepped onto an Ammo box at rest,
   *  which the room leaves lying for that: once each time they step onto one, never while they stand there. Asked
   *  after `frame`, which knows which drops rest. */
  ammoFull(drops: readonly GearDrop[], feet: Point, full: boolean): boolean {
    const was = this.refused;
    const under = (drop: GearDrop) => inReach(feet, drop.at);
    const boxes = drops.filter((drop) => drop.kind === DROPPED.ammoBox && this.rested.has(keyOf(drop)) && under(drop));
    this.refused = new Set(full ? boxes.map(keyOf) : []);
    return [...this.refused].some((key) => !was.has(key));
  }
}
