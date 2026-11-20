import { type FrameSource, type Picture, layOver, setRamp } from './fpFrames.ts';
import { DESIGN_HEIGHT, DESIGN_WIDTH } from './fpMotion.ts';
import { hardened } from './heldPictures.ts';
import type { Hand } from './handsLaw.ts';

/** The climbing hand's frames, from holding the stone (0) to open: each the painting it was fitted to, grown by a pad
 *  (left, top, right, bottom, in the painting's pixels) so open fingers have room. */
const GRIP = { frames: 6, paintingWidth: 105, paintingHeight: 152, pad: [4, 44, 6, 0] } as const;
/** The garments the climbing arm wears, laid in order: the sleeve, then the glove. */
const CLIMB_GARMENTS = ['linen', 'gauntlet'] as const;
/** The fists on the wall: each painting this tall, its middle this far either side of the screen's middle, and its
 *  sleeve this far under the screen's foot at rest, so no lift shows where it ends. */
const GRIP_HEIGHT = 150;
const GRIP_APART = 93;
const GRIP_SLACK = 34;

export const climbPath = (garment: string, frame: number) => `@art/climb/${garment}/grip-${frame}.png`;

/** The grip's frame for a hand `open` 0 (on the stone) to 1 (open): the nearest. */
export function gripFrame(open: number): number {
  return Math.round(Math.min(1, Math.max(0, open)) * (GRIP.frames - 1));
}

/** The climbing hand's frame, its sleeve under its glove, as the forge drew it: no dye, no palette. */
export async function gripPicture(
  source: FrameSource,
  frame: number,
  hands: string | null = null,
): Promise<Picture | null> {
  // In a set's gauntlets the whole arm is the set's, dyed as its fists are.
  const arm = hands ? await source.strip(climbPath(hands, frame)) : null;
  if (arm)
    return {
      width: arm.width,
      height: arm.height,
      pixels: source.painter.paint(arm, setRamp(source, hands, 'Iron')),
      at: [0, 0],
    };
  const strips = await Promise.all(CLIMB_GARMENTS.map((garment) => source.strip(climbPath(garment, frame))));
  const [sleeve, glove] = strips;
  if (!sleeve || !glove || glove.width !== sleeve.width || glove.height !== sleeve.height) return null;
  const pixels = hardened(sleeve);
  layOver(pixels, hardened(glove));
  return { width: sleeve.width, height: sleeve.height, pixels, at: [0, 0] };
}

const smooth = (share: number) => {
  const clamped = Math.min(1, Math.max(0, share));
  return clamped * clamped * (3 - 2 * clamped);
};

/** Where a hand on the wall lies with the hands `present` 0 (under the screen) to 1 (on the stone): the painting is a
 *  left hand, so the right is its mirror, and its pad is mirrored with it. The hands come up from under the screen. */
export function gripPlace(hand: Hand, present: number) {
  return () => {
    const width = (GRIP_HEIGHT * GRIP.paintingWidth) / GRIP.paintingHeight;
    const scale = GRIP_HEIGHT / GRIP.paintingHeight;
    const middle = DESIGN_WIDTH / 2 + (hand === 'right' ? GRIP_APART : -GRIP_APART);
    const enter = (1 - smooth(present)) * (GRIP_HEIGHT + GRIP_SLACK);
    const [padLeft, padTop, padRight, padBottom] = GRIP.pad;
    const [left, right] = hand === 'right' ? [padRight, padLeft] : [padLeft, padRight];
    return {
      x: middle - width / 2 - left * scale,
      y: DESIGN_HEIGHT - GRIP_HEIGHT + GRIP_SLACK + enter - padTop * scale,
      width: width + (left + right) * scale,
      height: GRIP_HEIGHT + (padTop + padBottom) * scale,
      flip: hand === 'right',
    };
  };
}
