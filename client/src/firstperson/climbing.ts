import { type FrameSource, type Picture, layOver, paintSet } from './fpFrames.ts';
import { hardened } from './heldPictures.ts';
import type { Hand } from './handsLaw.ts';

/** The climbing arm's two series: the fist on the wall, from holding the stone (0) to open, and the arm reaching out,
 *  from curled (0) to open. Each frame is the painting it was fitted to (its width and height), grown by a pad (left,
 *  top, right, bottom, in the painting's pixels) so open fingers have room. Both paintings are a left arm. */
export const CLIMB_ART = {
  grip: { frames: 6, width: 105, height: 152, pad: [4, 44, 6, 0] },
  reach: { frames: 5, width: 183, height: 114, pad: [0, 14, 12, 6] },
} as const;
type Series = keyof typeof CLIMB_ART;
/** The garments the climbing arm wears, laid in order: the sleeve, then the glove. */
const CLIMB_GARMENTS = ['linen', 'gauntlet'] as const;

export const climbPath = (garment: string, frame: number, series: Series = 'grip') =>
  `@art/climb/${garment}/${series}-${frame}.png`;

/** A series' frame for a hand `open` 0 (holding, or curled) to 1 (open): the nearest. */
export function climbFrame(open: number, series: Series = 'grip'): number {
  return Math.round(Math.min(1, Math.max(0, open)) * (CLIMB_ART[series].frames - 1));
}

/** The climbing arm's frame of a series, its sleeve under its glove, as the forge drew it: no dye, no palette. */
export async function climbPicture(
  source: FrameSource,
  frame: number,
  hands: string | null = null,
  series: Series = 'grip',
): Promise<Picture | null> {
  // In a set's gauntlets the whole arm is the set's, dyed as its fists are.
  const arm = hands ? await source.strip(climbPath(hands, frame, series)) : null;
  if (arm)
    return {
      width: arm.width,
      height: arm.height,
      pixels: paintSet(source, arm, hands, 'Iron'),
      at: [0, 0],
    };
  const strips = await Promise.all(CLIMB_GARMENTS.map((garment) => source.strip(climbPath(garment, frame, series))));
  const [sleeve, glove] = strips;
  if (!sleeve || !glove || glove.width !== sleeve.width || glove.height !== sleeve.height) return null;
  const pixels = hardened(sleeve);
  layOver(pixels, hardened(glove));
  return { width: sleeve.width, height: sleeve.height, pixels, at: [0, 0] };
}

/** Where a climbing arm's painting lies with its top left at (`x`, `y`) on the design surface, drawn `height` tall: a
 *  left arm, so the right is its mirror, and its pad is mirrored with it. */
export function climbPlace(series: Series, hand: Hand, x: number, y: number, height: number) {
  return () => {
    const art = CLIMB_ART[series];
    const scale = height / art.height;
    const [padLeft, padTop, padRight, padBottom] = art.pad;
    const [left, right] = hand === 'right' ? [padRight, padLeft] : [padLeft, padRight];
    return {
      x: x - left * scale,
      y: y - padTop * scale,
      width: (art.width + left + right) * scale,
      height: height + (padTop + padBottom) * scale,
      flip: hand === 'right',
    };
  };
}
