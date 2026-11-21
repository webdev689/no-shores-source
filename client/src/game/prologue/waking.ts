// The waking eyes over the wake's first seconds: the lids blinking slowly open, warm light coming through them while
// they are shut, and the view clearing as the eyes find their focus, a step at each beat of the heart that thumps over
// it, each beat throbbing the view a little.
import { HEART_BEAT_S } from '../../cinema/ambience.ts';

/** When the eyes are open for good, seconds into the wake. */
export const OPEN_S = 6.5;
/** The lids' shut share over the first seconds, a slow blinking awake: [seconds, shut]. */
const BLINKS: readonly (readonly [number, number])[] = [
  [0, 1],
  [1.1, 0.45],
  [1.9, 1],
  [3.1, 0.25],
  [3.7, 0.85],
  [5.2, 0.05],
  [OPEN_S, 0],
];
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

/** The lids' shut share at `time`, eased between the blinks. */
export function lidsAt(time: number): number {
  for (let index = 1; index < BLINKS.length; index++) {
    const [after, shut] = BLINKS[index] ?? [0, 0];
    const [before, was] = BLINKS[index - 1] ?? [0, 0];
    if (time <= after) return was + (shut - was) * smooth((time - before) / (after - before));
  }
  return 0;
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
 *  it clears by the time the eyes are open, most of each step just after a beat, and never ahead of `since`, which
 *  holds while the wreck the eyes open on is still coming. */
export function blurAt(since: number, heart: number): number {
  const beats = heart / HEART_BEAT_S;
  const stepped = (Math.floor(beats) + smooth((beats % 1) / STEP_SHARE)) * HEART_BEAT_S;
  const cleared = Math.min(1, Math.max(0, Math.min(stepped, since) / (OPEN_S + 1)));
  return BLUR_PX * (1 - cleared) ** 2 * (1 + THROB_BLUR * throbAt(heart));
}

/** How much light comes through the shut lids, 0 to 1: the fires' warm glow, swelling a little with each beat. */
export function lightAt(heart: number): number {
  return 0.85 + 0.15 * throbAt(heart);
}
