// What the interfaces that hear a page's canvas show, for a tool reading and driving the game headless, as it once
// read the page's HTML: `__ui()`, on the page or the game's worker, lists each laid node with an id, words or a label.
import type { Interface } from './ui.ts';

/** A node as shown: its box clipped to what shows, in the page's CSS pixels from the canvas's corner. */
export interface Seen {
  readonly id?: string;
  readonly words?: string;
  readonly label?: string;
  readonly press?: true;
  readonly disabled?: true;
  readonly focused?: true;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

const seeing = new Set<Interface>();
Object.assign(globalThis, { __ui: () => [...seeing].flatMap(seenIn) });

/** `ui`, listed by `__ui()` from now on. */
export function seen(ui: Interface): Interface {
  seeing.add(ui);
  return ui;
}

/** What `ui` laid last frame and shows, in drawing order. */
export function seenIn(ui: Interface): Seen[] {
  return ui.laid.flatMap(({ node, box, clip, fade }) => {
    const words =
      typeof node.text?.words === 'string' ? node.text.words : node.text?.words.map((span) => span.words).join('');
    const [left, top] = [Math.max(box.x, clip.x), Math.max(box.y, clip.y)];
    const right = Math.min(box.x + box.width, clip.x + clip.width);
    const bottom = Math.min(box.y + box.height, clip.y + clip.height);
    if ((!node.id && !words && !node.label) || fade <= 0 || right <= left || bottom <= top) return [];
    const css = (pixels: number) => pixels / ui.inward;
    return [
      {
        ...(node.id && { id: node.id }),
        ...(words && { words }),
        ...(node.label && { label: node.label }),
        ...(node.press && { press: true as const }),
        ...(node.disabled && { disabled: true as const }),
        ...(node.id && ui.focused(node.id) && { focused: true as const }),
        ...{ x: css(left), y: css(top), width: css(right - left), height: css(bottom - top) },
      },
    ];
  });
}
