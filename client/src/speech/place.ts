// Where an overhead stands and how it shows, kept apart from the page so it can be tested: a glyph or a bark is centred
// over its speaker's head point, on whole pixels so the pixel art and the face stay crisp.

/** The gap between a head point and the foot of what stands over it, and between a glyph and a bark above it. */
export const GAP_PX = 8;
/** How long a bark stands once typed, then how long it takes to fade: fight-life's one-second bark. */
export const BARK_HOLD_S = 1;
export const FADE_S = 0.2;

/** The top-left corner, in CSS pixels, of something `size` wide and high standing over `head`, raised `lift` more. */
export function overheadPlace(
  head: readonly [number, number],
  size: readonly [number, number],
  lift: number,
): [number, number] {
  return [Math.round(head[0] - size[0] / 2), Math.round(head[1] - GAP_PX - lift - size[1])];
}

/** The whole step a glyph is drawn at on a screen `height` CSS pixels tall: the tallest glyph about 1/16 of it, so it
 *  stands well over the 22 px words of a bark. */
export function glyphScale(height: number): number {
  return Math.max(2, Math.floor(height / 240));
}

/** A bark's opacity: whole while it is typed and held, then fading out. */
export function barkOpacity(typed: boolean, sinceTypedS: number): number {
  if (!typed) return 1;
  return Math.max(0, Math.min(1, (BARK_HOLD_S + FADE_S - sinceTypedS) / FADE_S));
}

/** An emote's opacity `ageS` into its life. */
export function emoteOpacity(life: { lifeS: number; fadeInS: number; fadeOutS: number }, ageS: number): number {
  return Math.max(0, Math.min(1, ageS / life.fadeInS, (life.lifeS - ageS) / life.fadeOutS));
}
