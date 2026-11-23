// The waking over the wake's first seconds: the view darkening and lightening as eyes blink slowly open, pulsing
// darker with each beat of the heart until they are open, and clearing as they find their focus, a step at each beat,
// each beat throbbing the view a little.
import { HEART_BEAT_S } from '../../cinema/ambience.ts';

/** When the eyes are open for good, seconds into the wake. */
export const OPEN_S = 6.5;
/** How dark the view is over the first seconds, a slow blinking awake: [seconds, dark]. */
const BLINKS: readonly (readonly [number, number])[] = [
  [0, 1],
  [1.1, 0.45],
  [1.9, 1],
  [3.1, 0.25],
  [3.7, 0.85],
  [5.2, 0.05],
  [OPEN_S, 0],
];
/** How much darker each beat of the heart pulses the view while the eyes open, at its strongest. */
const PULSE = 0.3;
/** The blur the eyes wake to, CSS pixels, and how much each beat of the heart throbs it again. */
const BLUR_PX = 9;
const THROB_BLUR = 0.3;
/** How much of a beat's step clearer the view takes, a share of the beat, and how fast a throb dies away, seconds. */
const STEP_SHARE = 0.35;
const THROB_FADE_S = 0.1;
/** The heart's second thump, seconds after its first, and how strong it is against it: the voice's own. */
const DUB = { afterS: 0.28, share: 0.7 } as const;

const smooth = (share: number): number => {
  const clamped = Math.min(1, Math.max(0, share));
  return clamped * clamped * (3 - 2 * clamped);
};

/** How dark the view is `time` seconds into a waking, eased between the blinks; with `heart`, the seconds into the
 *  heart's beating, each beat pulses it darker, less as the eyes open, none once they are. */
export function darkAt(time: number, heart?: number): number {
  let dark = 0;
  for (let index = 1; index < BLINKS.length; index++) {
    const [after, shut] = BLINKS[index] ?? [0, 0];
    const [before, was] = BLINKS[index - 1] ?? [0, 0];
    if (time <= after) {
      dark = was + (shut - was) * smooth((time - before) / (after - before));
      break;
    }
  }
  if (heart === undefined || time >= OPEN_S) return dark;
  return Math.min(1, dark + pulseAt(heart) * (1 - time / OPEN_S));
}

/** How much darker a beat of the heart `heart` seconds into its beating takes the view, at its strongest. */
export function pulseAt(heart: number): number {
  return PULSE * throbAt(heart);
}

/** The heart's throb `heart` seconds into its beating, 0 to 1: up at each thump of a beat, gone within a fifth of a
 *  second. */
export function throbAt(heart: number): number {
  const into = ((heart % HEART_BEAT_S) + HEART_BEAT_S) % HEART_BEAT_S;
  const lub = Math.exp(-into / THROB_FADE_S);
  const dub = into >= DUB.afterS ? DUB.share * Math.exp(-(into - DUB.afterS) / THROB_FADE_S) : 0;
  return Math.max(lub, dub);
}

/** How far the view is blurred `since` seconds into the wake, the heart `heart` seconds into its beating, CSS pixels:
 *  it clears a step just after each beat and holds between them, a beat behind the heart, clear soon after the eyes
 *  are open, and never ahead of `since`. */
export function blurAt(since: number, heart: number): number {
  const beats = heart / HEART_BEAT_S;
  const stepped = Math.max(0, Math.floor(beats) - 1 + smooth((beats % 1) / STEP_SHARE)) * HEART_BEAT_S;
  const cleared = Math.min(1, Math.max(0, Math.min(stepped, since) / OPEN_S));
  return BLUR_PX * (1 - cleared) ** 2 * (1 + THROB_BLUR * throbAt(heart));
}
