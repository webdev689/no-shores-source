// The spells' lines: lightning struck in jagged legs, beams, trails and streaks behind what moves, and lines lying on
// the ground. Every line is laid in flat colours, one stop of its element's glow each, as the pictures are.
import { GLOW_RAMPS, type GlowElement } from '../elementGlow.ts';
import { BODY, DARK, HOT, LIGHT, hashOf, stepOf } from './spellPixels.ts';
import { ribbon } from './tracers.ts';

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
  return Array.from({ length: legs + 1 }, (unused, joint) => {
    const share = joint / legs;
    const thrown =
      joint === 0 || joint === legs ? [0, 0] : [hashOf(seed, joint, 1) - 0.5, hashOf(seed, joint, 2) - 0.5];
    const [first = 0, second = 0] = thrown.map((part) => part * 2 * jitter);
    return [0, 1, 2].map(
      (axis) =>
        (from[axis] ?? 0) + (along[axis] ?? 0) * share + (across[axis] ?? 0) * first + (over[axis] ?? 0) * second,
    ) as unknown as Point;
  });
}

/** Lightning or a beam along `points`, turned to `eye`: a glow `glow` metres wide in the element's body under a core
 *  `core` wide white-hot, each in one flat colour, at `opacity`. */
export function boltLine(
  out: number[],
  eye: Point,
  points: readonly Point[],
  look: GlowElement,
  { core, glow, opacity = 1 }: { core: number; glow: number; opacity?: number },
): void {
  const along = (width: number, colour: Colour) => points.map((point) => ({ at: point, width, colour }));
  if (glow > 0) ribbon(out, eye, along(glow, colourOf(look, BODY, 0.55 * opacity)));
  if (core > 0) ribbon(out, eye, along(core, colourOf(look, HOT, opacity)));
}

/** A line lying on the ground along `points`, `width` metres across, in one colour. */
export function groundStrip(out: number[], points: readonly Point[], width: number, colour: Colour): void {
  for (let index = 0; index + 1 < points.length; index++) {
    const [from, to] = [points[index], points[index + 1]];
    if (!from || !to) continue;
    const apart = Math.hypot(to[0] - from[0], to[1] - from[1]);
    if (apart < 1e-6) continue;
    const [sideX, sideY] = [(-(to[1] - from[1]) / apart) * (width / 2), ((to[0] - from[0]) / apart) * (width / 2)];
    const quad = [
      [from[0] - sideX, from[1] - sideY, from[2] + LIFT],
      [to[0] - sideX, to[1] - sideY, to[2] + LIFT],
      [to[0] + sideX, to[1] + sideY, to[2] + LIFT],
      [from[0] + sideX, from[1] + sideY, from[2] + LIFT],
    ];
    for (const corner of [0, 1, 2, 0, 2, 3]) out.push(...(quad[corner] ?? []), ...colour);
  }
}

/** A trail along `points` (newest first, each with its age in seconds) lasting `lasts` seconds, turned to `eye`: in
 *  three steps of its age, each narrower, darker and fainter than the one before, `scale` times as wide. */
export function trailLine(
  out: number[],
  eye: Point,
  points: readonly { readonly at: Point; readonly age: number }[],
  look: GlowElement,
  lasts: number,
  scale = 1,
): void {
  TRAIL_STEPS.forEach(({ width, stop, opacity }, step) => {
    const inStep = points.filter((point, index) => {
      const own = stepOf(point.age / lasts, TRAIL_STEPS.length);
      const before = stepOf((points[index - 1]?.age ?? 0) / lasts, TRAIL_STEPS.length);
      return own === step || before === step;
    });
    if (inStep.length > 1)
      ribbon(
        out,
        eye,
        inStep.map(({ at }) => ({ at, width: width * scale, colour: colourOf(look, stop, opacity) })),
      );
  });
}

/** Where each thing that leaves a trail has been lately, by its number: newest first, each place with the clock's
 *  seconds it was there. */
export class Tails {
  private readonly kept = new Map<number, { at: Point; time: number }[]>();

  /** Takes that `id` is at `where` at `time` and answers where it has been within `lasts` seconds, newest first, each
   *  with its age. A clock gone back starts the trail over. */
  add(id: number, where: Point, time: number, lasts: number): { at: Point; age: number }[] {
    const places = (this.kept.get(id) ?? []).filter((place) => place.time <= time && time - place.time <= lasts);
    places.unshift({ at: where, time });
    this.kept.set(id, places);
    return places.map((place) => ({ at: place.at, age: time - place.time }));
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
