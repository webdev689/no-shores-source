// A barding's tile, as the Appearance screen and the Tack draw it: the horse's head and chest from the side wearing
// it, at one texel a pixel, cut round the bare horse's ears, so every barding frames the same head whatever rises
// above them (Wraith Mist's wisps, Dawnfire's flame).

import type { Cards } from '../../player/cards.ts';
import type { Dress } from '../../player/dressing.ts';
import type { Picture } from '../../player/picture.ts';
import type { Picture as NodePicture } from '../../ui/node.ts';
import { horseOf, pictureName } from './appearanceDisplay.ts';

/** A tile's picture, in pixels: the menu's cell's. */
const TILE_PX = 48;

/** How far above the ears a tile's cut may start, at least and at most: room for a crest, and the head kept in. */
const HEADROOM = [4, 16] as const;

/** Where a tile `size` square is cut from `worn`: round the topmost texel of `bare` (the horse's ears), the two lined
 *  up by their roots, starting where `worn` first draws above that head (a barding's crest or flame), between 4 and 16
 *  texels above the ears; null where the bare horse draws nothing. */
export function earsCut(bare: Picture, worn: Picture, size = TILE_PX): readonly [number, number] | null {
  const top = bare.pixels.findIndex((value, byte) => byte % 4 === 3 && value !== 0);
  if (top < 0) return null;
  const [bareX, bareY] = bare.root ?? [0, 0];
  const [wornX, wornY] = worn.root ?? [0, 0];
  const column = ((top >> 2) % bare.width) - bareX + wornX;
  const ears = Math.floor((top >> 2) / bare.width) - bareY + wornY;
  const left = Math.max(0, Math.min(worn.width - size, column - size / 2));
  const drawnAt = (row: number) =>
    Array.from({ length: size }, (_unused, step) => left + step).some(
      (x) => (worn.pixels[(row * worn.width + x) * 4 + 3] ?? 0) !== 0,
    );
  const [least, most] = HEADROOM;
  let row = Math.max(0, ears - most);
  while (row < ears - least && !drawnAt(row)) row += 1;
  return [left, Math.max(0, row)];
}

/** Each barding's tile once cut, by what it draws. */
const cut = new Map<string, Uint8Array>();

/** The tile of the horse `dress` rides in `barding` (by its id; the bare horse for its start piece or none), 48
 *  texels a side kept whole; null while it is drawn, or with no forge or dress. */
export function bardingPicture(forge: Cards | null, dress: Dress | null, barding: string | null): NodePicture | null {
  if (!forge || !dress) return null;
  const bare = horseOf(forge, { ...dress, outfit: { ...dress.outfit, barding: null } });
  const worn = horseOf(forge, { ...dress, outfit: { ...dress.outfit, barding } });
  if (!bare || !worn) return null;
  const key = `barding ${pictureName(worn)} ${pictureName(bare)}`;
  let pixels = cut.get(key);
  if (!pixels) {
    const place = earsCut(bare, worn);
    if (!place) return null;
    pixels = new Uint8Array(TILE_PX * TILE_PX * 4);
    // A horse narrower or shorter than the tile leaves the rest of it clear, as a canvas drawn past its edge does.
    const across = Math.min(TILE_PX, worn.width - place[0]) * 4;
    for (let row = 0; row < TILE_PX && place[1] + row < worn.height; row++) {
      const from = ((place[1] + row) * worn.width + place[0]) * 4;
      pixels.set(worn.pixels.subarray(from, from + across), row * TILE_PX * 4);
    }
    cut.set(key, pixels);
  }
  const shown = pixels;
  return { key, source: { pixels: () => shown }, pixel: { width: TILE_PX, height: TILE_PX } };
}
