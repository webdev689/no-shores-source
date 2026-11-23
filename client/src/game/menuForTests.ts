// The menu's pages drawn frame by frame for their tests: a real interface over a renderer that draws nothing, its
// letters square, on a 1280 by 720 view whose menu body is 1180 by 520.

import { glyphDrawn } from '../ui/glyphs.ts';
import type { Child, Node } from '../ui/node.ts';
import { QuadList } from '../ui/quads.ts';
import { type Face, widthOf } from '../ui/text.ts';
import { Interface, type UiEvent } from '../ui/ui.ts';
import type { UiRenderer } from '../ui/uiRenderer.ts';
import { Holds } from './gearHold.ts';
import { sizesOf } from './gearNodes.ts';
import type { PlainContext } from './menuPage.ts';

const block = glyphDrawn({ rows: ['##', '##'], advance: 600 });
const face: Face = { glyph: () => block };
export const VIEW = { width: 1280, height: 720, scale: 1 };
export const ROOM = { width: 1180, height: 520 };

function renderer(): UiRenderer {
  return {
    face,
    quads: new QuadList(),
    tileTexels: () => null,
    glyphTexels: () => null,
    picture: () => undefined,
    measure: (words: string, size: number) => widthOf(face, words, size),
  } as unknown as UiRenderer;
}

/** Every word a tree shows, in order. */
export function wordsOf(node: Child): string[] {
  if (!node) return [];
  const own = node.text
    ? [typeof node.text.words === 'string' ? node.text.words : node.text.words.map((span) => span.words).join('')]
    : [];
  return [...own, ...(node.children ?? []).flatMap(wordsOf)];
}

/** A page drawn frame by frame through the interface, with the clock `now` for its holds. */
export function drawn(page: (context: PlainContext) => Node) {
  let now = 0;
  const ui = new Interface(renderer());
  ui.speak = () => undefined;
  const holds = new Holds(() => now);
  const context: PlainContext = { ui, room: ROOM, sizes: sizesOf(VIEW.width, VIEW.height, 1), holds };
  let last: Node = { children: [] };
  const frame = (events: UiEvent[] = [], seconds = 1 / 60) => {
    now += seconds * 1000;
    ui.frame(VIEW, events, seconds);
    holds.frame(ui);
    last = page(context);
    holds.end();
    ui.draw({ width: 'grow', height: 'grow', direction: 'column', children: [last] });
  };
  const middle = (id: string) => {
    const box = ui.boxOf(id);
    if (!box) throw new Error(`${id} is not laid`);
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };
  const click = (id: string) => {
    const point = middle(id);
    frame([
      { kind: 'pointer', ...point },
      { kind: 'down', ...point, button: 0 },
      { kind: 'up', ...point, button: 0 },
    ]);
    frame();
  };
  const type = (id: string, text: string) => {
    click(id);
    frame([{ kind: 'text', text }]);
  };
  const shows = () => wordsOf(last).join(' | ');
  return { ui, frame, click, type, middle, shows };
}

