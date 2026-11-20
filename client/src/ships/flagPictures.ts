// The flags the ships fly, a picture a side: her side's ground over a faint weave, and her faction's emblem, the one
// the plates show, in its middle at whole multiples of its pixels. A flag is half again as long as it is deep, and
// its picture square, so the emblem is drawn two texels a pixel across and three down to stand square on it.
import { emblemPixels } from '../plus/emblems.ts';
import { hash01 } from '../textures/noise.ts';
import type { Picture } from '../textures/picture.ts';
import { SHIP_PICTURE_TEXELS } from '../textures/shipPictures.ts';
import { type Colour, colourOf, DRESSES, SHIP_SIDES } from './dress.ts';

/** Texels an emblem's pixel takes across and down the flag's picture. */
const EMBLEM_TEXELS = [2, 3] as const;

/** One picture a side, in `SHIP_SIDES`' order: the same bytes every time. */
export function flagPictures(): Picture[] {
  return SHIP_SIDES.map((side, index) => {
    const size = SHIP_PICTURE_TEXELS;
    const dress = DRESSES[side];
    const rgba = new Uint8Array(size * size * 4);
    const paint = (x: number, y: number, colour: readonly number[]) => {
      const weave = 1 + ((x + y) & 1) * 0.03 + (hash01(7000 + index, x, y) - 0.5) * 0.06;
      colour.forEach((channel, place) => {
        rgba[(y * size + x) * 4 + place] = Math.round(Math.min(1, channel * weave) * 255);
      });
      rgba[(y * size + x) * 4 + 3] = 255;
    };
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) paint(x, y, dress.flag);
    const emblem = dress.emblem === null ? null : emblemPixels(dress.emblem);
    if (emblem) {
      const [across, down] = EMBLEM_TEXELS;
      const width = (emblem.rows[0]?.length ?? 0) * across;
      const [left, top] = [(size - width) >> 1, (size - emblem.rows.length * down) >> 1];
      emblem.rows.forEach((row, pixelY) =>
        [...row].forEach((letter, pixelX) => {
          const tone = emblem.tones[letter];
          if (!tone) return;
          const shade = tinted(colourOf(tone), dress.emblemTint);
          for (let y = 0; y < down; y++)
            for (let x = 0; x < across; x++) paint(left + pixelX * across + x, top + pixelY * down + y, shade);
        }),
      );
    }
    return { width: size, height: size, rgba, glass: null };
  });
}

/** An emblem's tone on a flag that tints it: the tint, lighter or darker as the tone is, so its shading stays. */
function tinted(tone: Colour, tint: Colour | null): Colour {
  if (!tint) return tone;
  const light = 0.75 + (tone[0] + tone[1] + tone[2]) / 6;
  return [tint[0] * light, tint[1] * light, tint[2] * light];
}
