// What Use (E, or as bound) does where the player stands, shown as Destiny shows it: a keycap and the deed, low in the middle of the
// view, above the player's bars; gone when nothing is within reach. The game draws it as a layer of its own.
import { TONES } from '../plus/tones.ts';
import { boundCap } from './controls.ts';
import { keycap } from './hudParts.ts';
import { announce } from '../ui/announce.ts';
import type { Drawing, Node } from '../ui/node.ts';
import type { Box } from '../ui/quads.ts';
import { edged, paintBox } from '../combat/barDraw.ts';

/** The keycap's brass bevel, its foot deeper. */
const BRASS_KEY = ['#f3cf86', '#8a5f17', '#8a5f17', '#f3cf86'];
const BRASS_KEY_DEPTHS = [1, 1, 3, 1];

/** The ring round the keycap while a deed is held: how far outside the keycap it runs and how thick it is, CSS pixels;
 *  laid inside the prompt's padding, so its panel never hides it. */
const RING_OUT = 3;
const RING_LINE = 2;

/** The keycap's edge traced clockwise from its top's middle, `share` of the way round, as boxes `line` thick that
 *  never lie over each other, so a faint whole is painted once everywhere. */
export function traced(box: Box, line: number, share: number): Box[] {
  const { x, y, width, height } = box;
  const runs: [number, (from: number, to: number) => Box][] = [
    [width / 2, (from, to) => ({ x: x + width / 2 + from, y, width: to - from, height: line })],
    [height - line, (from, to) => ({ x: x + width - line, y: y + line + from, width: line, height: to - from })],
    [width - line, (from, to) => ({ x: x + width - line - to, y: y + height - line, width: to - from, height: line })],
    [height - 2 * line, (from, to) => ({ x, y: y + height - line - to, width: line, height: to - from })],
    [width / 2, (from, to) => ({ x: x + from, y, width: to - from, height: line })],
  ];
  let left = Math.max(0, Math.min(1, share)) * runs.reduce((sum, [length]) => sum + length, 0);
  const boxes: Box[] = [];
  for (const [length, part] of runs) {
    if (left <= 0) break;
    boxes.push(part(0, Math.min(length, left)));
    left -= length;
  }
  return boxes;
}

/** The keycap's bevel, and while a deed is held (`held`, 0 to 1) a ring round it traced as far as it is held over its
 *  faint whole. */
const heldCap =
  (held: number | null): Drawing =>
  (ui, box, scale, clip, shown) => {
    edged(BRASS_KEY, BRASS_KEY_DEPTHS)(ui, box, scale, clip, shown);
    if (held === null) return;
    const pen = { ui, box, scale, clip, fade: shown };
    const [out, line] = [RING_OUT * scale, RING_LINE * scale];
    const ring = { x: box.x - out, y: box.y - out, width: box.width + 2 * out, height: box.height + 2 * out };
    for (const part of traced(ring, line, 1)) paintBox(pen, part, 'rgba(239,232,214,0.22)');
    for (const part of traced(ring, line, held)) paintBox(pen, part, TONES.brassHi);
  };

export class UsePrompt {
  private said: string | null = null;
  private held: number | null = null;

  /** Whether a deed within reach is shown. */
  get showing(): boolean {
    return this.said !== null;
  }

  /** Shows the deed within reach, or nothing, and how far E has been held for it (0 to 1), or null where it is not
   *  being held; a new deed is told aloud, as a status is. */
  show(deed: string | null, held: number | null = null): void {
    this.held = deed === null ? null : held;
    if (deed === this.said) return;
    this.said = deed;
    if (deed !== null) announce(deed);
  }

  /** The prompt in a view `width` by `height` CSS pixels, standing taller where the fight's display takes its larger
   *  step; none while nothing is within reach. */
  node(view: { readonly width: number; readonly height: number }): Node | null {
    if (this.said === null) return null;
    const big = view.width >= 1500 && view.height >= 900;
    return {
      ...promptChip(this.said, this.held),
      float: { to: 'screen', at: [0.5, 1], anchor: [0.5, 1], y: big ? -154 : -110 },
    };
  }
}

/** A key's cap (`cap`, Use's unless given) and `deed` in the prompt's chip, `under` in faint words beneath the deed
 *  where given, the keycap ringed as far as it is `held` (0 to 1; null while not), for its caller to set where it
 *  stands. */
export function promptChip(
  deed: string,
  held: number | null,
  cap = boundCap('use'),
  under: string | null = null,
): Node {
  const said = { text: { words: deed, colour: '#efe8d6', edge: 'shadow', edgeColour: '#000', wrap: false } } as const;
  return {
    role: 'chip',
    through: true,
    gap: 10,
    alignY: 'center',
    padding: [8, 16, 8, 10],
    children: [
      {
        minWidth: 36,
        padding: [2, 7, 4, 7],
        fill: 'rgba(192,138,62,0.15)',
        alignX: 'center',
        draw: heldCap(held),
        children: [promptKey(cap)],
      },
      under === null
        ? said
        : {
            direction: 'column',
            gap: 2,
            children: [said, { text: { words: under, colour: TONES.stoneHi, wrap: false } }],
          },
    ],
  };
}

/** A key's cap in brass, or the pad's button drawn, as the player last played. */
function promptKey(cap: string): Node {
  if (cap.startsWith('pad:')) return keycap(cap);
  return { text: { words: cap, colour: TONES.brassHi, wrap: false } };
}
