// The drops lying for the player, seen in the world as project-final throws its loot: each popped up out of the fallen
// foe, or poured higher out of a chest as its lid opens as project-final's cache pours, bouncing until it settles where
// the room put it, then rising to hover, bobbing and turning. A Vestige is its crystal, at twice its frame's size,
// and an Ammo box or crate its Blender model, at 0.6 of its own, each turn baked into frames and turned to the eye.
// Each lies in its rarity's light (dropLight.ts): a glow about it, a burst as it lands, then a pillar over it and motes
// rising. Each is drawn as the marks are, the light added to what stands behind it. An Ammo box stepped onto with the
// ammunition full, which the room leaves lying, is told of.

import { DROPPED, type GearDrop } from '../network/gearMessages.ts';
import { RARITIES } from '../player/gear.ts';
import { motionReduced } from '../plus/kit.ts';
import {
  AMMO_PILLAR_M,
  PALE,
  PILLAR_M,
  glowPulse,
  markBurst,
  markGlow,
  markMotes,
  markPillar,
  pillarPulse,
} from './dropLight.ts';
import { AMMO_BOX_TURN } from './ammoBoxPictures.ts';
import { AMMO_CRATE_TURN } from './ammoCratePictures.ts';
import { AMMO_BOX, type PixelPicture } from './dropPictures.ts';
import { CROWN_M, SPIN_FRAMES, crystalFrame, hashOf } from './vestigeCrystal.ts';
import type { Landing } from './worldSounds.ts';

type Point = readonly [number, number, number];

const TICK_S = 1 / 60;
/** How much larger than its frame a Vestige is drawn on the ground, and ammunition: the knob each piece lying as an
 *  item follows. */
export const VESTIGE_SCALE = 2;
export const AMMO_SCALE = 0.6;
/** How long its pillar takes to rise once it settles, seconds. */
export const RISE_S = 0.4;

/** How a drop moves: its middle's height over the body as it leaves, its pop upward and the most more it may have,
 *  the pull, the share of a bounce's speed it keeps and of its way along the ground, the speed under which it settles,
 *  its middle's height over the ground as it bounces and as it hovers, how long it takes to rise there, its bob's
 *  height and rate (radians a second), and its turn in the air and at rest (radians a second): project-final's, but
 *  for the heights, raised so no frame dips into the ground, and raised or lowered with its size, where it leaves the
 *  body by as much as where it lies, so its flight lasts as long. How long it waits unseen before it leaves (a chest's
 *  lid opening its mouth), and how long the room waits before it may be taken, that and the longest it can bounce
 *  (crates/room/src/drops.rs, VESTIGE_REST_TICKS, AMMO_REST_TICKS and POURED_REST_TICKS). */
export interface Feel {
  readonly leaves: number;
  readonly pop: number;
  readonly popMore: number;
  readonly pull: number;
  readonly keeps: number;
  readonly grip: number;
  readonly settles: number;
  readonly low: number;
  readonly hover: number;
  readonly riseS: number;
  readonly bob: number;
  readonly bobRate: number;
  readonly airTurn: number;
  readonly restTurn: number;
  readonly waitS: number;
  readonly restS: number;
}

export const CRYSTAL_FEEL: Feel = {
  leaves: 1.38,
  pop: 4.4,
  popMore: 1,
  pull: 16,
  keeps: 0.4,
  grip: 0.55,
  settles: 1.1,
  low: 0.46,
  hover: 0.84,
  riseS: 0.35,
  bob: 0.05,
  bobRate: 1.9,
  airTurn: 7,
  restTurn: 2.4,
  waitS: 0,
  restS: 94 / 60,
};

/** A Vestige poured out of a chest leaves from its mouth, popped higher and wider than a body's, once the lid has
 *  opened its mouth: project-final's cache's pour. */
export const POURED_FEEL: Feel = {
  ...CRYSTAL_FEEL,
  leaves: 0.93,
  pop: 6.2,
  popMore: 1.4,
  waitS: 0.22,
  restS: 122 / 60,
};

/** Ammunition pops lower and settles sooner. */
export const AMMO_FEEL: Feel = {
  leaves: 0.886,
  pop: 2.8,
  popMore: 0.6,
  pull: 16,
  keeps: 0.3,
  grip: 0.55,
  settles: 1.6,
  low: 0.186,
  hover: 0.3,
  riseS: 0.28,
  bob: 0.06,
  bobRate: 2,
  airTurn: 5,
  restTurn: 2.4,
  waitS: 0,
  restS: 60 / 60,
};

/** How long each arc of a flight lasts, seconds: the first from leaving `fall` metres over where it lands, popped up
 *  at `pop`, then each bounce, until one lands slower than it settles. */
export function arcsOf(feel: Feel, pop: number, fall: number): number[] {
  const first = (pop + Math.sqrt(Math.max(0, pop * pop + 2 * feel.pull * fall))) / feel.pull;
  const arcs = [first];
  for (let speed = feel.pull * first - pop; speed >= feel.settles;) {
    speed *= feel.keeps;
    arcs.push((2 * speed) / feel.pull);
  }
  return arcs;
}

/** Where a drop is `seconds` after it was thrown: its middle, whether it has settled and how long ago, and how far it
 *  has turned, radians. */
export interface Motion {
  readonly middle: Point;
  readonly settled: boolean;
  readonly since: number;
  readonly turn: number;
}

/** A drop's motion thrown from `from` (a body's feet) to rest on `rest`, its pop and its first turn drawn from
 *  `seed`. */
export function motionAt(feel: Feel, from: Point, rest: Point, seed: number, seconds: number): Motion {
  const floor = rest[2] + feel.low;
  const fall = from[2] + feel.leaves - floor;
  // Thrown up to a spot over where it leaves, it pops at least high enough to land there.
  const pop = Math.max(feel.pop + hashOf(seed) * feel.popMore, Math.sqrt(2 * feel.pull * Math.max(0, -fall)));
  const arcs = arcsOf(feel, pop, fall);
  const flight = arcs.reduce((sum, each) => sum + each, 0);
  const firstTurn = hashOf(seed + 0.5) * 2 * Math.PI;
  if (seconds >= flight) {
    const since = seconds - flight;
    const share = Math.min(1, since / feel.riseS);
    const eased = 1 - (1 - share) ** 2;
    const height = floor + (feel.hover - feel.low) * eased + Math.sin(seconds * feel.bobRate) * feel.bob * share;
    const turn = firstTurn + feel.airTurn * flight + feel.restTurn * since;
    return { middle: [rest[0], rest[1], height], settled: true, since, turn };
  }
  // Along the ground it slows by its grip at each bounce, and comes to rest on the room's spot as it settles.
  const ways = arcs.map((each, arc) => each * feel.grip ** arc);
  const whole = ways.reduce((sum, each) => sum + each, 0);
  let [start, along] = [0, 0];
  let arc = 0;
  while (arc < arcs.length - 1 && seconds >= start + (arcs[arc] ?? 0)) {
    start += arcs[arc] ?? 0;
    along += ways[arc] ?? 0;
    arc++;
  }
  const time = seconds - start;
  const share = (along + time * feel.grip ** arc) / whole;
  const leaves = arc === 0 ? pop : (feel.pull * (arcs[arc] ?? 0)) / 2;
  const height = (arc === 0 ? from[2] + feel.leaves : floor) + leaves * time - (feel.pull * time * time) / 2;
  const across = (axis: 0 | 1) => from[axis] + (rest[axis] - from[axis]) * share;
  return { middle: [across(0), across(1), height], settled: false, since: 0, turn: firstTurn + feel.airTurn * seconds };
}

const WHITE = [1, 1, 1] as const;
/** A picture's pixel in the world when it has none of its own, metres, and how far over a crown a pillar stands. */
export const PIXEL_M = 0.035;
const LIFT_M = 0.01;
/** A line's width, and the least it keeps of the eye's view, radians, so one across the ground still shows; how many
 *  steps it is drawn in; its glint's rate, cycles a second. */
const LINE_WIDE_M = 0.07;
const LINE_LEAST = 0.0022;
const LINE_STEPS = 12;
const CLIMB_HZ = 1;
/** A mark's opacity below none: the marks' sign for light added to what stands behind it. */
const ADDED = -1;
/** A drop's glow reaches this share of its picture's height from its middle, and no lower than this over the ground;
 *  its motes rise within this share of it, a Normal's fewest and ammunition's; its pillar's light and its burst's,
 *  ammunition's share. */
const GLOW_SHARE = 0.45;
const GLOW_FLOOR_M = 0.1;
const MOTE_SPREAD = 0.35;
const FEWEST_MOTES = 4;
const AMMO_MOTES = 3;
const AMMO_LIGHT = 0.5;
/** How far a landing's ring spreads on the ground, metres: a Vestige's, ammunition's. */
const RING_M = 1.5;
const AMMO_RING_M = 0.8;

/** How far ammunition's drawn top stands over its middle at the most through its turn, metres at its frame's size, so
 *  its pillar rises from one height as it turns. */
const topOf = (frames: readonly PixelPicture[]): number =>
  Math.max(
    ...frames.map((frame) => {
      const first = Math.max(
        0,
        frame.rows.findIndex((row) => /[^.]/.test(row)),
      );
      return (frame.rows.length / 2 - first) * (frame.pixelM ?? PIXEL_M);
    }),
  );
const BOX_TOP_M = topOf(AMMO_BOX_TURN);
const CRATE_TOP_M = topOf(AMMO_CRATE_TURN);

/** How a drop moves: a Vestige as a crystal, poured out of a chest or thrown, ammunition as ammunition. */
const feelOf = (drop: Pick<GearDrop, 'kind' | 'poured'>): Feel =>
  drop.kind !== DROPPED.vestige ? AMMO_FEEL : drop.poured ? POURED_FEEL : CRYSTAL_FEEL;

/** What a drop is drawn as turned `turn` radians: its frame of a Vestige's crystal or of ammunition's turn, and the
 *  halo a crystal glows in. */
export function pictureOf(
  drop: Pick<GearDrop, 'kind' | 'rarity'>,
  turn = 0,
): { readonly body: PixelPicture; readonly halo: PixelPicture | null } {
  if (drop.kind === DROPPED.vestige) return crystalFrame(drop.rarity, frameOf(turn, SPIN_FRAMES));
  const turning = drop.kind === DROPPED.crate ? AMMO_CRATE_TURN : AMMO_BOX_TURN;
  return { body: turning[frameOf(turn, turning.length)] ?? AMMO_BOX, halo: null };
}

/** Which of `frames` frames of a whole turn shows `turn` radians round. */
function frameOf(turn: number, frames: number): number {
  return ((Math.floor((turn / (2 * Math.PI)) * frames) % frames) + frames) % frames;
}

/** A colour written `#rrggbb` as red, green and blue from 0 to 1. */
function rgbOf(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

/** Each rarity's colour, read once. */
const RARITY_COLOURS = RARITIES.map((rarity) => rgbOf(rarity.colour));

/** The numbers of a rectangle of one colour: its left and right (metres off the picture's middle), its foot and its
 *  top (metres over the ground), its red, green and blue, and its layer. */
const RUN = 8;
/** How much nearer the eye each layer of a picture stands than the one under it, metres: far more than the depth
 *  buffer tells apart wherever a picture is seen, far less than the eye does. */
const LAYER_M = 0.002;
/** A picture in more colours than a glyph's twelve is laid flat: in layers its last colours would stand far enough
 *  nearer the eye than its first to be seen apart. */
const MOST_LAYERS = 12;
/** Each picture's rectangles, laid flat and in layers, worked out the first time it is laid so. */
const runsKept = [new WeakMap<PixelPicture, readonly number[]>(), new WeakMap<PixelPicture, readonly number[]>()];

/**
 * A picture's rectangles of one colour, each as far across and down as it may run. Laid in layers, its colours go on
 * in turn, the one spread widest first, each running under the colours laid after it, so a diamond inside a diamond
 * is a rectangle a step rather than a run a row. Laid flat, for a picture seen through or in many colours, where one
 * layer would show through another or stand too far before it, no rectangle covers another.
 */
function runsOf(picture: PixelPicture, asked: boolean): readonly number[] {
  const layered = asked && picture.colours.length <= MOST_LAYERS;
  const kept = runsKept[Number(layered)]?.get(picture);
  if (kept) return kept;
  const { rows } = picture;
  const [width, height] = [rows[0]?.length ?? 0, rows.length];
  const colours = picture.colours.map(rgbOf);
  const colourOf = (letter: string) => colours[letter.charCodeAt(0) - 97];
  const pixel = picture.pixelM ?? PIXEL_M;
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
        const [foot, top] = [(height - bottom - 1) * pixel + LIFT_M, (height - line) * pixel + LIFT_M];
        runs.push(
          (column - width / 2) * pixel,
          (right + 1 - width / 2) * pixel,
          foot,
          top,
          red,
          green,
          blue,
          // Laid flat, no rectangle covers another, so none need stand nearer the eye.
          layered ? layer : 0,
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

/** The pillar of light a drop at rest stands under, in its rarity's colour and height, rising from `over` metres
 *  above `place`: for a piece of gear the world lays down itself, drawn as it is; `share` of it risen, as a drop's
 *  pillar rises once it settles. */
export function markDropPillar(
  out: number[],
  {
    place,
    rarity,
    over,
    share = 1,
  }: { readonly place: Point; readonly rarity: number; readonly over: number; readonly share?: number },
  seconds: number,
  eye: Point,
): void {
  const crown: Point = [place[0], place[1], place[2] + over + LIFT_M];
  const tall = (PILLAR_M[rarity] ?? AMMO_PILLAR_M) * share;
  const strength = share * pillarPulse(rarity, seconds, motionReduced());
  markPillar(out, crown, tall, RARITY_COLOURS[rarity] ?? WHITE, strength, seconds, eye);
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
 * told of (or resting already, told of late), glowing, then bursting as it lands, standing and lit once it rests.
 * Each frame answers the marks (laid into `out` when given), and where every drop that came to rest since the last
 * lies and in what rarity, for its sound.
 */
export class DropsShown {
  /** When each drop's flight began, on the page's clock. */
  private readonly began = new Map<string, number>();
  private readonly rested = new Set<string>();
  /** When each drop seen landing landed, on the page's clock, for its burst. */
  private readonly landedAt = new Map<string, number>();
  /** The Ammo boxes at rest the player stood on at the last `ammoFull`, their ammunition full. */
  private refused = new Set<string>();
  /** Whether the player asked for reduced motion: no ring, no motes, no pulse. */
  private readonly still: () => boolean;

  constructor(still: () => boolean = motionReduced) {
    this.still = still;
  }

  frame(
    drops: readonly GearDrop[],
    seconds: number,
    eye: Point,
    out: number[] = [],
  ): { marks: number[]; landed: Landing[] } {
    const marks = out;
    const landed: Landing[] = [];
    const lying = new Set<string>();
    const still = this.still();
    for (const drop of drops) {
      const key = keyOf(drop);
      lying.add(key);
      if (!this.began.has(key)) {
        // Told of at rest, it is as though it rested long ago, and bursts no more.
        const { restS } = feelOf(drop);
        const flown = drop.flying > 0 ? restS - drop.flying * TICK_S : restS + RISE_S;
        this.began.set(key, seconds - Math.max(0, flown));
        if (drop.flying === 0) this.rested.add(key);
      }
      const feel = feelOf(drop);
      const since = seconds - (this.began.get(key) ?? seconds);
      // Still in the chest as its lid opens.
      if (since < feel.waitS) continue;
      const motion = motionAt(feel, drop.from, drop.at, drop.id * 7 + drop.kind, since - feel.waitS);
      const { body, halo } = pictureOf(drop, motion.turn);
      const ammo = drop.kind !== DROPPED.vestige;
      const scale = ammo ? AMMO_SCALE : VESTIGE_SCALE;
      const tallM = body.rows.length * (body.pixelM ?? PIXEL_M) * scale;
      const { middle } = motion;
      const base: Point = [middle[0], middle[1], middle[2] - tallM / 2];
      markPicture(marks, body, base, eye, scale);
      if (halo) markPicture(marks, halo, base, eye, scale, ADDED);
      const colour = ammo ? PALE : (RARITY_COLOURS[drop.rarity] ?? WHITE);
      const floor = drop.at[2] + GLOW_FLOOR_M;
      markGlow(marks, middle, tallM * GLOW_SHARE, colour, glowPulse(seconds, still), eye, floor);
      if (!motion.settled) continue;
      if (!this.rested.has(key)) {
        this.rested.add(key);
        this.landedAt.set(key, seconds);
        landed.push({ at: drop.at, rarity: ammo ? null : drop.rarity });
      }
      const landedAt = this.landedAt.get(key);
      if (landedAt !== undefined) {
        // Ammunition's burst is smaller and dimmer than a Vestige's, as its pillar is.
        const [burstColour, ring] = ammo ? [PALE.map((each) => each * AMMO_LIGHT), AMMO_RING_M] : [colour, RING_M];
        const burst = { ground: drop.at, middle, colour: burstColour, ring, since: seconds - landedAt, still };
        markBurst(marks, burst, eye);
      }
      if (!still) {
        const count = ammo ? AMMO_MOTES : FEWEST_MOTES + 2 * drop.rarity;
        const from: Point = [middle[0], middle[1], middle[2] - tallM / 4];
        const seed = drop.id * 7 + drop.kind;
        markMotes(marks, { middle: from, spread: tallM * MOTE_SPREAD, colour, count, seed }, seconds, eye);
      }
      const rise = Math.min(1, motion.since / RISE_S);
      const tall = (ammo ? AMMO_PILLAR_M : (PILLAR_M[drop.rarity] ?? AMMO_PILLAR_M)) * rise;
      const strength = rise * pillarPulse(ammo ? null : drop.rarity, seconds, still) * (ammo ? AMMO_LIGHT : 1);
      const top =
        (drop.kind === DROPPED.crate ? CRATE_TOP_M : drop.kind === DROPPED.ammoBox ? BOX_TOP_M : CROWN_M) * scale;
      const crown: Point = [middle[0], middle[1], middle[2] + top + LIFT_M];
      markPillar(marks, crown, tall, colour, strength, seconds, eye);
    }
    for (const key of this.began.keys())
      if (!lying.has(key)) {
        this.began.delete(key);
        this.rested.delete(key);
        this.landedAt.delete(key);
      }
    return { marks, landed };
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
