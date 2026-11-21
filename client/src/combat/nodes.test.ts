// Reading what the fight's display builds, for its tests: its nodes as a list, the words they show, the tree laid out
// with a stand-in face, and the colours its quads are drawn in. No page and no GPU.
import { drawLaid } from '../ui/drawLaid.ts';
import { glyphDrawn } from '../ui/glyphs.ts';
import { layout } from '../ui/layout.ts';
import type { Child, Laid, Node } from '../ui/node.ts';
import { colourOf, QUAD_FLOATS, QuadList } from '../ui/quads.ts';
import { type Face, widthOf } from '../ui/text.ts';
import { Interface } from '../ui/ui.ts';
import type { UiRenderer } from '../ui/uiRenderer.ts';

const block = glyphDrawn({ rows: ['##', '##'], advance: 600 });
const face: Face = { glyph: () => block };

/** Every node in `child`'s tree, parents before children. */
export const allOf = (child: Child): Node[] => (child ? [child, ...(child.children ?? []).flatMap(allOf)] : []);

/** The words each node in `child`'s tree shows, in order. */
export const wordsIn = (child: Child): string[] =>
  allOf(child).flatMap((node) =>
    node.text
      ? [typeof node.text.words === 'string' ? node.text.words : node.text.words.map((span) => span.words).join('')]
      : [],
  );

/** A renderer that lays quads and measures words, with an atlas that always has room. */
export function fakeRenderer(): UiRenderer {
  return {
    face,
    quads: new QuadList(),
    tileTexels: () => ({ x: 0, y: 0, width: 1, height: 1, layer: 0 }),
    glyphTexels: () => null,
    picture: () => undefined,
    measure: (words: string, size: number) => widthOf(face, words, size),
  } as unknown as UiRenderer;
}

/** An interface on the fake renderer, a frame begun over a view `width` by `height`. */
export function fakeInterface(width = 1280, height = 720): Interface {
  const ui = new Interface(fakeRenderer());
  ui.frame({ width, height, scale: 1 }, [], 1 / 60);
  return ui;
}

/** `root` laid in a view `width` by `height`. */
export const laidOf = (root: Node, width = 1280, height = 720): Laid[] =>
  layout(root, { x: 0, y: 0, width, height }, { face });

/** The colours (CSS `rgba()` of whole bytes and the alpha to two places) of the quads `root` draws. */
export function coloursDrawn(root: Node, width = 1280, height = 720): Set<string> {
  const renderer = fakeRenderer();
  drawLaid(renderer, laidOf(root, width, height), 1, {
    clock: 0,
    field: () => null,
    focused: () => false,
    state: () => 'rest',
    fieldScroll: new Map(),
  });
  const data = renderer.quads.data;
  const colours = new Set<string>();
  for (let index = 0; index < renderer.quads.count; index++) {
    const [red = 0, green = 0, blue = 0, alpha = 0] = data.subarray(index * QUAD_FLOATS + 8, index * QUAD_FLOATS + 12);
    colours.add(
      `rgba(${Math.round(red * 255)},${Math.round(green * 255)},${Math.round(blue * 255)},${alpha.toFixed(2)})`,
    );
  }
  return colours;
}

/** `css` as `coloursDrawn` writes it. */
export function written(css: string): string {
  const [red, green, blue, alpha] = colourOf(css);
  return `rgba(${Math.round(red * 255)},${Math.round(green * 255)},${Math.round(blue * 255)},${alpha.toFixed(2)})`;
}
