import assert from 'node:assert/strict';
import { test } from 'node:test';
import { drawLaid } from './drawLaid.ts';
import { glyphDrawn } from './glyphs.ts';
import { layout } from './layout.ts';
import { QuadList } from './quads.ts';
import { type Face, widthOf } from './text.ts';
import type { UiRenderer } from './uiRenderer.ts';

const block = glyphDrawn({ rows: ['##', '##'], advance: 600 });
const face: Face = { glyph: () => block };

/** A renderer whose atlas holds every glyph, so each glyph drawn is a quad counted. */
function renderer(): UiRenderer {
  return {
    face,
    quads: new QuadList(),
    tileTexels: () => null,
    glyphTexels: () => ({ x: 0, y: 0, width: 1, height: 1 }),
    picture: () => undefined,
    measure: (words: string, size: number) => widthOf(face, words, size),
  } as unknown as UiRenderer;
}

const drawn = (words: { words: string; colour?: string }[]) => {
  const ui = renderer();
  const laid = layout(
    { text: { words, edge: 'halo', wrap: false } },
    { x: 0, y: 0, width: 400, height: 100 },
    { face, scrollOf: () => 0 },
  );
  drawLaid(ui, laid, 1, {
    clock: 0,
    field: () => null,
    focused: () => false,
    state: () => 'rest',
    fieldScroll: new Map(),
  });
  return ui.quads.count;
};

test('words in a clear colour keep their room but draw no halo, as words typed later stand unseen', () => {
  // Each glyph seen is drawn nine times: eight steps of its halo and itself.
  assert.equal(drawn([{ words: 'ab' }, { words: 'cd' }]), 4 * 9);
  assert.equal(drawn([{ words: 'ab' }, { words: 'cd', colour: 'rgba(0,0,0,0)' }]), 2 * 9);
});
