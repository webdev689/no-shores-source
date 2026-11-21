// The Test Ground's panels as the interface draws them: their look (dark surfaces, flat presses, dim hints), the
// pieces every panel builds from (a title, a heading, a hint, a press, a row with its name, a drop-down list, a
// field), and the two panels laid either side of the view.
import { choice, slider, toggle } from '../ui/controls.ts';
import type { Child, Node } from '../ui/node.ts';
import type { Interface } from '../ui/ui.ts';
import { copyText } from '../ui/page.ts';

/** The panels' colours. */
export const LOOK = {
  page: '#0b0d10',
  panel: '#14181d',
  line: '#2a3038',
  rule: '#222a33',
  words: '#e8e8e8',
  white: '#ffffff',
  dim: '#9aa4b0',
  soft: '#b4bcc6',
  press: '#222a33',
  pressLine: '#36404c',
  active: '#3b5b7d',
  activeLine: '#6f9fd1',
} as const;

/** The Test Ground's title. */
export const title = (words: string): Node => ({ text: { words, size: 2 }, padding: [0, 0, PARAGRAPH, 0] });

/** A section's heading: small capitals, spaced, dim. */
export const heading = (words: string): Node => ({
  text: { words: words.toUpperCase(), colour: LOOK.dim, tracking: 3 },
  padding: [12, 0, 2, 0],
});

/** A paragraph's room under it, past the panel's gap: paragraphs stand 11 px apart. */
const PARAGRAPH = 7;

/** A paragraph, dimmed unless `colour` says. */
export const hint = (words: string, colour: string = LOOK.dim): Node => ({
  text: { words, colour },
  padding: [0, 0, PARAGRAPH, 0],
});

/** Plain words, in `colour` if given. */
export const line = (words: string, colour?: string): Node => ({ text: colour ? { words, colour } : { words } });

/** A press with words: `run` when pressed; `active` marks the one picked; `disabled` takes no press. */
export function press(
  ui: Interface,
  id: string,
  words: string,
  run: () => void,
  more: { readonly active?: boolean; readonly disabled?: boolean; readonly width?: Node['width'] } = {},
): Node {
  if (ui.clicked(id) && !more.disabled) run();
  const lit = ui.hovered(id) || (ui.keyFocused && ui.focused(id));
  return {
    id,
    press: true,
    label: more.active ? `${words}, picked` : words,
    disabled: more.disabled,
    width: more.width,
    padding: [5, 8],
    fill: more.active ? LOOK.active : LOOK.press,
    outline: { width: 1, colour: more.active || lit ? LOOK.activeLine : LOOK.pressLine },
    children: [{ text: { words, colour: more.disabled ? LOOK.dim : LOOK.words } }],
  };
}

/** Presses side by side, running on into more lines. */
export const presses = (children: readonly Child[]): Node => ({ gap: 6, wrap: true, width: 'grow', children });

/** `made` ringed while the keys' focus is on it, so the keys' place is seen. */
const ringed = (ui: Interface, made: Node): Node =>
  made.id && ui.keyFocused && ui.focused(made.id) ? { ...made, outline: { width: 1, colour: LOOK.activeLine } } : made;

/** The interface's toggle, ringed while focused by the keys. */
export function tick(ui: Interface, id: string, words: string, ticked: boolean): { node: Node; ticked: boolean } {
  const made = toggle(ui, id, words, ticked);
  return { ...made, node: ringed(ui, made.node) };
}

/** The interface's slider, ringed while focused by the keys. */
export function slide(
  ui: Interface,
  id: string,
  value: number,
  range: Parameters<typeof slider>[3],
): { node: Node; value: number } {
  const made = slider(ui, id, value, range);
  return { ...made, node: ringed(ui, made.node) };
}

/** A control with its name before it, on one row; the control takes the room left. */
export const labelled = (words: string, control: Child, nameWidth = 92): Node => ({
  gap: 6,
  width: 'grow',
  minHeight: 20,
  alignY: 'center',
  children: [{ minWidth: nameWidth, text: { words, wrap: false } }, control],
});

/** A list of `[value, words]` options, one chosen, that calls `onPick` with a value picked; answers its node. */
export function pick(
  ui: Interface,
  id: string,
  options: readonly (readonly [string, string])[],
  value: string,
  onPick: (value: string) => void,
  disabled = false,
): Node {
  const made = choice(
    ui,
    id,
    value,
    options.map(([key, words]) => ({ value: key, words })),
  );
  if (made.chosen !== value && !disabled) onPick(made.chosen);
  // Its words kept to one line, cut short where they run past it.
  const [words, ...rest] = made.node.children ?? [];
  const shown = words && words.text ? { ...words, text: { ...words.text, ellipsis: true } } : words;
  return {
    ...made.node,
    children: [shown, ...rest],
    padding: [2, 6],
    width: 'grow',
    disabled,
    opacity: disabled ? 0.4 : 1,
  };
}

/** A field for words or a number, named `label` for a screen reader; `numberIn` reads a number from it. */
export const field = (
  id: string,
  label: string,
  more: { readonly placeholder?: string; readonly width?: Node['width'] } = {},
): Node => ({
  id,
  role: 'well',
  width: more.width ?? 'grow',
  height: 20,
  padding: [0, 6],
  label,
  field: { placeholder: more.placeholder },
});

/** Words to copy, wrapped as plain words: a press puts them on the clipboard, as the drawn words cannot be selected. */
export function copyLine(ui: Interface, id: string, words: string, label: string): Node {
  if (ui.clicked(id)) copyText(words);
  return { id, press: true, label: `${label}: ${words}. Press to copy.`, children: [{ text: { words } }] };
}

/** The number typed in field `id`, `initial` until it is typed in, held between `least` and `most`; `fallback` for
 *  words that are no number. */
export function numberIn(
  ui: Interface,
  id: string,
  initial: number,
  least: number,
  most: number,
  fallback = least,
): number {
  const words = ui.fieldText(id, String(initial)).trim();
  const typed = Number(words);
  return Math.min(most, Math.max(least, words !== '' && Number.isFinite(typed) ? typed : fallback));
}

/** The panels' widths either side of the view `width` (CSS pixels), 22% of it between
 *  220 and 320 on the left, 24% between 240 and 360 on the right. */
export function sides(width: number): { readonly left: number; readonly right: number } {
  const clamp = (share: number, least: number, most: number) =>
    Math.round(Math.min(most, Math.max(least, share * width)));
  return { left: clamp(0.22, 220, 320), right: clamp(0.24, 240, 360) };
}

/** A panel's column: its sections down a scrolled, dark side. */
const side = (id: string, width: number, children: readonly Child[]): Node => ({
  id,
  width,
  height: 'grow',
  fill: LOOK.panel,
  scroll: true,
  solid: true,
  direction: 'column',
  padding: [12, 14],
  gap: 4,
  children,
});

/** The two panels, `left` and `right`, either side of the view, a line between each and the view. */
export function panels(ui: Interface, left: readonly Child[], right: readonly Child[]): Node {
  const width = sides(ui.size.width);
  const rule: Node = { width: 1, height: 'grow', fill: LOOK.line };
  return {
    width: 'grow',
    height: 'grow',
    children: [
      side('tg:left', width.left - 1, left),
      rule,
      { width: 'grow', height: 'grow' },
      rule,
      side('tg:right', width.right - 1, right),
    ],
  };
}
