// An interface over a renderer that lays quads and measures words with a face of square glyphs, and nothing else: for
// tests of what a screen builds, presses and lays, without a GPU.
import { glyphDrawn } from './glyphs.ts';
import { layout } from './layout.ts';
import type { Laid, Node } from './node.ts';
import { QuadList } from './quads.ts';
import { type Face, widthOf } from './text.ts';
import { Interface, type UiEvent } from './ui.ts';
import type { UiRenderer } from './uiRenderer.ts';

const block = glyphDrawn({ rows: ['##', '##'], advance: 600 });
export const FAKE_FACE: Face = { glyph: () => block };

/** An interface `width` by `height` CSS pixels, at a scale of 1, that draws nothing. */
export function fakeInterface(
  width = 1280,
  height = 720,
): { ui: Interface; step: (root: Node | (() => Node), events?: UiEvent[], seconds?: number) => void } {
  const renderer = {
    face: FAKE_FACE,
    quads: new QuadList(),
    tileTexels: () => null,
    glyphTexels: () => null,
    picture: () => undefined,
    measure: (words: string, size: number) => widthOf(FAKE_FACE, words, size),
  } as unknown as UiRenderer;
  const ui = new Interface(renderer);
  ui.speak = () => undefined;
  /** A frame as the game runs one: the events heard, then the tree built (when `root` builds it) and drawn. */
  const step = (root: Node | (() => Node), events: UiEvent[] = [], seconds = 1 / 60) => {
    ui.frame({ width, height, scale: 1 }, events, seconds);
    ui.draw(typeof root === 'function' ? root() : root);
  };
  // A first frame, so the view's size is known to what builds before it draws.
  ui.frame({ width, height, scale: 1 }, [], 0);
  return { ui, step };
}

/** `root` laid over a view `width` by `height`. */
export const laidOf = (root: Node, width = 1280, height = 720): Laid[] =>
  layout(root, { x: 0, y: 0, width, height }, { face: FAKE_FACE, scrollOf: () => 0 });

/** The words of every laid node, joined, in drawing order. */
export const wordsOf = (laid: readonly Laid[]): string[] =>
  laid.flatMap((each) => {
    const words = each.node.text?.words;
    if (words === undefined) return [];
    return [typeof words === 'string' ? words : words.map((span) => span.words).join('')];
  });

/** The laid node with `id`. */
export const laidWith = (laid: readonly Laid[], id: string): Laid | undefined =>
  laid.find((each) => each.node.id === id);
