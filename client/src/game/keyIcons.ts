// The mouse's buttons and the arrow keys drawn as small pixel pictures, for the key strip and the sheet of every
// control: a mouse with the button named lit in brass, and an arrow on its keycap (the pad's are `padIcons.ts`). Each
// is a map of letters, a row of texels a line, so a picture is read as it looks.
import { TONES } from '../plus/tones.ts';
import type { Node } from '../ui/node.ts';
import { colourOf } from '../ui/quads.ts';

/** The mouse: `l` its left button, `r` its right, `w` the wheel between them, `f` and `k` its forward and back side
 *  buttons on the left of its body, `b` the body, and `a` an arrow beside it. */
const MOUSE = [
  '.llwrr.',
  'lllwrrr',
  'lllwrrr',
  'lll.rrr',
  '.......',
  'fbbbbbb',
  'fbbbbbb',
  'kbbbbbb',
  'kbbbbbb',
  '.bbbbb.',
  '..bbb..',
];
/** A drag: the mouse with a two-headed arrow beside it. */
const ARROW_ROWS: Readonly<Record<number, string>> = { 5: '.a...a.', 6: 'aaaaaaa', 7: '.a...a.' };
const DRAG = MOUSE.map((row, line) => `${row}.${ARROW_ROWS[line] ?? '.......'}`);
const LEFT_ARROW = ['...a...', '..aa...', '.aaaaaa', 'aaaaaaa', '.aaaaaa', '..aa...', '...a...'];
const RIGHT_ARROW = LEFT_ARROW.map((row) => [...row].reverse().join(''));
/** The left arrow turned a quarter: its columns read top down, as the up arrow's rows. */
const UP_ARROW = LEFT_ARROW.map((unused, column) => LEFT_ARROW.map((row) => row[column] ?? '.').join(''));
const DOWN_ARROW = [...UP_ARROW].reverse();

/** Each drawn key by the name the strip and the sheet give it: its map, the letters lit in brass, and whether it is a
 *  key (drawn on its keycap) rather than the mouse. */
const ICONS: Readonly<Record<string, { rows: readonly string[]; lit: string; key?: boolean }>> = {
  'Left button': { rows: MOUSE, lit: 'l' },
  'Right button': { rows: MOUSE, lit: 'r' },
  'Wheel': { rows: MOUSE, lit: 'w' },
  'Middle button': { rows: MOUSE, lit: 'w' },
  'Drag': { rows: DRAG, lit: 'la' },
  'Forward side button': { rows: MOUSE, lit: 'f' },
  'Back side button': { rows: MOUSE, lit: 'k' },
  'Left arrow': { rows: LEFT_ARROW, lit: '', key: true },
  'Right arrow': { rows: RIGHT_ARROW, lit: '', key: true },
  'Up arrow': { rows: UP_ARROW, lit: '', key: true },
  'Down arrow': { rows: DOWN_ARROW, lit: '', key: true },
};

/** `rows` a texel larger each way, every clear texel beside a drawn one an `o`: the dark edge a mouse keeps over the
 *  world, as the strip's words keep their halo. */
export function outlined(rows: readonly string[]): string[] {
  const width = (rows[0]?.length ?? 0) + 2;
  const padded = ['.'.repeat(width), ...rows.map((row) => `.${row}.`), '.'.repeat(width)];
  const drawn = (line: number, column: number) => (padded[line]?.[column] ?? '.') !== '.';
  return padded.map((row, line) =>
    [...row]
      .map((letter, column) => {
        if (letter !== '.') return letter;
        const beside = drawn(line - 1, column) || drawn(line + 1, column);
        return beside || drawn(line, column - 1) || drawn(line, column + 1) ? 'o' : '.';
      })
      .join(''),
  );
}

/** The RGBA texels of `rows`: `lit` letters in brass, an `o` in the kit's outline, the wheel dark and the rest in
 *  `rest`. */
export function iconPixels(rows: readonly string[], lit: string, rest: string): Uint8Array {
  const width = rows[0]?.length ?? 0;
  const pixels = new Uint8Array(width * rows.length * 4);
  // The wheel unlit is a dark slot, so the two buttons stand apart.
  const unlit = (letter: string) => (letter === 'o' ? TONES.outline : letter === 'w' ? TONES.stoneDim : rest);
  const toneOf = (letter: string) => (lit.includes(letter) ? TONES.brassHi : unlit(letter));
  rows.forEach((row, line) =>
    [...row].forEach((letter, column) => {
      if (letter === '.') return;
      const [red, green, blue] = colourOf(toneOf(letter));
      pixels.set(
        [red, green, blue, 1].map((channel) => Math.round(channel * 255)),
        (line * width + column) * 4,
      );
    }),
  );
  return pixels;
}

/** Whether `name` is drawn as the mouse, with no keycap round it. */
export const isMouse = (name: string): boolean => name in ICONS && !ICONS[name]?.key;

/** The picture of the key or button `name` beside words at `size` steps of the face: an arrow's texels each `size`
 *  CSS pixels a side, the mouse's a pixel more, so it stands as tall as a keycap; null for a key written in words.
 *  `onCap`, it stands on a keycap the cap's height holds: every texel `size` pixels, the mouse with no dark edge of
 *  its own, the cap's ground being dark. */
export function iconNode(name: string, size: number, onCap = false): Node | null {
  const icon = ICONS[name];
  if (!icon) return null;
  const rows = icon.key || onCap ? icon.rows : outlined(icon.rows);
  const width = rows[0]?.length ?? 0;
  const rest = icon.key ? '#efe8d6' : TONES.stoneLit;
  const texel = icon.key || onCap ? size : size + 1;
  return {
    width: width * texel,
    height: rows.length * texel,
    picture: {
      key: `key icon ${name}${onCap && !icon.key ? ' on cap' : ''}`,
      source: { pixels: () => iconPixels(rows, icon.lit, rest) },
      pixel: { width, height: rows.length },
    },
  };
}
