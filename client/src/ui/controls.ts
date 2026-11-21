// The interface's common controls, built of nodes, for every screen to share: a press with words, a toggle, a slider
// and a choice from a list. Each reads the interface for what was done to it this frame and answers its node.
import { TONES } from '../plus/tones.ts';
import type { Node } from './node.ts';
import type { Interface } from './ui.ts';

/** The tallest a choice's open list stands before it scrolls, CSS pixels. */
const LIST_HEIGHT = 240;

/** A press with words, in the kit's `role`; `run` when it is pressed. */
export function button(
  ui: Interface,
  id: string,
  words: string,
  run: () => void,
  more: {
    readonly role?: 'button' | 'primary' | 'warn' | 'tile' | 'chip';
    readonly disabled?: boolean;
  } & Partial<Node> = {},
): Node {
  if (ui.clicked(id) && !more.disabled) run();
  return {
    id,
    press: true,
    role: more.role ?? 'button',
    padding: [4, 10],
    label: words,
    alignX: 'center',
    alignY: 'center',
    ...more,
    children: [{ text: { words } }],
  };
}

/** A box ticked or not, with its words; answers the node and whether it is ticked now. */
export function toggle(ui: Interface, id: string, words: string, ticked: boolean): { node: Node; ticked: boolean } {
  const now = ui.clicked(id) ? !ticked : ticked;
  return {
    ticked: now,
    node: {
      id,
      press: true,
      label: `${words}: ${now ? 'on' : 'off'}`,
      gap: 6,
      alignY: 'center',
      children: [
        {
          role: 'well',
          width: 12,
          height: 12,
          padding: 3,
          children: [now && { width: 'grow', height: 'grow', fill: TONES.brassHi }],
        },
        { text: { words } },
      ],
    },
  };
}

/** A value from `low` to `high` in steps of `step`, set by dragging along its track or by the arrows with focus;
 *  answers the node and the value now. */
export function slider(
  ui: Interface,
  id: string,
  value: number,
  range: { readonly low: number; readonly high: number; readonly step: number; readonly width?: number },
): { node: Node; value: number } {
  const { low, high, step } = range;
  // Held to the decimals of the step and the low end, so 0.05's steps read 0.4, not 0.39999999999999997.
  const places = (value: number) => (`${value}`.split('.')[1] ?? '').length;
  const decimals = Math.min(20, Math.max(places(step), places(low)));
  const kept = (raw: number) =>
    Math.min(high, Math.max(low, Number((low + Math.round((raw - low) / step) * step).toFixed(decimals))));
  let now = value;
  const held = ui.drag(id);
  const box = ui.boxOf(id);
  if (held && box && box.width > 0) now = kept(low + ((held.x - box.x) / box.width) * (high - low));
  for (const key of ui.keysOn(id)) now = kept(now + (key === 'arrowleft' || key === 'arrowdown' ? -step : step));
  const share = high > low ? (now - low) / (high - low) : 0;
  return {
    value: now,
    node: {
      id,
      press: true,
      keys: ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'],
      label: `${now}`,
      role: 'track',
      width: range.width ?? 'grow',
      height: 10,
      padding: 2,
      children: [{ width: `${Math.round(share * 100)}%`, height: 'grow', fill: TONES.brass }],
    },
  };
}

/** One of `options` chosen from a list that opens under it; answers the node and the choice now. */
export function choice(
  ui: Interface,
  id: string,
  chosen: string,
  options: readonly { readonly value: string; readonly words: string }[],
): { node: Node; chosen: string } {
  let now = chosen;
  let open = ui.store.get(id) === true;
  if (ui.clicked(id)) open = !open;
  for (const option of options)
    if (ui.clicked(`${id}:${option.value}`)) {
      now = option.value;
      open = false;
    }
  if (open && ui.escaped) open = false;
  ui.store.set(id, open);
  const words = options.find((option) => option.value === now)?.words ?? now;
  return {
    chosen: now,
    node: {
      id,
      press: true,
      role: 'button',
      padding: [4, 8],
      gap: 8,
      label: words,
      children: [
        { text: { words }, width: 'grow' },
        { text: { words: open ? '^' : 'v' } },
        open && {
          id: `${id}:list`,
          role: 'panel',
          direction: 'column',
          padding: 2,
          gap: 2,
          // A long list scrolls inside this height, so every option stays in reach.
          maxHeight: LIST_HEIGHT,
          scroll: true,
          float: { at: [0, 1], y: 2, z: 10 },
          children: options.map((option): Node => ({
            id: `${id}:${option.value}`,
            press: true,
            role: option.value === now ? 'primary' : 'tile',
            padding: [3, 8],
            width: 'grow',
            label: option.words,
            children: [{ text: { words: option.words } }],
          })),
        },
      ],
    },
  };
}
