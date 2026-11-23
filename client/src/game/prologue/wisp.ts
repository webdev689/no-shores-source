// The wisp, one of the Stormcallers' hounds ("The Old Beacon Rolls", "The Six Hounds": the size of an apple, the
// colour at the heart of a gas flame, drifting as if waiting), shown and never explained. Its course: in from over the
// water, wandering the quiet deck at a mast's height, then circling the player in tightening rings, faster and
// brighter, until it engulfs them. Its look, in Volt's colours as the fight's own spells are drawn: a white-blue core,
// a soft halo, a trail of motes and small arcs crackling off it; and, as it engulfs them, arcs wrapping the figure and
// a ring of Volt pushing out over the deck.
import { boltLine, colourOf, jagged, lineRibbon } from '../../combat/spellLines.ts';
import { STRIKE_HZ, VOLT } from '../../combat/spellPlaces.ts';
import {
  BODY,
  CELL_M,
  CLEAR,
  DARK,
  GLINTS,
  HOT,
  type Laid,
  LIGHT,
  MOTES,
  billboard,
  hashOf,
  sprite,
  type Sprite,
} from '../../combat/spellPixels.ts';

type Point = readonly [number, number, number];

/** How long each part of its course lasts, seconds: in over the water, about the deck (the two 7.4 s together),
 *  circling the player, and engulfing them; then the camera eases back over the shoulder. */
export const WISP_S = { drift: 2.6, wander: 4.8, circle: 3.4, engulf: 1.4, back: 1.2 } as const;
/** When it engulfs the player and its whole length, seconds from its coming. */
export const ENGULF_AT_S = WISP_S.drift + WISP_S.wander + WISP_S.circle;
export const WISP_LENGTH_S = ENGULF_AT_S + WISP_S.engulf + WISP_S.back;
/** The flash in the engulfing, seconds into it: the Storm is given then, and the ring of Volt pushes out from it. */
export const FLASH_IN_S = 0.45;
/** Where it comes from (metres out over the water from the player, and up), the height it wanders at over the deck,
 *  its rings round the player (widest and narrowest, metres) and how fast they turn (radians a second). */
const FROM_M = 34;
const FROM_UP_M = 9;
const MAST_UP_M = 5.5;
const RING_M = [3.2, 0.45] as const;
const TURN = [1.6, 9] as const;
/** The height of a chest over the feet (metres), where its rings close; a figure's height and its girth, for the
 *  arcs that wrap it; and how far the ring of Volt pushes out over the deck. */
const CHEST_M = 1.15;
const HEIGHT_M = 1.9;
const GIRTH_M = 0.42;
const RING_OUT_M = 7;

export type WispPart = 'drift' | 'wander' | 'circle' | 'engulf' | 'gone';

/** The wisp `seconds` into its coming: where it is, which part of its course, and how bright (0 to 1). */
export interface WispNow {
  readonly at: Point;
  readonly part: WispPart;
  readonly glow: number;
}

/** The course it flies: where it comes from over the water, the places over the deck it wanders by, and the feet of
 *  the player it circles. */
export interface WispCourse {
  readonly from: Point;
  readonly over: readonly Point[];
  readonly feet: Point;
}

const eased = (share: number) => {
  const clamped = Math.min(1, Math.max(0, share));
  return clamped * clamped * (3 - 2 * clamped);
};
const mix = (from: Point, to: Point, share: number): Point => [
  from[0] + (to[0] - from[0]) * share,
  from[1] + (to[1] - from[1]) * share,
  from[2] + (to[2] - from[2]) * share,
];

/** The course round a player standing at `feet` facing `facing` (radians, 0 north): in from the water off their
 *  left, across before them at a mast's height, behind them and round to their right, low over the deck. */
export function wispCourse(feet: Point, facing: number): WispCourse {
  const [ahead, right] = [
    [Math.sin(facing), -Math.cos(facing)],
    [Math.cos(facing), Math.sin(facing)],
  ] as const;
  const placed = (forward: number, side: number, up: number): Point => [
    feet[0] + ahead[0] * forward + right[0] * side,
    feet[1] + ahead[1] * forward + right[1] * side,
    feet[2] + up,
  ];
  return {
    from: placed(FROM_M * 0.6, -FROM_M * 0.8, FROM_UP_M),
    over: [
      placed(7, -4, MAST_UP_M),
      placed(9, 3, MAST_UP_M + 1),
      placed(3, 6, 3.5),
      placed(-4, 3, 4.5),
      placed(-3, -4, 2.6),
    ],
    feet,
  };
}

/** A point along a smooth way through `points` (Catmull-Rom), `share` of the way from the first to the last. */
function along(points: readonly Point[], share: number): Point {
  const legs = points.length - 1;
  const place = Math.min(legs, Math.max(0, share * legs));
  const leg = Math.min(legs - 1, Math.floor(place));
  const local = place - leg;
  const point = (index: number): Point => points[Math.min(legs, Math.max(0, index))] ?? [0, 0, 0];
  const [before, start, end, after] = [point(leg - 1), point(leg), point(leg + 1), point(leg + 2)];
  const [square, cube] = [local * local, local * local * local];
  const axis = (index: 0 | 1 | 2) =>
    0.5 *
    (2 * start[index] +
      (end[index] - before[index]) * local +
      (2 * before[index] - 5 * start[index] + 4 * end[index] - after[index]) * square +
      (3 * start[index] - before[index] - 3 * end[index] + after[index]) * cube);
  return [axis(0), axis(1), axis(2)];
}

/** The wisp `seconds` into its coming on `course`: drifting in as if waiting, a slow bob on it throughout. */
export function wispAt(course: WispCourse, seconds: number): WispNow {
  const bob = (amount: number): Point => [
    Math.sin(seconds * 1.3) * amount * 0.4,
    Math.cos(seconds * 0.9) * amount * 0.4,
    Math.sin(seconds * 2.1) * amount,
  ];
  const plus = (point: Point, shift: Point): Point => [point[0] + shift[0], point[1] + shift[1], point[2] + shift[2]];
  const first = course.over[0] ?? course.feet;
  const last = course.over.at(-1) ?? course.feet;
  const { drift, wander, circle, engulf } = WISP_S;
  const chest: Point = [course.feet[0], course.feet[1], course.feet[2] + CHEST_M];
  if (seconds < drift)
    return { at: plus(mix(course.from, first, eased(seconds / drift)), bob(0.25)), part: 'drift', glow: 0.55 };
  if (seconds < drift + wander) {
    const share = (seconds - drift) / wander;
    return { at: plus(along(course.over, share), bob(0.3)), part: 'wander', glow: 0.6 + 0.1 * share };
  }
  const ringAt = (into: number) => {
    const share = Math.min(1, into / circle);
    // Its turn is the integral of a speed climbing from the first to the last, so it never jumps.
    const turned = TURN[0] * into + ((TURN[1] - TURN[0]) * Math.min(into, circle) ** 2) / (2 * circle);
    const radius = RING_M[0] + (RING_M[1] - RING_M[0]) * eased(share);
    const start = Math.atan2(last[1] - chest[1], last[0] - chest[0]);
    const rise = (1 - share) * (last[2] - chest[2]) + Math.sin(into * 5) * 0.15 * (1 - share);
    const angle = start + turned;
    return [chest[0] + Math.cos(angle) * radius, chest[1] + Math.sin(angle) * radius, chest[2] + rise] as Point;
  };
  if (seconds < ENGULF_AT_S) {
    const into = seconds - drift - wander;
    // Eased in from where it wandered to, so the first ring takes it up where it was.
    const joined = mix(last, ringAt(into), eased(into / 0.6));
    return { at: joined, part: 'circle', glow: 0.7 + 0.3 * (into / circle) };
  }
  if (seconds < ENGULF_AT_S + engulf) {
    const into = seconds - ENGULF_AT_S;
    return { at: mix(ringAt(circle), chest, eased(into / FLASH_IN_S)), part: 'engulf', glow: 1 };
  }
  return { at: chest, part: 'gone', glow: 0 };
}

/** Its core: 11 cells across, white-hot in the middle with flecks of it in Volt's light round it, its body broken and
 *  its rim no more than a few cells of dark, each afresh at each `strike`, so it flickers as a flame's heart does. */
const CORES = new Map<number, Sprite>();
function coreSprite(strike: number): Sprite {
  const struck = ((strike % 8) + 8) % 8;
  let found = CORES.get(struck);
  if (!found) {
    found = sprite(11, 11, (across, up) => {
      const apart = Math.hypot(across, up);
      const fleck = hashOf(struck, across, up);
      if (apart <= 1.3) return HOT;
      if (apart <= 2.4) return fleck < 0.3 ? HOT : LIGHT;
      if (apart <= 3.5) return fleck < 0.2 ? LIGHT : fleck < 0.85 ? BODY : CLEAR;
      if (apart <= 4.8) return fleck < 0.3 ? DARK : CLEAR;
      return CLEAR;
    });
    CORES.set(struck, found);
  }
  return found;
}
/** Its halo, 19 cells across, laid as light added to what is behind it: dithered thinner band by band outward, so it
 *  fades softly into the dark with no edge of its own. */
const HALO: Sprite = sprite(19, 19, (across, up) => {
  const apart = Math.hypot(across, up);
  const dither = hashOf(7, across, up);
  if (apart <= 2.6) return BODY;
  if (apart <= 4.4) return dither < 0.7 ? BODY : DARK;
  if (apart <= 6.5) return dither < 0.55 ? DARK : CLEAR;
  if (apart <= 9) return dither < 0.22 ? DARK : CLEAR;
  return CLEAR;
});

/** How long its trail of motes lasts (seconds), how many, and how far they fall away as they fade (metres). */
const TRAIL_S = 0.9;
const TRAIL_MOTES = 14;
const MOTE_FALL_M = 0.25;

/** Lays the wisp as an eye at `eye` sees it at `clock` seconds, `now` where and how bright it is, `trail` where it was
 *  lately (each with its age, seconds, newest first). */
export function layWisp(
  out: Laid,
  now: WispNow,
  trail: readonly { readonly at: Point; readonly age: number }[],
  eye: Point,
  clock: number,
): void {
  if (now.part === 'gone') return;
  const strike = Math.floor(clock * STRIKE_HZ);
  const glow = now.glow;
  // The trail: motes left behind, cooling and falling away as they age.
  for (let mote = 0; mote < TRAIL_MOTES; mote++) {
    const age = (mote / TRAIL_MOTES) * TRAIL_S;
    const point = trail.find((each) => each.age >= age);
    if (!point) break;
    const share = age / TRAIL_S;
    const drift: Point = [
      point.at[0] + (hashOf(mote, strike >> 2, 1) - 0.5) * 0.3 * share,
      point.at[1] + (hashOf(mote, strike >> 2, 2) - 0.5) * 0.3 * share,
      point.at[2] - MOTE_FALL_M * share,
    ];
    // The newest a glint's small cross, cooling to single motes as they fall away.
    const stop = share < 0.3 ? HOT : share < 0.6 ? LIGHT : BODY;
    const picture = (share < 0.45 ? GLINTS[stop] : MOTES[stop]) ?? STAR_MOTE;
    billboard(out, picture, VOLT, drift, eye, { opacity: 1 - share * 0.6, cell: CELL_M * 1.2 });
  }
  billboard(out, HALO, VOLT, now.at, eye, { opacity: -0.25 - 0.3 * glow, cell: CELL_M * (0.9 + 0.5 * glow) });
  billboard(out, coreSprite(strike), VOLT, now.at, eye, { cell: CELL_M * (0.6 + 0.25 * glow) });
  // Small arcs crackling off it, two to four a strike, reaching out past its halo, longer as it brightens.
  const arcs = 2 + (hashOf(strike, 9) < glow ? 1 : 0) + (hashOf(strike, 10) < glow - 0.5 ? 1 : 0);
  for (let arc = 0; arc < arcs; arc++) {
    const turn = hashOf(strike, arc, 1) * 2 * Math.PI;
    const lift = (hashOf(strike, arc, 2) - 0.5) * 1.4;
    const reach = 0.3 + 0.45 * glow * (0.4 + 0.6 * hashOf(strike, arc, 3));
    const to: Point = [
      now.at[0] + Math.cos(turn) * reach,
      now.at[1] + Math.sin(turn) * reach,
      now.at[2] + lift * reach,
    ];
    const points = jagged(now.at, to, 5, reach * 0.3, strike * 5 + arc);
    boltLine(out, eye, points, VOLT, { core: 0.011, glow: 0.035, opacity: 0.95 });
  }
}
const STAR_MOTE: Sprite = sprite(1, 1, () => HOT);

/** Lays the engulfing `seconds` into it round a figure standing at `feet`: arcs wrapping it from its feet to over its
 *  head, turning and tightening, and from the flash a ring of Volt pushing out over the deck, fading as it goes. */
export function layEngulf(out: Laid, feet: Point, eye: Point, seconds: number): void {
  if (seconds < 0 || seconds > WISP_S.engulf) return;
  const strike = Math.floor(seconds * STRIKE_HZ * 1.5);
  const fading = seconds < FLASH_IN_S ? 1 : 1 - (seconds - FLASH_IN_S) / (WISP_S.engulf - FLASH_IN_S);
  for (let wrap = 0; wrap < 5; wrap++) {
    const points: Point[] = [];
    const spin = seconds * 9 + (wrap * 2 * Math.PI) / 5;
    const girth = GIRTH_M * (0.75 + 0.5 * fading);
    for (let joint = 0; joint <= 12; joint++) {
      const share = joint / 12;
      const angle = spin + share * 2.6 * Math.PI;
      const jitter = (hashOf(strike, wrap, joint) - 0.5) * 0.12;
      points.push([
        feet[0] + Math.cos(angle) * (girth + jitter),
        feet[1] + Math.sin(angle) * (girth + jitter),
        feet[2] + 0.05 + share * (HEIGHT_M + 0.15),
      ]);
    }
    boltLine(out, eye, points, VOLT, { core: 0.014, glow: 0.05, opacity: fading });
  }
  if (seconds < FLASH_IN_S) return;
  const share = (seconds - FLASH_IN_S) / (WISP_S.engulf - FLASH_IN_S);
  const radius = 0.6 + (RING_OUT_M - 0.6) * (1 - (1 - share) ** 2);
  const ring: Point[] = [];
  for (let joint = 0; joint <= 48; joint++) {
    const angle = (joint / 48) * 2 * Math.PI;
    const across = radius + (hashOf(strike, joint % 48) - 0.5) * 0.25;
    ring.push([feet[0] + Math.cos(angle) * across, feet[1] + Math.sin(angle) * across, feet[2] + 0.12]);
  }
  lineRibbon(out, eye, ring, 0.32, colourOf(VOLT, BODY, 0.7 * (1 - share)));
  lineRibbon(out, eye, ring, 0.1, colourOf(VOLT, share < 0.4 ? HOT : LIGHT, 1 - share));
}
