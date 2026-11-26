// Little figures typed as letters, for the scenes that show the captain: lying on the shore, sinking in the deep.
import { stamp, type Ink, type Sheet } from './sheet.ts';

/** Little figures typed as letters: `d` dark, `m` mid, `l` lit. */
const FIGURES = {
  lying: [
    '...dd.....................',
    '..dlld....................',
    '..dlld.dddddddddd.........',
    '...ddddmmmmmmmmmmdddddddd.',
    '....ddmmmmmmmmmmmmmmmmmddd',
    '.dddd.ddddddddddddddddd.dd',
    '.........................d',
  ],
  sinking: [
    'd...........d',
    '.d.........d.',
    '..d.......d..',
    '..d..ddd..d..',
    '...d.dld.d...',
    '....ddldd....',
    '.....ddd.....',
    '....ddddd....',
    '...dmmmmmd...',
    '...dmmmmmd...',
    '...ddmmmdd...',
    '..dddmmmddd..',
    '..dd.ddd.dd..',
    '....dd.dd....',
    '....d...d....',
    '....d...d....',
    '...dd...dd...',
  ],
} as const;

/** A figure drawn two cells to each of its letters, so it reads at the size a scene shows it. */
export function figure(
  sheet: Sheet,
  kind: keyof typeof FIGURES,
  x: number,
  y: number,
  inks: readonly [Ink, Ink, Ink],
): void {
  stamp(sheet, FIGURES[kind], [x, y], { d: inks[0], m: inks[1], l: inks[2] }, 2);
}
