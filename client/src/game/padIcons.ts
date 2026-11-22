// The pad's buttons drawn as small pixel pictures, for the key strip and the sheet of every control, in the style the
// mouse is drawn in (`keyIcons.ts`): a dark button with its letter lit in brass, a bumper and a trigger with theirs,
// a stick as a ring whose ways it is pushed are lit (its click a lit middle), the D-pad with the way pressed lit, and
// View and Start with their marks. Each is a map of letters made from a few shapes: `w` the button, `b` a stick's
// rim, `l` what is lit.
import type { Node } from '../ui/node.ts';
import { TONES } from '../plus/tones.ts';
import { iconPixels, outlined } from './keyIcons.ts';

/** The letters, three texels wide and five tall. */
const LETTERS: Readonly<Record<string, readonly string[]>> = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'],
  B: ['##.', '#.#', '##.', '#.#', '##.'],
  X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'],
  L: ['#..', '#..', '#..', '#..', '###'],
  R: ['##.', '#.#', '##.', '#.#', '#.#'],
  T: ['###', '.#.', '.#.', '.#.', '.#.'],
};

/** A square `across` texels a side holding a disc of `fill`. */
function disc(across: number, fill: string): string[] {
  const middle = (across - 1) / 2;
  return Array.from({ length: across }, (unused, row) =>
    Array.from({ length: across }, (empty, column) =>
      Math.hypot(column - middle, row - middle) <= middle + 0.3 ? fill : '.',
    ).join(''),
  );
}

/** `rows` with `over` laid on them from `left`, `top`: each of its `#` as `ink`, each other texel left as it was. */
function laid(rows: readonly string[], over: readonly string[], left: number, top: number, ink = 'l'): string[] {
  return rows.map((row, line) => {
    const mark = over[line - top];
    if (!mark) return row;
    return [...row].map((texel, column) => (mark[column - left] === '#' ? ink : texel)).join('');
  });
}

/** Letters side by side, a texel apart. */
const word = (letters: string): string[] =>
  [0, 1, 2, 3, 4].map((line) => [...letters].map((letter) => LETTERS[letter]?.[line] ?? '...').join('.'));

/** A face button: its letter lit on a dark disc. */
const face = (letter: string) => laid(disc(9, 'w'), word(letter), 3, 2);
/** A bumper, a wide rounded bar, and a trigger, taller with a rounded top: their letters lit. */
const BUMPER = ['.wwwwwwwww.', ...Array<string>(5).fill('wwwwwwwwwww'), '.wwwwwwwww.'];
const TRIGGER = ['...wwwww...', '.wwwwwwwww.', ...Array<string>(7).fill('wwwwwwwwwww')];
/** A stick: a rim round a dark middle with its letter; its ways lit on the rim, or its click, a lit middle. */
const RIM = laid(disc(11, 'b'), disc(7, '#'), 2, 2, 'w');
const WAYS: Readonly<Record<string, (column: number, row: number) => boolean>> = {
  up: (column, row) => row <= 1,
  down: (column, row) => row >= 9,
  left: (column) => column <= 1,
  right: (column) => column >= 9,
};
function stick(letter: string, ways: readonly string[]): string[] {
  const lit = RIM.map((row, line) =>
    [...row].map((texel, column) => (texel === 'b' && ways.some((way) => WAYS[way]?.(column, line)) ? 'l' : texel)),
  );
  return laid(
    lit.map((row) => row.join('')),
    word(letter),
    4,
    3,
  );
}
const click = (letter: string) => laid(laid(disc(11, 'b'), disc(7, '#'), 2, 2), word(letter), 4, 3, 'w');
/** The D-pad, a cross whose arms are three texels wide, the ways named lit. */
const CROSS = [
  '...www...',
  '...www...',
  '...www...',
  ...Array<string>(3).fill('wwwwwwwww'),
  '...www...',
  '...www...',
  '...www...',
];
const ARMS: Readonly<Record<string, (column: number, row: number) => boolean>> = {
  Up: (column, row) => row <= 2 && column >= 3 && column <= 5,
  Down: (column, row) => row >= 6 && column >= 3 && column <= 5,
  Left: (column, row) => column <= 2 && row >= 3 && row <= 5,
  Right: (column, row) => column >= 6 && row >= 3 && row <= 5,
};
const dpad = (ways: readonly string[]) =>
  CROSS.map((row, line) =>
    [...row]
      .map((texel, column) => (texel === 'w' && ways.some((way) => ARMS[way]?.(column, line)) ? 'l' : texel))
      .join(''),
  );
/** View: two windows overlapping; Start: three lines. */
const VIEW = [
  '.wwwwwww.',
  'wllllwwww',
  'wlwwlwwww',
  'wlwwllllw',
  'wllllwwlw',
  'wwwwlwwlw',
  'wwwwllllw',
  'wwwwwwwww',
  '.wwwwwww.',
];
const START = [
  '.wwwwwww.',
  'wwwwwwwww',
  'wlllllllw',
  'wwwwwwwww',
  'wlllllllw',
  'wwwwwwwww',
  'wlllllllw',
  'wwwwwwwww',
  '.wwwwwww.',
];

/** Each of the pad's pictures by the name it is bound or shown by. */
const PICTURES: Readonly<Record<string, readonly string[]>> = {
  A: face('A'),
  B: face('B'),
  X: face('X'),
  Y: face('Y'),
  LB: laid(BUMPER, word('LB'), 2, 1),
  RB: laid(BUMPER, word('RB'), 2, 1),
  LT: laid(TRIGGER, word('LT'), 2, 3),
  RT: laid(TRIGGER, word('RT'), 2, 3),
  LS: click('L'),
  RS: click('R'),
  'Left stick': stick('L', ['up', 'down', 'left', 'right']),
  'Right stick': stick('R', ['up', 'down', 'left', 'right']),
  'LS across': stick('L', ['left', 'right']),
  'LS along': stick('L', ['up', 'down']),
  'RS across': stick('R', ['left', 'right']),
  'RS along': stick('R', ['up', 'down']),
  ...Object.fromEntries(
    ['up', 'down', 'left', 'right'].flatMap((way) => [
      [`LS ${way}`, stick('L', [way])],
      [`RS ${way}`, stick('R', [way])],
    ]),
  ),
  Up: dpad(['Up']),
  Down: dpad(['Down']),
  Left: dpad(['Left']),
  Right: dpad(['Right']),
  'D-pad': dpad(['Up', 'Down', 'Left', 'Right']),
  View: VIEW,
  Start: START,
};

/** The picture of the pad's button `name` beside words at `size` steps of the face, each texel a pixel larger than
 *  the step, as the mouse's, and edged dark to read over the world; null for a name it has none for. `onCap`, it
 *  stands on a keycap the cap's height holds: every texel `size` pixels, with no dark edge of its own. */
export function padIconNode(name: string, size: number, onCap = false): Node | null {
  const shape = PICTURES[name];
  if (!shape) return null;
  const rows = onCap ? shape : outlined(shape);
  const width = rows[0]?.length ?? 0;
  const texel = onCap ? size : size + 1;
  return {
    width: width * texel,
    height: rows.length * texel,
    picture: {
      key: `pad icon ${name}${onCap ? ' on cap' : ''}`,
      source: { pixels: () => iconPixels(rows, 'l', TONES.stoneLit) },
      pixel: { width, height: rows.length },
    },
  };
}

/** The pad's names it draws. */
export const PAD_PICTURES: readonly string[] = Object.keys(PICTURES);
