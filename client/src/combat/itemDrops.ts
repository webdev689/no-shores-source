// An item found as itself lying on the ground for the player: its own picture as the gear screens draw it (a weapon
// the forge's large picture, dyed as its screens dye it; an armour piece as it is worn), laid as a drop's picture is.
// A weapon's longest side is a Vestige's crystal frame, so it grows and shrinks with the Vestige; an armour piece is
// its worn size, so a helm lies twice a head's size as a drop is drawn, not a sword's length.

import type { GearItem } from '../network/gearMessages.ts';
import type { Cards } from '../player/cards.ts';
import type { Dress } from '../player/dressing.ts';
import { PX_PER_M } from '../player/figures.ts';
import { SLOTS, isWeapon, slotOf } from '../player/gear.ts';
import { ItemPictures } from '../player/itemPictures.ts';
import type { Picture } from '../player/picture.ts';
import type { PixelPicture } from './dropPictures.ts';
import { crystalFrame } from './vestigeCrystal.ts';

/** How tall a Vestige's crystal frame stands, metres: an item lying is as long as that. */
const crystal = crystalFrame(0, 0).body;
export const VESTIGE_M = crystal.rows.length * (crystal.pixelM ?? 0);

/** A picture's pixels drawn half covered or more. */
const COVERED = 128;

/** An item's pixel as it lies, metres: an armour piece's or a cloak's the figure's, as it is worn; none for a weapon,
 *  which is laid a Vestige's frame long. */
export const lyingPixelM = (kind: number): number | undefined =>
  !isWeapon(kind) && slotOf(kind) < SLOTS.length ? 1 / PX_PER_M : undefined;

/** A picture as a drop's, cropped to what it draws: each colour a letter (`a` the first), a clear pixel a dot, its
 *  pixel `pixelM`, else such that its longer side is a Vestige's frame. */
export function lyingPicture({ width, height, pixels }: Picture, pixelM?: number): PixelPicture {
  const drawn = (across: number, row: number) => (pixels[(row * width + across) * 4 + 3] ?? 0) >= COVERED;
  let [left, top, right, bottom] = [width, height, -1, -1];
  for (let row = 0; row < height; row++)
    for (let across = 0; across < width; across++)
      if (drawn(across, row))
        [left, top, right, bottom] = [
          Math.min(left, across),
          Math.min(top, row),
          Math.max(right, across),
          Math.max(bottom, row),
        ];
  if (right < 0) return { rows: [], colours: [] };
  const colours: string[] = [];
  const letters = new Map<string, string>();
  const rows: string[] = [];
  for (let row = top; row <= bottom; row++) {
    let line = '';
    for (let across = left; across <= right; across++) {
      if (!drawn(across, row)) {
        line += '.';
        continue;
      }
      const texel = (row * width + across) * 4;
      const hex = `#${[0, 1, 2].map((part) => (pixels[texel + part] ?? 0).toString(16).padStart(2, '0')).join('')}`;
      let letter = letters.get(hex);
      if (letter === undefined) {
        letter = String.fromCharCode(97 + colours.length);
        letters.set(hex, letter);
        colours.push(hex);
      }
      line += letter;
    }
    rows.push(line);
  }
  return { rows, colours, pixelM: pixelM ?? VESTIGE_M / Math.max(right - left + 1, bottom - top + 1) };
}

/** Each lying item's picture, asked of the forge for the player's own body (`ItemPictures`, as the gear screens draw
 *  it), null until it is drawn or while the forge or the body is not there. */
export function itemDropPictures(
  forge: () => Cards | null,
  body: () => Dress | null,
): (item: GearItem) => PixelPicture | null {
  let pictures: ItemPictures | null = null;
  const laid = new WeakMap<Picture, PixelPicture>();
  return (item) => {
    const [cards, dress] = [forge(), body()];
    if (!cards || !dress) return null;
    pictures ??= new ItemPictures(cards);
    const picture = pictures.pictureOf(item, dress, () => undefined);
    if (!picture) return null;
    const kept = laid.get(picture) ?? lyingPicture(picture, lyingPixelM(item.kind));
    laid.set(picture, kept);
    return kept;
  };
}
