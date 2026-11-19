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
  return vestigePicture(drop.rarity);
}

/** A colour written `#rrggbb` as red, green and blue from 0 to 1. */
function rgbOf(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

/** The way across the eye's view at `base`, along the ground. */
function acrossFrom(eye: Point, base: Point): [number, number] {
  const [east, south] = [base[0] - eye[0], base[1] - eye[1]];
  const length = Math.hypot(east, south) || 1;
  return [-south / length, east / length];
}

/** A picture standing on `base`, turned to the eye, each pixel two triangles, as marks' vertices into `out`. */
export function markPicture(out: number[], picture: PixelPicture, base: Point, eye: Point): void {
  const [right, ahead] = acrossFrom(eye, base);
  const colours = picture.colours.map(rgbOf);
  const width = picture.rows[0]?.length ?? 0;
  picture.rows.forEach((row, line) =>
    [...row].forEach((letter, column) => {
      const colour = colours['abcdef'.indexOf(letter)];
      if (!colour) return;
      const corner = (side: number, up: number) => {
        const off = (column + side - width / 2) * PIXEL_M;
        const lift = (picture.rows.length - line - 1 + up) * PIXEL_M + LIFT_M;
        out.push(base[0] + right * off, base[1] + ahead * off, base[2] + lift, ...colour, 1);
      };
      for (const [side, up] of [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 0],
        [1, 1],
        [0, 1],
      ] as const)
        corner(side, up);
    }),
  );
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

/** A line rising `height` from `root`, turned to the eye, its colour times `strength`, as marks' vertices added to what
 *  stands behind it. */
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
  const vertex = (side: number, share: number) => {
    const light = side === 0 ? lineLight(share, seconds) * strength : 0;
    const shown = colour.map((part) => part * light);
    out.push(root[0] + right * side * half, root[1] + ahead * side * half, root[2] + share * height, ...shown, ADDED);
  };
  for (let step = 0; step < LINE_STEPS; step += 1) {
    const [low, high] = [step / LINE_STEPS, (step + 1) / LINE_STEPS];
    for (const side of [-1, 1]) {
      for (const [across, share] of [
        [side, low],
        [0, low],
        [0, high],
        [side, low],
        [0, high],
        [side, high],
      ] as const)
        vertex(across, share);
    }
  }
}

/** A drop's key among the others: what it is and its number. */
const keyOf = (drop: GearDrop) => `${drop.kind}-${drop.id}`;

/**
 * The drops lying for the player as they are drawn: each flying from where the room threw it the moment it is first
 * told of (or resting already, told of late), standing and lit once it rests. Each frame answers the marks and the
 * rarities of the Vestiges that came to rest since the last, for a Rare's or finer's chime.
 */
export class DropsShown {
  /** When each drop's flight began, on the page's clock. */
  private readonly began = new Map<string, number>();
  private readonly rested = new Set<string>();

  frame(drops: readonly GearDrop[], seconds: number, eye: Point): { marks: number[]; rested: number[] } {
    const marks: number[] = [];
    const rested: number[] = [];
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
        if (drop.kind === DROPPED.vestige) rested.push(drop.rarity);
      }
      const rise = Math.min(1, (since - FLIGHT_S) / RISE_S);
      const ammo = drop.kind !== DROPPED.vestige;
      const found = RARITIES[drop.rarity] ?? RARITIES[0];
      const colour = ammo ? WHITE : rgbOf(found.colour);
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
    return { marks, rested };
  }
}
