// The heads-up display's small drawn parts, shared by its pieces: the kit's header, footer, rule and rail bands (which
// `ui/paint.ts` leaves to the parts that draw them), a key on its keycap, words over the world, a press of the display,
// and a value that eases to each new one it is set to, as a CSS transition does.
import { edged } from '../combat/barDraw.ts';
import type { Hint } from './gearNodes.ts';
import { iconNode, isMouse } from './keyIcons.ts';
import { TONES } from '../plus/tones.ts';
import type { Drawing, Node, Text } from '../ui/node.ts';
import { colourOf } from '../ui/quads.ts';
import type { Interface } from '../ui/ui.ts';

/** Several drawings, one after another. */
export const drawings =
  (...all: readonly (Drawing | null | undefined | false)[]): Drawing =>
  (ui, box, scale, clip, shown) => {
    for (const one of all) if (one) one(ui, box, scale, clip, shown);
  };

/** Fills a strip of the box: `top` CSS pixels down, `height` tall (negative tops count from the foot). */
export const strip =
  (top: number, height: number, colour: string, fade = 1): Drawing =>
  (ui, box, scale, clip, shown) => {
    const [red, green, blue, alpha] = colourOf(colour);
    const y = top >= 0 ? box.y + top * scale : box.y + box.height + top * scale;
    const tone = [red, green, blue, alpha * fade * shown] as const;
    ui.quads.add({ x: box.x, y, width: box.width, height: height * scale }, tone, clip);
  };

/** The kit's header band: a faint lit ground, an outline along its foot and a groove under that. */
export const header = (fade = 1): Partial<Node> => ({
  fill: 'rgba(255,255,255,0.035)',
  draw: drawings(strip(0, 1, 'rgba(255,255,255,0.05)', fade), strip(-1, 1, TONES.outline, fade)),
});

/** The kit's rule along a foot: a dark line, the groove's light under it left to the next part's top. */
export const ruleUnder = (fade = 1): Drawing => strip(-1, 1, 'rgba(5,6,8,0.6)', fade);

/** The kit's footer band: a shaded ground under an outline with a groove under it. */
export const footer = (): Partial<Node> => ({
  fill: 'rgba(0,0,0,0.2)',
  draw: drawings(strip(0, 1, TONES.outline), strip(1, 1, TONES.groove)),
});

/** The kit's rail: an upright engraved down the left, a dark line with a lit one inside it. */
export const rail = (): Drawing =>
  drawings(edged(['', '', '', 'rgba(5,6,8,0.75)']), (ui, box, scale, clip, shown) =>
    ui.quads.add({ ...box, x: box.x + scale, width: scale }, [163 / 255, 152 / 255, 128 / 255, 0.13 * shown], clip),
  );

/** Words as the display writes them over the world: its ink, a hard shadow a step down and right. */
export const said = (words: string, more: Omit<Text, 'words'> = {}): Node => ({
  text: { words, colour: TONES.ink, edge: 'shadow', edgeColour: '#000', ...more },
});

/** A key on its keycap, its words at `size`: square and bevelled as the kit's stone is, its foot deeper; an arrow key
 *  drawn on its cap, and the mouse's button drawn as the mouse, with no cap. */
export function keycap(key: string, size = 1): Node {
  const icon = iconNode(key, size);
  if (icon && isMouse(key)) return icon;
  return {
    minWidth: 30,
    padding: [2, 6, 4, 6],
    fill: '#16181d',
    alignX: 'center',
    alignY: 'center',
    draw: edged(['#6d6252', '#231e18', '#231e18', '#6d6252'], [1, 1, 2, 1]),
    children: [icon ?? { text: { words: key, size, colour: '#efe8d6', wrap: false } }],
  };
}

/** A line of what keys do, each key on its keycap (keys doing the same joined, each on its own) and its words. */
export function hintRow(hints: readonly Hint[], size = 1): Node[] {
  return hints.map(([key, words]) => ({
    gap: 4,
    alignY: 'center',
    children: [
      ...key.split(' / ').map((one) => keycap(one, size)),
      { text: { words, size, colour: TONES.ink, edge: 'halo', wrap: false } },
    ],
  }));
}

/** A press of the display, in its role, its words at `size`: once pressed it lets go of focus, so Space or Enter, which
 *  the game itself answers, never presses it again. */
export function hudPress(
  ui: Interface,
  id: string,
  words: string,
  run: () => void,
  more: {
    readonly role?: 'button' | 'primary';
    readonly disabled?: boolean;
    readonly size?: number;
  } & Partial<Node> = {},
): Node {
  const { role = 'button', disabled = false, size = 1, ...rest } = more;
  if (ui.clicked(id) && !disabled) {
    ui.focusOn(null);
    run();
  }
  return {
    id,
    press: true,
    role,
    disabled,
    label: words,
    padding: [9, 16],
    alignY: 'center',
    ...rest,
    // The page ran a press's spaces together; its label keeps them as written.
    children: [{ text: { words: words.replace(/ +/g, ' '), size, edge: 'shadow', edgeColour: '#000', wrap: false } }],
  };
}

/** A value that eases to each new value it is set to over `seconds`, as a CSS transition does from wherever it stood. */
export class Tween {
  private from: number;
  private to: number;
  private since = Number.NEGATIVE_INFINITY;
  private readonly seconds: number;
  private readonly ease: (share: number) => number;

  constructor(value: number, seconds: number, ease: (share: number) => number) {
    [this.from, this.to, this.seconds, this.ease] = [value, value, seconds, ease];
  }

  /** Sets where it goes, from where it stands `now` (seconds). */
  set(value: number, now: number): void {
    if (value === this.to) return;
    this.from = this.value(now);
    this.to = value;
    this.since = now;
  }

  /** Where it stands `now`; still, it stands at once where it goes. */
  value(now: number, still = false): number {
    if (still) return this.to;
    const share = Math.min(1, Math.max(0, (now - this.since) / this.seconds));
    return this.from + (this.to - this.from) * this.ease(share);
  }
}
