// The spells' lines: lightning struck in jagged legs, beams, trails and streaks behind what moves, and lines and rings
// lying on the ground. Every line is laid in flat colours, one stop of its element's glow each, as the pictures are,
// and never thinner on the screen than a pixel or two, however far off it is, so a spell reads across a field.
import { GLOW_RAMPS, type GlowElement } from '../elementGlow.ts';
import { BODY, DARK, HOT, LIGHT, type Laid, hashOf, stepOf } from './spellPixels.ts';

type Point = readonly [number, number, number];
type Colour = readonly [number, number, number, number];

/** How far over the ground a line on it lies (metres), as the marks lie. */
const LIFT = 0.04;
/** A trail's three steps, newest first: its width (metres), its stop and its opacity. */
const TRAIL_STEPS = [
  { width: 0.06, stop: LIGHT, opacity: 0.9 },
  { width: 0.04, stop: BODY, opacity: 0.75 },
  { width: 0.025, stop: DARK, opacity: 0.6 },
] as const;
/** A Linked player's motes: how many, how long each takes to rise (seconds), how high it rises and how far out it
 *  stands (metres). */
const MOTES = 6;
const MOTE_RISE_S = 1.2;
const MOTE_RISE_M = 1.9;
const MOTE_OUT_M = 0.32;
/** The least a line stands across on the screen, as metres for each metre away: a core about a pixel and a half at
 *  720p, a glow about three; a line lying on the ground, seen aslant, about two and a half, never past `GROUND_MOST`
 *  metres across. */
const CORE_LEAST = 0.0024;
const GLOW_LEAST = 0.005;
const GROUND_LEAST = 0.004;
const GROUND_MOST = 1;
/** A tail keeps where its thing is once a room tick (seconds), however fast the frames come. */
const TAIL_STEP_S = 1 / 60;

/** An element's stop as a colour at `opacity`. */
export const colourOf = (look: GlowElement, stop: number, opacity: number): Colour => [
  ...(GLOW_RAMPS[look][stop] ?? GLOW_RAMPS[look][0]),
  opacity,
];

/** A line from `from` to `to` in `legs` legs, each joint thrown aside up to `jitter` metres, as `seed` chooses. */
export function jagged(from: Point, to: Point, legs: number, jitter: number, seed: number): Point[] {
  const along = [to[0] - from[0], to[1] - from[1], to[2] - from[2]] as const;
  const flat = Math.hypot(along[0], along[1]);
  const across: Point = flat > 1e-6 ? [-along[1] / flat, along[0] / flat, 0] : [1, 0, 0];
  const length = Math.hypot(...along) || 1;
  const over: Point = [
    (along[1] * across[2] - along[2] * across[1]) / length,
    (along[2] * across[0] - along[0] * across[2]) / length,
    (along[0] * across[1] - along[1] * across[0]) / length,
  ];
  const points: Point[] = [];
  for (let joint = 0; joint <= legs; joint++) {
    const share = joint / legs;
    const ends = joint === 0 || joint === legs;
    const first = ends ? 0 : (hashOf(seed, joint, 1) - 0.5) * 2 * jitter;
    const second = ends ? 0 : (hashOf(seed, joint, 2) - 0.5) * 2 * jitter;
    points.push([
      from[0] + along[0] * share + across[0] * first + over[0] * second,
      from[1] + along[1] * share + across[1] * first + over[1] * second,
      from[2] + along[2] * share + across[2] * first + over[2] * second,
    ]);
  }
  return points;
}

/** A strip along `points` turned to face `eye`, `width` metres across but never less than `least` for each metre it
 *  stands from the eye, in one colour: mark triangles. */
export function lineRibbon(
  out: Laid,
  eye: Point,
  points: readonly Point[],
  width: number,
  colour: Colour,
  least = 0,
): void {
  // Laid as plain numbers, no arrays: this runs for every joint of every line, every frame.
  const opacity = colour[3];
  let lastX = 0;
  let lastY = 0;
  let lastZ = 0;
  let lastSideX = 0;
  let lastSideY = 0;
  let lastSideZ = 0;
  for (let index = 0; index < points.length; index++) {
    const point = points[index];
    const ahead = points[Math.min(points.length - 1, index + 1)];
    const behind = points[Math.max(0, index - 1)];
    if (!point || !ahead || !behind) continue;
    const alongX = ahead[0] - behind[0];
    const alongY = ahead[1] - behind[1];
    const alongZ = ahead[2] - behind[2];
    const lookX = eye[0] - point[0];
    const lookY = eye[1] - point[1];
    const lookZ = eye[2] - point[2];
    const sideX = alongY * lookZ - alongZ * lookY;
    const sideY = alongZ * lookX - alongX * lookZ;
    const sideZ = alongX * lookY - alongY * lookX;
    const half = Math.max(width, Math.hypot(lookX, lookY, lookZ) * least) / 2 / (Math.hypot(sideX, sideY, sideZ) || 1);
    const acrossX = sideX * half;
    const acrossY = sideY * half;
    const acrossZ = sideZ * half;
    const nowX = point[0];
    const nowY = point[1];
    const nowZ = point[2];
    if (index > 0)
      out.quad(
        lastX - lastSideX,
        lastY - lastSideY,
        lastZ - lastSideZ,
        nowX - acrossX,
        nowY - acrossY,
        nowZ - acrossZ,
        nowX + acrossX,
        nowY + acrossY,
        nowZ + acrossZ,
        lastX + lastSideX,
        lastY + lastSideY,
        lastZ + lastSideZ,
        colour,
        opacity,
      );
    lastX = nowX;
    lastY = nowY;
    lastZ = nowZ;
    lastSideX = acrossX;
    lastSideY = acrossY;
    lastSideZ = acrossZ;
  }
}

/** Lightning or a beam along `points`, turned to `eye`: a glow `glow` metres wide in the element's body under a core
 *  `core` wide white-hot, each in one flat colour, at `opacity`. */
export function boltLine(
  out: Laid,
  eye: Point,
  points: readonly Point[],
  look: GlowElement,
  { core, glow, opacity = 1 }: { core: number; glow: number; opacity?: number },
): void {
  if (glow > 0) lineRibbon(out, eye, points, glow, colourOf(look, BODY, 0.55 * opacity), GLOW_LEAST);
  if (core > 0) lineRibbon(out, eye, points, core, colourOf(look, HOT, opacity), CORE_LEAST);
}

/** How wide a line lying on the ground at `place` is drawn for an eye at `eye`: `width`, or more far off, where the
 *  ground is seen aslant, so it still stands a few pixels across. */
export function groundWidth(eye: Point, place: Point, width: number): number {
  const apart = Math.hypot(eye[0] - place[0], eye[1] - place[1], eye[2] - place[2]);
  const aslant = Math.max(0.05, (eye[2] - place[2]) / (apart || 1));
  return Math.max(width, Math.min(GROUND_MOST, (apart * GROUND_LEAST) / aslant));
}

/** A line lying on the ground along `points`, `width` metres across, in one colour. */
export function groundStrip(out: Laid, points: readonly Point[], width: number, colour: Colour): void {
  for (let index = 0; index + 1 < points.length; index++) {
    const from = points[index];
    const to = points[index + 1];
    if (!from || !to) continue;
    const apart = Math.hypot(to[0] - from[0], to[1] - from[1]);
    if (apart < 1e-6) continue;
    const sideX = (-(to[1] - from[1]) / apart) * (width / 2);
    const sideY = ((to[0] - from[0]) / apart) * (width / 2);
    const fromZ = from[2] + LIFT;
    const toZ = to[2] + LIFT;
    out.quad(
      from[0] - sideX,
      from[1] - sideY,
      fromZ,
      to[0] - sideX,
      to[1] - sideY,
      toZ,
      to[0] + sideX,
      to[1] + sideY,
      toZ,
      from[0] + sideX,
      from[1] + sideY,
      fromZ,
      colour,
      colour[3],
    );
  }
}

/** The steps a whole ring on the ground is laid in. */
const RING_STEPS = 48;

/** A ring on the ground about `centre` from radius `inner` to `outer`, in one colour; only the arc between two
 *  bearings (radians clockwise from north) with `arc`. */
export function groundRing(
  out: Laid,
  centre: Point,
  inner: number,
  outer: number,
  colour: Colour,
  [start, end]: readonly [number, number] = [0, 2 * Math.PI],
): void {
  const [x, y, z] = [centre[0], centre[1], centre[2] + LIFT];
  const steps = Math.max(1, Math.ceil((RING_STEPS * Math.abs(end - start)) / (2 * Math.PI)));
  let sin = Math.sin(start);
  let cos = Math.cos(start);
  for (let step = 1; step <= steps; step++) {
    const angle = start + ((end - start) * step) / steps;
    const nextSin = Math.sin(angle);
    const nextCos = Math.cos(angle);
    out.quad(
      x + sin * inner,
      y - cos * inner,
      z,
      x + sin * outer,
      y - cos * outer,
      z,
      x + nextSin * outer,
      y - nextCos * outer,
      z,
      x + nextSin * inner,
      y - nextCos * inner,
      z,
      colour,
      colour[3],
    );
    sin = nextSin;
    cos = nextCos;
  }
}

/** A trail along `points` (newest first, each with its age in seconds) lasting `lasts` seconds, turned to `eye`: in
 *  three steps of its age, each narrower, darker and fainter than the one before, `scale` times as wide. */
export function trailLine(
  out: Laid,
  eye: Point,
  points: readonly { readonly at: Point; readonly age: number }[],
  look: GlowElement,
  lasts: number,
  scale = 1,
): void {
  TRAIL_STEPS.forEach(({ width, stop, opacity }, step) => {
    const inStep: Point[] = [];
    for (let index = 0; index < points.length; index++) {
      const own = stepOf((points[index]?.age ?? 0) / lasts, TRAIL_STEPS.length);
      const before = stepOf((points[index - 1]?.age ?? 0) / lasts, TRAIL_STEPS.length);
      const place = points[index]?.at;
      if (place && (own === step || before === step)) inStep.push(place);
    }
    if (inStep.length > 1) lineRibbon(out, eye, inStep, width * scale, colourOf(look, stop, opacity), CORE_LEAST);
  });
}

/** Where each thing that leaves a trail has been lately, by its number: newest first, each place with the clock's
 *  seconds it was there, one kept a room tick at most, so a fast screen lays no more than a slow one. */
export class Tails {
  private readonly kept = new Map<number, { at: Point; time: number }[]>();

  /** Takes that `id` is at `where` at `time` and answers where it has been within `lasts` seconds, newest first and
   *  `where` itself first of all, each with its age. A clock gone back starts the trail over. */
  add(id: number, where: Point, time: number, lasts: number): { at: Point; age: number }[] {
    const places = (this.kept.get(id) ?? []).filter((place) => place.time <= time && time - place.time <= lasts);
    if (time - (places[0]?.time ?? -Infinity) >= TAIL_STEP_S - 1e-9) places.unshift({ at: where, time });
    this.kept.set(id, places);
    const answer = places.map((place) => ({ at: place.at, age: time - place.time }));
    if (places[0]?.time !== time) answer.unshift({ at: where, age: 0 });
    return answer;
  }

  /** Lets go of every trail whose thing is not in `present`. */
  keep(present: ReadonlySet<number>): void {
    for (const id of this.kept.keys()) if (!present.has(id)) this.kept.delete(id);
  }
}

/** The motes rising off a Linked player `id` standing at `feet`, `clock` seconds on: each its own place round them,
 *  rising and cooling a stop at a time, white-hot to the element's body. */
export function risingMotes(id: number, feet: Point, clock: number): { at: Point; stop: number }[] {
  return Array.from({ length: MOTES }, (unused, mote) => {
    const rise = (clock / MOTE_RISE_S + hashOf(id, mote, 1)) % 1;
    const angle = hashOf(id, mote, 2) * 2 * Math.PI;
    const place: Point = [
      feet[0] + Math.cos(angle) * MOTE_OUT_M,
      feet[1] + Math.sin(angle) * MOTE_OUT_M,
      feet[2] + 0.2 + rise * MOTE_RISE_M,
    ];
    return { at: place, stop: HOT - stepOf(rise, 3) };
  });
}

/** A rune ring's parts: its edge's width (metres), how far in its dotted circle stands, the dots' size and spacing,
 *  and its dithered fill's grid (metres) and the Bayer thresholds under which a grid cell is filled (2 of 16). */
const RUNE = { edge: 0.06, dotsIn: 0.35, dot: 0.07, dotEvery: 0.3, grid: 0.2, filled: 2 } as const;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5] as const;
const FILLS = new Map<number, Float32Array>();

/** The grid cells a rune ring's floor fills within `radius`, as east and south offsets from its middle, worked out
 *  once for each radius. */
function fillOf(radius: number): Float32Array {
  const key = Math.round(radius * 100);
  const found = FILLS.get(key);
  if (found) return found;
  const offsets: number[] = [];
  const cells = Math.floor(radius / RUNE.grid);
  for (let row = -cells; row <= cells; row++)
    for (let column = -cells; column <= cells; column++) {
      const filled = (BAYER[(((row % 4) + 4) % 4) * 4 + (((column % 4) + 4) % 4)] ?? 16) < RUNE.filled;
      if (filled && Math.hypot(row, column) * RUNE.grid < radius) offsets.push(column * RUNE.grid, row * RUNE.grid);
    }
  const fill = Float32Array.from(offsets);
  FILLS.set(key, fill);
  return fill;
}

/** A ring of magic on the ground about `middle`, `radius` metres out, in `look`'s stops: its edge in light (white-hot
 *  while `struck`), a dotted circle inside it in the element's body, and its floor dithered an eighth in its dark.
 *  Seen from `eye`, its edge stays a few pixels across far off. */
export function runeRing(
  out: Laid,
  middle: Point,
  radius: number,
  look: GlowElement,
  { struck = false, eye = null }: { struck?: boolean; eye?: Point | null } = {},
): void {
  const lift = middle[2] + LIFT;
  const square = (x: number, y: number, size: number, colour: Colour) => {
    const [west, east, north, south] = [x - size / 2, x + size / 2, y - size / 2, y + size / 2];
    out.quad(west, north, lift, east, north, lift, east, south, lift, west, south, lift, colour, colour[3]);
  };
  const dark = colourOf(look, DARK, 1);
  const fill = fillOf(radius - RUNE.dotsIn);
  for (let index = 0; index < fill.length; index += 2)
    square(middle[0] + (fill[index] ?? 0), middle[1] + (fill[index + 1] ?? 0), RUNE.grid / 2, dark);
  const dotted = radius - RUNE.dotsIn;
  const dots = Math.max(8, Math.round((2 * Math.PI * dotted) / RUNE.dotEvery));
  const body = colourOf(look, BODY, 1);
  for (let dot = 0; dot < dots; dot++) {
    const angle = (dot / dots) * 2 * Math.PI;
    square(middle[0] + Math.sin(angle) * dotted, middle[1] - Math.cos(angle) * dotted, RUNE.dot, body);
  }
  const edge = eye ? groundWidth(eye, middle, RUNE.edge) : RUNE.edge;
  groundRing(out, middle, radius - edge, radius, colourOf(look, struck ? HOT : LIGHT, 1));
}
