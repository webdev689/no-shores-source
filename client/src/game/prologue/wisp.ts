// The wisp, one of the Stormcallers' hounds ("The Old Beacon Rolls", "The Six Hounds": the size of an apple, the
// colour at the heart of a gas flame, drifting as if waiting), shown and never explained: how long each part of its
// coming lasts (where it flies is `wispCourse.ts`), and its look, in Volt's colours as the fight's own spells are
// drawn: a white-blue core, a soft halo, a trail of motes and small arcs crackling off it; and, as it engulfs them,
// arcs wrapping the figure and a ring of Volt pushing out over the deck.
import { boltLine, colourOf, jagged, lineRibbon } from '../../combat/spellLines.ts';
import { GLOW_RAMPS } from '../../elementGlow.ts';
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
/** A figure's height and its girth, for the arcs that wrap it; and how far the ring of Volt pushes out over the
 *  deck. */
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

/** Its light on what is near it: Volt's body, reaching a few metres and strengthening as it brightens; and the
 *  engulfing's flash, near white, wider and far stronger, fading as the flash does. */
const LIGHT_REACH_M = [2.5, 5] as const;
const LIGHT_STRENGTH = [0.5, 1.6] as const;
const FLASH_REACH_M = 9;
const FLASH_STRENGTH = 4;

/** The light the wisp throws now, `flash` (0 to 1) the engulfing's flash as it fades: from where it is, how far it
 *  reaches (metres) and its colour, already as strong as it shines; none once it is gone and the flash has faded. */
export function wispLight(
  now: WispNow,
  flash: number,
): { readonly at: Point; readonly reachM: number; readonly light: readonly [number, number, number] } | null {
  const glow = now.part === 'gone' ? 0 : now.glow;
  if (glow <= 0 && flash <= 0) return null;
  const [body, white] = [GLOW_RAMPS[VOLT][1], GLOW_RAMPS[VOLT][3]];
  const strength = (LIGHT_STRENGTH[0] + (LIGHT_STRENGTH[1] - LIGHT_STRENGTH[0]) * glow) * (glow > 0 ? 1 : 0);
  const lit = (axis: 0 | 1 | 2) => body[axis] * strength + white[axis] * FLASH_STRENGTH * flash;
  const light = [lit(0), lit(1), lit(2)] as const;
  const reachM = LIGHT_REACH_M[0] + (LIGHT_REACH_M[1] - LIGHT_REACH_M[0]) * glow + FLASH_REACH_M * flash;
  return { at: now.at, reachM, light };
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

/** Nearer than this (metres) its halo is laid as discs of light (`HALO_DISCS`) rather than dithered. */
const NEAR_HALO_M = 4;
/** Its halo near: six discs half a cell fine, the inner in Volt's body, the outer in its dark, so the light added
 *  falls off in fine steps from its heart to the halo's edge. */
const HALO_DISCS: readonly Sprite[] = [5, 8, 11, 13.5, 16, 18].map((radius, index) =>
  sprite(37, 37, (across, up) => (Math.hypot(across, up) <= radius ? (index < 3 ? BODY : DARK) : CLEAR)),
);

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
  const opacity = -0.25 - 0.3 * glow;
  const cell = CELL_M * (0.9 + 0.5 * glow);
  const apart = Math.hypot(now.at[0] - eye[0], now.at[1] - eye[1], now.at[2] - eye[2]);
  if (apart > NEAR_HALO_M) billboard(out, HALO, VOLT, now.at, eye, { opacity, cell });
  // Near, where a dithered cell would show as a block, discs of light half a cell fine, each adding less outward.
  else
    HALO_DISCS.forEach((disc, index) =>
      billboard(out, disc, VOLT, now.at, eye, { opacity: opacity * (0.55 - index * 0.06), cell: cell / 2 }),
    );
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
  // Arcs, not a cage: each wraps part of the figure from its own height, thrown about afresh at each strike.
  for (let wrap = 0; wrap < 4; wrap++) {
    const points: Point[] = [];
    const spin = seconds * 9 + hashOf(strike, wrap, 3) * 2 * Math.PI;
    const from = hashOf(strike, wrap, 4) * 0.5;
    const span = 0.35 + 0.5 * hashOf(strike, wrap, 5);
    const girth = GIRTH_M * (0.75 + 0.5 * fading);
    for (let joint = 0; joint <= 9; joint++) {
      const share = from + (joint / 9) * span;
      const angle = spin + (joint / 9) * 1.6 * Math.PI;
      const jitter = (hashOf(strike, wrap, joint) - 0.5) * 0.3;
      points.push([
        feet[0] + Math.cos(angle) * (girth + jitter),
        feet[1] + Math.sin(angle) * (girth + jitter),
        feet[2] + 0.05 + share * (HEIGHT_M + 0.15) + jitter * 0.4,
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
