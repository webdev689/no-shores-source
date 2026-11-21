// The keys the game draws for typing by touch or by the pad, where no keyboard is at hand ("The Interface Uses No
// HTML, Now or Later"): they open over the view when a field is taken by a touch or the pad, type into it as a
// keyboard's keys would, and go once the field loses the focus, a keyboard's key is pressed, B is, or Done is.
import { erased, type FieldState, typed } from './field.ts';
import type { Child, Node } from './node.ts';
import type { Box } from './quads.ts';

/** The id every key is laid under, its name after it. */
export const SCREEN_KEY = 'screen-key:';

/** The keys, row by row; a letter is a capital while Shift is on. */
const ROWS: readonly (readonly string[])[] = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', '-'],
  ['shift', 'z', 'x', 'c', 'v', 'b', 'n', 'm', '.', 'back'],
  ['@', '_', '!', '?', 'space', '#', '&', 'done'],
];

/** What a key that is not a character says, on it and to a screen reader. */
const NAMES: Readonly<Record<string, string>> = { shift: 'Shift', back: 'Back', space: 'Space', done: 'Done' };

/** The keys open: the field they type into, whether Shift is on, and where the pad's cross stands on them. */
export interface ScreenKeys {
  readonly field: string;
  readonly shift: boolean;
  readonly row: number;
  readonly column: number;
}

/** The keys opened for `field`, the pad's cross on the first letter. */
export const keysFor = (field: string): ScreenKeys => ({ field, shift: false, row: 1, column: 0 });

/** The name of the key the pad's cross stands on. */
export const keyAt = (keys: ScreenKeys): string => ROWS[keys.row]?.[keys.column] ?? 'done';

/** What a key's press says to a screen reader. */
export const keyLabel = (key: string, shift: boolean): string => NAMES[key] ?? (shift ? key.toUpperCase() : key);

/** The pad's cross moved a key across or a row down, held at the edges; a row's last key stands under a longer
 *  row's end. */
export function movedOn(keys: ScreenKeys, across: number, down: number): ScreenKeys {
  const row = Math.max(0, Math.min(ROWS.length - 1, keys.row + down));
  const width = ROWS[row]?.length ?? 1;
  const column = Math.max(0, Math.min(width - 1, keys.column + across));
  return { ...keys, row, column };
}

/** What pressing `key` does: the field's words after it, the keys after it (null once they go), and whether it
 *  was Enter's. */
export function pressed(
  keys: ScreenKeys,
  key: string,
  state: FieldState,
  most: number,
): { readonly state: FieldState; readonly keys: ScreenKeys | null; readonly submit: boolean } {
  if (key === 'shift') return { state, keys: { ...keys, shift: !keys.shift }, submit: false };
  if (key === 'back') return { state: erased(state, -1), keys, submit: false };
  if (key === 'done') return { state, keys: null, submit: true };
  const character = key === 'space' ? ' ' : keys.shift ? key.toUpperCase() : key;
  // Shift is for one letter, as a phone's is.
  return { state: typed(state, character, most), keys: { ...keys, shift: false }, submit: false };
}

/** The keys laid over the view `view` (CSS pixels): at its foot, or its head where the field `over` stands low,
 *  so the field stays in sight; the key the pad's cross stands on lit while the pad drives them. */
export function screenKeysNode(keys: ScreenKeys, view: Box, over: Box | null, padDriven: boolean): Node {
  const low = over !== null && over.y + over.height / 2 > view.height / 2;
  const width = Math.min(view.width - 16, 560);
  const keyNode = (key: string, rowIndex: number, column: number): Child => {
    const named = NAMES[key];
    const lit = padDriven && rowIndex === keys.row && column === keys.column;
    return {
      id: `${SCREEN_KEY}${key}`,
      press: true,
      focusable: false,
      label: keyLabel(key, keys.shift),
      role: key === 'done' ? 'primary' : 'button',
      state: lit ? 'hover' : key === 'shift' && keys.shift ? 'active' : undefined,
      width: key === 'space' ? 'grow' : named ? 64 : 'grow',
      height: 34,
      alignX: 'center',
      alignY: 'center',
      children: [
        {
          text: { words: named ?? (keys.shift ? key.toUpperCase() : key), size: named ? 1 : 2, wrap: false },
          through: true,
        },
      ],
    };
  };
  return {
    id: 'screen-keys',
    role: 'window',
    direction: 'column',
    gap: 4,
    padding: 8,
    width,
    float: { to: 'screen', anchor: [0.5, low ? 0 : 1], at: [0.5, low ? 0 : 1], y: low ? 8 : -8, z: 90 },
    children: ROWS.map((row, rowIndex) => ({
      width: 'grow',
      gap: 4,
      children: row.map((key, column) => keyNode(key, rowIndex, column)),
    })),
  };
}
