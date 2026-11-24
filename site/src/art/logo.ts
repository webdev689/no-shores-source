// The owner's logo, drawn cell for cell from the game's own pixel picture of it, and the tab's icon cut from it.
import { LOGO } from '../../../client/src/cinema/logoPicture.ts';
import type { PixelPicture } from '../../../client/src/combat/dropPictures.ts';
import { box, makeSheet, type Sheet } from './sheet.ts';

/** A pixel picture as a sheet, one cell to one pixel; its letters name its colours, 'a' the first. */
export function pictureSheet(picture: PixelPicture): Sheet {
  const width = Math.max(...picture.rows.map((row) => row.length));
  const sheet = makeSheet(width, picture.rows.length);
  picture.rows.forEach((text, row) => {
    for (let col = 0; col < text.length; col++) {
      const ink = picture.colours[(text.codePointAt(col) ?? 0) - 'a'.charCodeAt(0)];
      if (ink) sheet.cells[row * width + col] = ink;
    }
  });
  return sheet;
}

export const logoSheet = (): Sheet => pictureSheet(LOGO);

/** The night the icon's mark stands on, the site's own deepest blue. */
const ICON_GROUND = '#0a1222';

/** The logo's first letter ends at this column: the next one is where the "o" begins. */
const FIRST_LETTER_COLUMNS = 49;

/**
 * The tab's icon: the logo's first letter, centred on the night in a square. The whole logo is four times as wide as
 * it is tall and would be a smudge at 32 pixels; its first letter still reads.
 */
export function iconSheet(): Sheet {
  const logo = logoSheet();
  const size = logo.height + 8;
  const sheet = makeSheet(size, size);
  box(sheet, 0, 0, size, size, ICON_GROUND);
  const top = Math.round((size - logo.height) / 2);
  const left = Math.round((size - FIRST_LETTER_COLUMNS) / 2);
  for (let row = 0; row < logo.height; row++)
    for (let col = 0; col < FIRST_LETTER_COLUMNS; col++) {
      const ink = logo.cells[row * logo.width + col];
      if (ink) sheet.cells[(top + row) * size + left + col] = ink;
    }
  return sheet;
}
