// The logo, drawn cell for cell from the game's own pixel picture of it, and the tab's icon cut from it.
import { LOGO } from '../../../client/src/cinema/logoPicture.ts';
import type { PixelPicture } from '../../../client/src/combat/dropPictures.ts';
import { box, dot, fade, halo, makeSheet, type Sheet } from '../../../client/src/art/sheet.ts';

/** A pixel picture as a sheet, one cell to one pixel; its letters name its colours, 'a' the first. */
export function pictureSheet(picture: PixelPicture): Sheet {
  const width = Math.max(...picture.rows.map((row) => row.length));
  const sheet = makeSheet(width, picture.rows.length);
  picture.rows.forEach((text, row) => {
    for (let column = 0; column < text.length; column++) {
      const ink = picture.colours[(text.codePointAt(column) ?? 0) - 'a'.charCodeAt(0)];
      if (ink) sheet.cells[row * width + column] = ink;
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
    for (let column = 0; column < FIRST_LETTER_COLUMNS; column++) {
      const ink = logo.cells[row * logo.width + column];
      if (ink) sheet.cells[(top + row) * size + left + column] = ink;
    }
  return sheet;
}

/** The server icon's side before it is scaled: a pixel picture keeps its hard edges when drawn large. */
const SERVER_ICON_SIDE = 112;
/** Discord takes a server icon up to 1024 pixels square: 112 drawn nine times over is 1008. */
const SERVER_ICON_SCALE = 9;
/** A few stars, placed by hand where the round crop keeps them and the letter leaves the night clear. */
const SERVER_ICON_STARS: readonly (readonly [number, number])[] = [
  [26, 26],
  [83, 18],
  [92, 46],
  [18, 60],
  [88, 82],
  [30, 89],
];

/**
 * The Discord server's icon: the tab icon's letter on a night with the moon's halo behind it, sized so the round crop
 * Discord gives every server icon never reaches the letter's swash or tail.
 */
export function serverIconSheet(): Sheet {
  const logo = logoSheet();
  const small = makeSheet(SERVER_ICON_SIDE, SERVER_ICON_SIDE);
  fade(small, 0, SERVER_ICON_SIDE, ['#060a14', ICON_GROUND, '#0f1b31']);
  const middle = SERVER_ICON_SIDE / 2;
  halo(small, middle, middle, 48, ['#0e182c', '#132039', '#192a48']);
  for (const [x, y] of SERVER_ICON_STARS) dot(small, x, y, '#b4c1d6');
  const top = Math.round(middle - logo.height / 2);
  const left = Math.round(middle - FIRST_LETTER_COLUMNS / 2);
  for (let row = 0; row < logo.height; row++)
    for (let column = 0; column < FIRST_LETTER_COLUMNS; column++) {
      const ink = logo.cells[row * logo.width + column];
      if (ink) small.cells[(top + row) * SERVER_ICON_SIDE + left + column] = ink;
    }
  const side = SERVER_ICON_SIDE * SERVER_ICON_SCALE;
  const sheet = makeSheet(side, side);
  for (let row = 0; row < side; row++)
    for (let column = 0; column < side; column++)
      sheet.cells[row * side + column] =
        small.cells[Math.floor(row / SERVER_ICON_SCALE) * SERVER_ICON_SIDE + Math.floor(column / SERVER_ICON_SCALE)] ??
        '';
  return sheet;
}
