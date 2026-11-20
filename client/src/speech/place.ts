// Where a bark stands and how it shows, kept apart from the page so it can be tested: it is centred over its speaker's
// head point, on whole pixels so the face stays crisp.

/** The gap between a head point and the foot of the bark over it. */
export const GAP_PX = 8;
/** How long a bark stands once typed, then how long it takes to fade: fight-life's one-second bark. */
export const BARK_HOLD_S = 1;
export const FADE_S = 0.2;

/** The top-left corner, in CSS pixels, of something `size` wide and high standing over `head`, kept within a view
 *  `width` wide, so words over a head near a side are moved in rather than cut off. */
export function overheadPlace(
  head: readonly [number, number],
  size: readonly [number, number],
  width = Infinity,
): [number, number] {
  const left = Math.round(head[0] - size[0] / 2);
  return [Math.max(0, Math.min(left, width - size[0])), Math.round(head[1] - GAP_PX - size[1])];
}

/** A head point moved down just far enough that what stands over it, `above` pixels of it, is under the view's top. */
export function underTheTop(head: readonly [number, number], above: number): readonly [number, number] {
  return head[1] >= above ? head : [head[0], above];
}

/** A bark's height on the page: one line of 22 px words (sheet.ts). */
export const BARK_PX = 22;

/** A bark's opacity: whole while it is typed and held, then fading out. */
export function barkOpacity(typed: boolean, sinceTypedS: number): number {
  if (!typed) return 1;
  return Math.max(0, Math.min(1, (BARK_HOLD_S + FADE_S - sinceTypedS) / FADE_S));
}
