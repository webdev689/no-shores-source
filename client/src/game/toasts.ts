// The HUD's toasts, drawn by the game: DFO's messages and the story's word to the player, each a chip over the middle
// of the view above the dialogue box's top, the newest last. A toast still said keeps the moment it came, so only a
// new one rises in.
import { TONES } from '../plus/tones.ts';
import { cubicBezier } from '../ui/ease.ts';
import type { Box } from '../ui/quads.ts';
import { paint } from '../ui/paint.ts';
import { lineHeight, widthOf, wrapped } from '../ui/text.ts';
import type { UiRenderer } from '../ui/uiRenderer.ts';
import type { Face } from '../ui/text.ts';

/** The most toasts that stand at once, the newest kept. */
export const MOST_TOASTS = 3;
/** The words' size: 22 px. */
const SIZE = 2;
/** CSS pixels: the words' room inside the bevel, the bevel, the gap between toasts, and the column's foot above the
 *  view's. */
const PAD = { across: 14, down: 4 };
const BORDER = 2;
const GAP = 4;
const FOOT = 268;
/** How long a toast takes to rise in, seconds, and how far it rises, CSS pixels. */
const RISE_S = 0.2;
const RISE = 6;
/** Narrow, while her ship's panel shows, the toasts stand right of it. */
const NARROW = 890;
const BESIDE_PANEL = 292;

/** A toast said, and when it came, seconds. */
export interface Toast {
  readonly text: string;
  readonly since: number;
}

/** The toasts said `now`, the newest `MOST_TOASTS`: one already shown keeps its moment; a new one comes at `clock`. */
export function keptToasts(shown: readonly Toast[], now: readonly string[], clock: number): Toast[] {
  return now.slice(-MOST_TOASTS).map((text) => shown.find((toast) => toast.text === text) ?? { text, since: clock });
}

/** A toast as laid: its chip's box and its lines' tops, in CSS pixels, and how far in it has come, 0 to 1. */
export interface LaidToast {
  readonly box: Box;
  readonly lines: readonly { readonly words: string; readonly x: number; readonly y: number }[];
  readonly come: number;
}

/** Lays `toasts` in a view `width` by `height` CSS pixels at `clock`: a column centred, its foot `FOOT` above the
 *  view's; narrow with her ship's panel shown, left-aligned right of the panel. Still when motion is reduced. */
export function layToasts(
  face: Face,
  toasts: readonly Toast[],
  view: { readonly width: number; readonly height: number; readonly panelShown: boolean },
  clock: number,
  still: boolean,
): LaidToast[] {
  const beside = view.panelShown && view.width <= NARROW;
  const most = beside ? view.width - (BESIDE_PANEL + 28) : view.width - 56;
  const inset = 2 * (PAD.across + BORDER);
  const tall = lineHeight(SIZE);
  const shaped = toasts.map((toast) => {
    const lines = wrapped(face, toast.text, SIZE, Math.max(1, most - inset));
    const widths = lines.map((line) => widthOf(face, line, SIZE));
    // A toast that wraps takes the column's whole width, as a browser's does.
    const width = lines.length > 1 ? most : Math.min(most, Math.max(...widths) + inset);
    return { toast, lines, widths, width, height: lines.length * tall + 2 * (PAD.down + BORDER) };
  });
  let top = view.height - FOOT - shaped.reduce((sum, each) => sum + each.height, 0) - GAP * (shaped.length - 1);
  return shaped.map(({ toast, lines, widths, width, height }) => {
    const x = beside ? BESIDE_PANEL : Math.round((view.width - width) / 2);
    const share = still ? 1 : Math.min(1, Math.max(0, (clock - toast.since) / RISE_S));
    const come = cubicBezier(0.16, 1, 0.3, 1, share);
    const box = { x, y: top, width, height };
    const laid = lines.map((words, index) => ({
      words,
      x: x + Math.round((width - (widths[index] ?? 0)) / 2),
      y: top + BORDER + PAD.down + index * tall,
    }));
    top += height + GAP;
    return { box, lines: laid, come };
  });
}

/** Draws `laid` with `ui` at `scale` device pixels a CSS pixel: each a chip, fading and rising in as it comes. */
export function drawToasts(ui: UiRenderer, laid: readonly LaidToast[], scale: number): void {
  for (const { box, lines, come } of laid) {
    const risen = Math.round((1 - come) * RISE);
    const placed = (left: number, top: number) => ({ x: left * scale, y: (top + risen) * scale });
    const device = { ...placed(box.x, box.y), width: box.width * scale, height: box.height * scale };
    const tiles = ui.tileTexels.bind(ui);
    paint(ui.quads, tiles, 'chip', { box: device, scale, fade: come });
    for (const line of lines) {
      const where = { ...placed(line.x, line.y), size: SIZE, scale };
      ui.text(line.words, where, { colour: TONES.ink, shadow: { colour: TONES.outline, step: 1 }, fade: come });
    }
  }
}
