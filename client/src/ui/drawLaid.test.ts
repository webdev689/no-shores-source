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

test('lines set taller than the face are laid that tall, their words in the middle', () => {
  const firstTop = (leading?: number) => {
    const laid = layout(
      { width: 20, text: { words: 'ab cd', size: 2, leading } },
      { x: 0, y: 0, width: 400, height: 100 },
      { face, scrollOf: () => 0 },
    );
    const ui = renderer();
    drawLaid(ui, laid, 1, {
      clock: 0,
      field: () => null,
      focused: () => false,
      state: () => 'rest',
      fieldScroll: new Map(),
    });
    return { height: laid[0]?.box.height, top: ui.quads.data[1] };
  };
  const plain = firstTop();
  const tall = firstTop(33);
  assert.equal(plain.height, 2 * 26);
  assert.equal(tall.height, 2 * 33);
  assert.equal((tall.top ?? 0) - (plain.top ?? 0), 3, 'the 7 px more shared, the odd one under');
});

test('what a scrolled list holds out of its sight is not drawn', () => {
  const ui = renderer();
  const rows = (count: number) =>
    Array.from({ length: count }, (_unused, index) => ({ height: 20, fill: '#fff', text: { words: `row ${index}` } }));
  const draw = (count: number) => {
    ui.quads.clear();
    const laid = layout(
      { id: 'list', scroll: true, direction: 'column', height: 40, width: 100, children: rows(count) },
      { x: 0, y: 0, width: 400, height: 300 },
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
  assert.equal(draw(100), draw(3), 'the two rows in sight and the next, whose shadow could reach in; no more');
});

test('a field holding more than it shows draws its start while not typed in, and keeps its caret in sight while it is', () => {
  const text = 'abcdefghijklmnopqrstuvwxyz'.repeat(4);
  const firstX = (focused: boolean) => {
    const ui = renderer();
    const laid = layout(
      { id: 'motto', width: 120, height: 30, field: { placeholder: '' } },
      { x: 0, y: 0, width: 400, height: 100 },
      { face, scrollOf: () => 0 },
    );
    const fieldScroll = new Map<string, number>();
    drawLaid(ui, laid, 1, {
      clock: 0.75,
      field: () => ({ text, caret: text.length, anchor: text.length }),
      focused: () => focused,
      state: () => 'rest',
      fieldScroll,
    });
    return { x: ui.quads.data[0] ?? Number.NaN, scrolled: fieldScroll.get('motto') ?? Number.NaN };
  };
  const resting = firstX(false);
  const typing = firstX(true);
  assert.equal(resting.scrolled, 0, 'not typed in, the words are not scrolled');
  assert.ok(typing.scrolled > 0, 'typed in at the end, the words scroll to keep the caret in sight');
  assert.ok(resting.x > typing.x, 'so the first letter drawn stands further left while typing');
});
