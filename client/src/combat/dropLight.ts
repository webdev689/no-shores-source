// The light a drop lies in, as Destiny lights its loot: a tall pillar of its rarity's colour over it, seen from far
// off; a flash and a ring on the ground as it lands; a soft glow about it, pulsing slowly, and motes drifting up from
// it. Each is drawn in cells as the spells are, every cell one flat colour, and as light added to what stands behind
// it, as a drop's halo is.

import { markRing } from './marks.ts';
import { CELL_M, hashOf } from './spellPixels.ts';

type Point = readonly [number, number, number];
type Rgb = readonly number[];

/** A mark's opacity below none: the marks' sign for light added to what stands behind it. */
const ADDED = -1;

/** How tall a pillar stands by rarity, metres: a Legendary's and an Atheric's the tallest. Ammunition's is short and
 *  pale. */
export const PILLAR_M = [1.4, 2, 3, 4.5, 4.5] as const;
export const AMMO_PILLAR_M = 0.6;
export const PALE = [0.82, 0.88, 0.96] as const;
/** A pillar's half-widths in cells: its white heart, its body and its dim edge; how many cells tall its light steps
 *  in; its glint's and its pulse's rates, cycles a second. */
const CORE_CELLS = 1;
const BODY_CELLS = 2;
const EDGE_CELLS = 4;
const PILLAR_STEPS = 24;
const CLIMB_HZ = 0.6;
const PULSE_HZ = 1;
/** A pillar's lowest share fades in out of the drop's glow, and its highest tapers to a point as it fades out: no
 *  flat end. */
const FOOT_SHARE = 0.25;
const TIP_SHARE = 1 / 3;
/** A pillar's light at its brightest, its root's. */
const PILLAR_LIGHT = 0.6;
/** How many stops light steps through, as a spell's cells do: no light blended between them. */
const STOPS = 6;
/** The least of the eye's view a cell keeps, radians, so a pillar far off still shows. */
const CELL_LEAST = 0.0012;

/** How long a landing's burst lasts, and its flash, seconds. */
export const BURST_S = 0.7;
const FLASH_S = 0.3;
/** A glow's cells are this many of an effect's; its pulse's rate, cycles a second. */
const GLOW_CELLS = 3;
const GLOW_HZ = 0.5;
/** How many pixels of the view past its picture an item's glow reaches far off; nearer than `NEAR_M` its glow is its
 *  own, and from `FAR_M` it reaches its picture's ends (metres). */
const GLOW_PAST = 3;
const NEAR_M = 8;
const FAR_M = 20;
/** A mote's life and how far it rises in it, seconds and metres. */
const MOTE_S = 1.6;
const MOTE_RISE_M = 0.9;

/** A cell's size at `place` seen from `eye`, metres: an effect's, or more far off. */
export const cellAt = (eye: Point, place: Point): number =>
  Math.max(CELL_M, Math.hypot(place[0] - eye[0], place[1] - eye[1], place[2] - eye[2]) * CELL_LEAST);

/** `share` stepped up to the next of the stops, so light steps as a cell's does. */
const stepped = (share: number): number => Math.ceil(Math.max(0, share) * STOPS) / STOPS;

/** `colour` mixed toward white by `white`, times `light`. */
const lit = (colour: Rgb, light: number, white = 0): [number, number, number] => {
  const [red = 0, green = 0, blue = 0] = colour;
  return [
    (red + (1 - red) * white) * light,
    (green + (1 - green) * white) * light,
    (blue + (1 - blue) * white) * light,
  ];
};

/** The way across the eye's view at `place`, along the ground. */
export function acrossFrom(eye: Point, place: Point): [number, number] {
  const [east, south] = [place[0] - eye[0], place[1] - eye[1]];
  const length = Math.hypot(east, south) || 1;
  return [-south / length, east / length];
}

/** An upright quad of one colour across the eye's view, from `from` to `to` (metres along `across` from `at`) and
 *  `low` to `high`, as light added. */
function upright(
  out: number[],
  place: Point,
  across: readonly [number, number],
  [from, to]: readonly [number, number],
  [low, high]: readonly [number, number],
  [red, green, blue]: readonly [number, number, number],
): void {
  const [fromX, fromY] = [place[0] + across[0] * from, place[1] + across[1] * from];
  const [toX, toY] = [place[0] + across[0] * to, place[1] + across[1] * to];
  out.push(fromX, fromY, low, red, green, blue, ADDED, toX, toY, low, red, green, blue, ADDED);
  out.push(toX, toY, high, red, green, blue, ADDED, fromX, fromY, low, red, green, blue, ADDED);
  out.push(toX, toY, high, red, green, blue, ADDED, fromX, fromY, high, red, green, blue, ADDED);
}

/** How bright a pillar is `share` of the way up it at `seconds`: brightest at its root, fading to its tip, a glint
 *  climbing it. */
function pillarLight(share: number, seconds: number): number {
  const climb = (((share - seconds * CLIMB_HZ) % 1) + 1) % 1;
  const glint = Math.exp(-(((climb - 0.5) * 7) ** 2));
  return (1 - share) ** 1.2 * (0.7 + 0.4 * glint) + 0.5 * Math.exp(-share * 10);
}

/** How strong a pillar stands at `seconds`: a Legendary's and an Atheric's pulsing, unless motion is reduced. */
export const pillarPulse = (rarity: number | null, seconds: number, still: boolean): number =>
  rarity !== null && rarity >= 3 && !still ? 1 + 0.35 * Math.sin(seconds * 2 * Math.PI * PULSE_HZ) : 1;

/** A pillar of light rising `height` from `root`, turned to the eye, in `colour` times `strength`: a white heart, its
 *  body and a dim edge, its light stepping down toward its tip as a glint climbs it; its foot fading in, its top
 *  narrowing cell by cell to a point as it fades out. */
export function markPillar(
  out: number[],
  root: Point,
  height: number,
  colour: Rgb,
  strength: number,
  seconds: number,
  eye: Point,
): void {
  if (height <= 0) return;
  const across = acrossFrom(eye, root);
  const cell = cellAt(eye, root);
  for (let step = 0; step < PILLAR_STEPS; step += 1) {
    const rows: [number, number] = [
      root[2] + (step / PILLAR_STEPS) * height,
      root[2] + ((step + 1) / PILLAR_STEPS) * height,
    ];
    const share = (step + 0.5) / PILLAR_STEPS;
    const [foot, tip] = [Math.min(1, share / FOOT_SHARE), Math.min(1, (1 - share) / TIP_SHARE)];
    const edgeCells = Math.max(1, Math.ceil(EDGE_CELLS * tip));
    const [core, body, edge] = [Math.min(CORE_CELLS, edgeCells), Math.min(BODY_CELLS, edgeCells), edgeCells].map(
      (cells) => cells * cell,
    ) as [number, number, number];
    // Kept under white at its brightest, so over a pale sky it still shows its colour.
    const light = stepped(PILLAR_LIGHT * pillarLight(share, seconds) * foot * tip) * strength;
    upright(out, root, across, [-core, core], rows, lit(colour, light, 0.25));
    for (const side of [-1, 1]) {
      if (body > core) upright(out, root, across, [side * core, side * body], rows, lit(colour, light * 0.65));
      if (edge > body) upright(out, root, across, [side * body, side * edge], rows, lit(colour, light * 0.25));
    }
  }
}

/** A drop landing: on `ground`, its picture's middle at `middle`, in `colour`, its ring spreading `ring` metres,
 *  `since` seconds ago, motion reduced or not. */
export interface Burst {
  readonly ground: Point;
  readonly middle: Point;
  readonly colour: Rgb;
  readonly ring: number;
  readonly since: number;
  readonly still: boolean;
}

/** A drop's burst as it lands: a flash at it, a star of cells, and a ring spreading on the ground about it, both
 *  fading; with motion reduced, the flash alone. */
export function markBurst(out: number[], { ground, middle, colour, ring, since, still }: Burst, eye: Point): void {
  if (since < 0 || since >= BURST_S) return;
  if (since < FLASH_S) {
    const share = since / FLASH_S;
    const light = stepped(1 - share) * 1.5;
    const cell = 2 * cellAt(eye, middle);
    // With motion reduced the star fades where it stands, never growing.
    const arm = (still ? 3 : Math.round(2 + 3 * share)) * cell;
    const half = cell / 2;
    const across = acrossFrom(eye, middle);
    const hot = lit(colour, light, 0.5);
    upright(out, middle, across, [-arm - half, arm + half], [middle[2] - half, middle[2] + half], hot);
    upright(out, middle, across, [-half, half], [middle[2] + half, middle[2] + half + arm], hot);
    upright(out, middle, across, [-half, half], [middle[2] - half - arm, middle[2] - half], hot);
  }
  if (still) return;
  const share = since / BURST_S;
  const cell = cellAt(eye, ground);
  const outer = Math.max(2, Math.ceil((ring * (1 - (1 - share) ** 2)) / cell)) * cell;
  const [red, green, blue] = lit(colour, stepped(1 - share) * 1.2);
  markRing(out, ground, outer - 2 * cell, outer, [red, green, blue, ADDED]);
}

/** How far an item's glow reaches about its middle, `long` metres its picture's longest side, past its own: nothing
 *  up close, where its own glow is no larger than its picture; growing farther off to its picture's ends, and a few
 *  pixels of the view past them, as a pillar's cells grow, so a thin sword or bow far off still shows where it lies. */
export function glowReach(long: number, middle: Point, eye: Point): number {
  const past = Math.hypot(middle[0] - eye[0], middle[1] - eye[1], middle[2] - eye[2]) - NEAR_M;
  if (past <= 0) return 0;
  return Math.min(1, past / (FAR_M - NEAR_M)) * (long / 2) + GLOW_PAST * CELL_LEAST * past;
}

/** How strong a drop's glow stands at `seconds`: pulsing slowly, steady with motion reduced. */
export const glowPulse = (seconds: number, still: boolean): number =>
  still ? 1 : 0.8 + 0.2 * Math.sin(seconds * 2 * Math.PI * GLOW_HZ);

/** A soft glow `radius` about `middle`, turned to the eye, in `colour` times `strength`: three rings of cells, the
 *  brightest at its heart; none of it below `floor`, so it never shows through the ground under it. */
export function markGlow(
  out: number[],
  middle: Point,
  radius: number,
  colour: Rgb,
  strength: number,
  eye: Point,
  floor = -Infinity,
): void {
  const cell = GLOW_CELLS * cellAt(eye, middle);
  const across = acrossFrom(eye, middle);
  const rows = Math.ceil(radius / cell);
  const halfAt = (ring: number, up: number) =>
    Math.round(Math.sqrt(Math.max(0, (radius * ring) ** 2 - up * up)) / cell) * cell;
  for (let row = -rows; row < rows; row += 1) {
    const [low, high] = [middle[2] + row * cell, middle[2] + (row + 1) * cell];
    if (low < floor) continue;
    const up = (row + 0.5) * cell;
    const [rim, mid, heart] = [halfAt(1, up), halfAt(0.66, up), halfAt(0.33, up)];
    if (heart > 0) upright(out, middle, across, [-heart, heart], [low, high], lit(colour, 0.24 * strength));
    for (const side of [-1, 1]) {
      if (mid > heart)
        upright(out, middle, across, [side * heart, side * mid], [low, high], lit(colour, 0.14 * strength));
      if (rim > mid) upright(out, middle, across, [side * mid, side * rim], [low, high], lit(colour, 0.06 * strength));
    }
  }
}

/** Where mote `nth` of a drop drawn from `seed` is at `seconds`: east and south of the drop's middle (a share of its
 *  spread), how far it has risen (metres), and how bright it is. */
export function moteAt(seed: number, nth: number, seconds: number): [number, number, number, number] {
  const age = (((seconds / MOTE_S + hashOf(seed, nth)) % 1) + 1) % 1;
  const bearing = hashOf(seed, nth, 1) * 2 * Math.PI;
  const out = 0.3 + 0.7 * hashOf(seed, nth, 2);
  const sway = 0.15 * Math.sin(age * 2 * Math.PI + bearing);
  return [Math.cos(bearing) * out + sway, Math.sin(bearing) * out, age * MOTE_RISE_M, stepped(Math.sin(age * Math.PI))];
}

/** A drop's motes: `count` drawn from `seed`, rising from `middle` within `spread` of it, in `colour`. */
export interface Motes {
  readonly middle: Point;
  readonly spread: number;
  readonly colour: Rgb;
  readonly count: number;
  readonly seed: number;
}

/** A drop's motes at `seconds`, each a square of cells turned to the eye, every other one whiter. */
export function markMotes(
  out: number[],
  { middle, spread, colour, count, seed }: Motes,
  seconds: number,
  eye: Point,
): void {
  for (let nth = 0; nth < count; nth += 1) {
    const [east, south, up, light] = moteAt(seed, nth, seconds);
    if (light <= 0) continue;
    const place: Point = [middle[0] + east * spread, middle[1] + south * spread, middle[2] + up];
    const half = cellAt(eye, place);
    upright(
      out,
      place,
      acrossFrom(eye, place),
      [-half, half],
      [place[2] - half, place[2] + half],
      lit(colour, light, (nth % 2) * 0.5),
    );
  }
}
