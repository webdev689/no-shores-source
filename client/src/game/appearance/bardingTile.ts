// A barding's tile, as the Appearance screen and the Tack draw it: the horse's head and chest from the side wearing
// it, at one texel a pixel, cut round the bare horse's ears, so every barding frames the same head whatever rises
// above them (Wraith Mist's wisps, Dawnfire's flame).

import { make } from '../../editor/dom.ts';
import type { Cards } from '../../player/cards.ts';
import type { Dress } from '../../player/dressing.ts';
import type { Picture } from '../../player/picture.ts';
import { horseOf } from './appearanceDisplay.ts';

/** A tile's picture, in pixels: the menu's cell's. */
const TILE_PX = 48;

/** Where a tile `size` square is cut from `worn`: round the topmost texel of `bare` (the horse's ears), the two lined
 *  up by their roots; null where the bare horse draws nothing. */
export function earsCut(bare: Picture, worn: Picture, size = TILE_PX): readonly [number, number] | null {
  const top = bare.pixels.findIndex((value, byte) => byte % 4 === 3 && value !== 0);
  if (top < 0) return null;
  const [bareX, bareY] = bare.root ?? [0, 0];
  const [wornX, wornY] = worn.root ?? [0, 0];
  const column = ((top >> 2) % bare.width) - bareX + wornX;
  const row = Math.floor((top >> 2) / bare.width) - bareY + wornY;
  return [Math.max(0, Math.min(worn.width - size, column - size / 2)), Math.max(0, row)];
}

/** The tile of the horse `dress` rides in `barding` (by its id; the bare horse for its start piece or none). */
export function bardingTile(
  forge: Cards | null,
  dress: Dress | null,
  barding: string | null,
  className = 'appearance-mark',
): HTMLCanvasElement {
  const canvas = make('canvas', '', className);
  [canvas.width, canvas.height] = [TILE_PX, TILE_PX];
  if (!forge || !dress) return canvas;
  const bare = { ...dress, outfit: { ...dress.outfit, barding: null } };
  const worn = { ...dress, outfit: { ...dress.outfit, barding } };
  void Promise.all([horseOf(forge, bare), horseOf(forge, worn)]).then(([ears, picture]) => {
    const cut = ears && picture && earsCut(ears, picture);
    if (!picture || !cut) return;
    const own = document.createElement('canvas');
    [own.width, own.height] = [picture.width, picture.height];
    own.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(picture.pixels), picture.width), 0, 0);
    canvas.getContext('2d')?.drawImage(own, cut[0], cut[1], TILE_PX, TILE_PX, 0, 0, TILE_PX, TILE_PX);
  });
  return canvas;
}
