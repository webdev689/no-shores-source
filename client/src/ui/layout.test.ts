import assert from 'node:assert/strict';
import { test } from 'node:test';
import { glyphDrawn } from './glyphs.ts';
import { layout } from './layout.ts';
import type { Laid, Node } from './node.ts';
import { type Face, lineHeight, styled, widthOf } from './text.ts';

/** A face whose every glyph is a 600-unit block. */
const block = glyphDrawn({ rows: ['##', '##'], advance: 600 });
const face: Face = { glyph: () => block };
const VIEW = { x: 0, y: 0, width: 800, height: 600 };
const lay = (root: Node, scrollOf?: (id: string) => number) => layout(root, VIEW, { face, scrollOf });
const boxOf = (laid: Laid[], id: string) => laid.find((each) => each.node.id === id)?.box;

test('a row fits its children, their gaps and its padding, and lays them in order', () => {
  const laid = lay({
    id: 'row',
    padding: 2,
    gap: 4,
    children: [
      { id: 'one', width: 10, height: 20 },
      { id: 'two', width: 30, height: 5 },
    ],
  });
  assert.deepEqual(boxOf(laid, 'row'), { x: 0, y: 0, width: 48, height: 24 });
  assert.deepEqual(boxOf(laid, 'one'), { x: 2, y: 2, width: 10, height: 20 });
  assert.deepEqual(boxOf(laid, 'two'), { x: 16, y: 2, width: 30, height: 5 });
});

test('a column stacks its children and centres them across when asked', () => {
  const laid = lay({
    direction: 'column',
    width: 100,
    alignX: 'center',
    gap: 3,
    children: [
      { id: 'one', width: 10, height: 10 },
      { id: 'two', width: 31, height: 10 },
    ],
  });
  assert.deepEqual(boxOf(laid, 'one'), { x: 45, y: 0, width: 10, height: 10 });
  assert.deepEqual(boxOf(laid, 'two'), { x: 34, y: 13, width: 31, height: 10 });
});

test('what grows takes the room left, the smallest grown first', () => {
  const laid = lay({
    width: 100,
    children: [
      { id: 'fixed', width: 20, height: 1 },
      { id: 'small', width: 'grow', children: [{ width: 10, height: 1 }] },
      { id: 'large', width: 'grow', children: [{ width: 50, height: 1 }] },
    ],
  });
  assert.equal(boxOf(laid, 'small')?.width, 30);
  assert.equal(boxOf(laid, 'large')?.width, 50);
  const even = lay({
    width: 101,
    children: [
      { id: 'one', width: 'grow' },
      { id: 'two', width: 'grow' },
    ],
  });
  assert.equal((boxOf(even, 'one')?.width ?? 0) + (boxOf(even, 'two')?.width ?? 0), 101, 'no pixel lost');
});

test('a share of the parent, and a grown child kept under its most', () => {
  const laid = lay({
    width: 200,
    padding: [0, 10],
    children: [
      { id: 'half', width: '50%', height: 1 },
      { id: 'rest', width: 'grow', maxWidth: 40, height: 1 },
    ],
  });
  assert.equal(boxOf(laid, 'half')?.width, 90);
  assert.equal(boxOf(laid, 'rest')?.width, 40);
});

test('words wrap to the room they are given, never under their widest word, and keep their colours', () => {
  const words = 'aaaa bb cc';
  const one = widthOf(face, 'aaaa bb', 1);
  const laid = lay({
    width: one,
    direction: 'column',
    children: [{ id: 'words', text: { words: [{ words: 'aaaa ' }, { words: 'bb cc', colour: '#f00' }] } }],
  });
  const text = laid.find((each) => each.node.id === 'words');
  assert.deepEqual(
    text?.lines.map((line) => line.map((span) => span.words).join('')),
    ['aaaa bb', 'cc'],
    words,
  );
  assert.deepEqual(text?.lines[0], [
    { words: 'aaaa ', colour: '' },
    { words: 'bb', colour: '#f00' },
  ]);
  assert.equal(text?.box.height, 2 * lineHeight(1));
  const narrow = lay({ width: 5, direction: 'column', children: [{ id: 'words', text: { words: 'aaaa bb' } }] });
  assert.equal(boxOf(narrow, 'words')?.width, widthOf(face, 'aaaa', 1), 'the widest word stands whole');
});

test('a row too narrow shrinks its largest child first, and its words wrap', () => {
  const long = 'aaaa aaaa aaaa aaaa';
  const laid = lay({
    width: 100,
    children: [
      { id: 'short', text: { words: 'bb' } },
      { id: 'long', text: { words: long } },
    ],
  });
  assert.equal(boxOf(laid, 'short')?.width, widthOf(face, 'bb', 1));
  assert.equal(boxOf(laid, 'long')?.width, 100 - widthOf(face, 'bb', 1));
  assert.ok((boxOf(laid, 'long')?.height ?? 0) > lineHeight(1));
});

test('a float stands on its target by its anchor, over the rest, out of the flow', () => {
  const laid = lay({
    id: 'root',
    width: 100,
    height: 50,
    children: [
      { id: 'tip', width: 20, height: 10, float: { to: 'screen', at: [0.5, 0.5], anchor: [0.5, 0.5] } },
      { id: 'flow', width: 10, height: 10 },
    ],
  });
  assert.deepEqual(boxOf(laid, 'tip'), { x: 390, y: 295, width: 20, height: 10 });
  assert.deepEqual(boxOf(laid, 'flow'), { x: 0, y: 0, width: 10, height: 10 });
  assert.equal(laid.at(-1)?.node.id, 'tip', 'drawn last');
});

test('a float kept on the screen is moved back inside it where it would run off an edge, and left where it fits', () => {
  const near = (share: readonly [number, number], id: string): Node => ({
    id: `${id}-holder`,
    width: 10,
    height: 10,
    float: { to: 'screen', at: share, anchor: [0, 0] },
    children: [{ id, width: 200, height: 300, float: { to: 'parent', at: [1, 1], kept: true } }],
  });
  const laid = lay({
    id: 'root',
    width: 100,
    height: 50,
    children: [near([0.9, 0.8], 'low'), near([0.1, 0.1], 'fits')],
  });
  assert.deepEqual(boxOf(laid, 'low'), { x: 600, y: 300, width: 200, height: 300 }, 'pushed up and left into view');
  assert.deepEqual(boxOf(laid, 'fits'), { x: 90, y: 70, width: 200, height: 300 }, 'where it was put');
});

test('a scrolled column keeps its children whole, moves them by its scroll, clips them, and says how tall they are', () => {
  const rows = Array.from({ length: 5 }, (_unused, index): Node => ({ id: `row${index}`, width: 10, height: 20 }));
  const laid = lay({ id: 'list', direction: 'column', height: 50, scroll: true, children: rows }, () => 15);
  assert.equal(boxOf(laid, 'row0')?.y, -15);
  assert.equal(boxOf(laid, 'row0')?.height, 20);
  assert.equal(laid.find((each) => each.node.id === 'list')?.content, 100);
  assert.deepEqual(laid.find((each) => each.node.id === 'row1')?.clip, { x: 0, y: 0, width: 10, height: 50 });
});

test('a wrapping row runs its children on into lines', () => {
  const tiles = Array.from({ length: 5 }, (_unused, index): Node => ({ id: `tile${index}`, width: 30, height: 30 }));
  const laid = lay({ width: 100, wrap: true, gap: 5, children: tiles });
  assert.deepEqual(boxOf(laid, 'tile3'), { x: 0, y: 35, width: 30, height: 30 });
  assert.equal(laid[0]?.box.height, 65);
});

test('a node drawn moved carries its children with it, and its siblings stay', () => {
  const laid = lay({
    children: [
      { id: 'moved', offset: [3, 4], children: [{ id: 'inside', width: 5, height: 5 }] },
      { id: 'still', width: 5, height: 5 },
    ],
  });
  assert.deepEqual(boxOf(laid, 'inside'), { x: 3, y: 4, width: 5, height: 5 });
  assert.deepEqual(boxOf(laid, 'still'), { x: 5, y: 0, width: 5, height: 5 });
});

test('words kept to one line are cut short with an ellipsis where they do not fit', () => {
  const room = widthOf(face, 'abcd...', 1);
  const laid = lay({
    width: room,
    children: [{ id: 'name', width: 'grow', text: { words: 'abcdefgh', ellipsis: true } }],
  });
  const name = laid.find((each) => each.node.id === 'name');
  assert.deepEqual(
    name?.lines.map((line) => line.map((span) => span.words).join('')),
    ['abcd...'],
  );
  const roomy = lay({ children: [{ id: 'name', text: { words: 'abc', ellipsis: true } }] });
  assert.equal(roomy.find((each) => each.node.id === 'name')?.lines[0]?.[0]?.words, 'abc');
});

test('a label tracked wider takes a wider box, each letter its extra spacing', () => {
  const plain = boxOf(lay({ children: [{ id: 'words', text: { words: 'ABCD' } }] }), 'words');
  const tracked = boxOf(lay({ children: [{ id: 'words', text: { words: 'ABCD', tracking: 3 } }] }), 'words');
  assert.equal((tracked?.width ?? 0) - (plain?.width ?? 0), 4 * 1, 'a pixel more after each of the four letters');
});

test('balanced words break into as many lines as they need, each as even as can be', () => {
  const words = 'aa bb cc dd ee';
  const room = widthOf(face, 'aa bb cc dd', 1) + 1;
  const lines = (balance: boolean) =>
    lay({ width: room, children: [{ id: 'words', width: 'grow', text: { words, balance } }] })
      .find((each) => each.node.id === 'words')
      ?.lines.map((line) => line.map((span) => span.words).join(''));
  assert.deepEqual(lines(false), ['aa bb cc dd', 'ee']);
  assert.deepEqual(lines(true), ['aa bb cc', 'dd ee']);
});

test('a scrolled row moves its children up by its scroll and says how tall the tallest is', () => {
  const laid = lay(
    {
      id: 'row',
      height: 50,
      scroll: true,
      children: [
        { id: 'short', width: 10, height: 30 },
        { id: 'tall', width: 10, height: 120 },
      ],
    },
    () => 40,
  );
  assert.equal(boxOf(laid, 'tall')?.y, -40);
  assert.equal(laid.find((each) => each.node.id === 'row')?.content, 120);
});

test("a share of a row's room is held to its least and most, as a column's is", () => {
  const laid = lay({
    width: 1000,
    children: [
      { id: 'capped', width: '76%', maxWidth: 340, height: 10 },
      { id: 'floored', width: '1%', minWidth: 60, height: 10 },
    ],
  });
  assert.equal(boxOf(laid, 'capped')?.width, 340);
  assert.equal(boxOf(laid, 'floored')?.width, 60);
});

test('a bold span is laid in its styled letters, wider, and keeps its colour', () => {
  const laid = lay({ id: 't', text: { words: [{ words: 'ab' }, { words: 'cd', style: 'bold', colour: '#f00' }] } });
  const text = laid.find((each) => each.node.id === 't');
  assert.deepEqual(text?.lines, [
    [
      { words: 'ab', colour: '' },
      { words: styled('cd', 'bold'), colour: '#f00' },
    ],
  ]);
  assert.equal(text?.box.width, widthOf(face, `ab${styled('cd', 'bold')}`, 1));
  assert.ok((text?.box.width ?? 0) > widthOf(face, 'abcd', 1));
});

test('a span keeps its colour after a leading space and after two spaces at a break', () => {
  const [red, green] = ['#ff0000', '#00ff00'];
  const lead = lay({
    id: 't',
    text: {
      words: [
        { words: ' ', colour: red },
        { words: 'Gold', colour: green },
      ],
    },
  });
  assert.deepEqual(lead.find((each) => each.node.id === 't')?.lines, [
    [
      { words: ' ', colour: red },
      { words: 'Gold', colour: green },
    ],
  ]);
  const broken = lay({
    width: widthOf(face, 'ab', 1),
    direction: 'column',
    children: [
      {
        id: 't',
        text: {
          words: [
            { words: 'ab  ', colour: red },
            { words: 'cd', colour: green },
          ],
        },
      },
    ],
  });
  assert.deepEqual(broken.find((each) => each.node.id === 't')?.lines, [
    [{ words: 'ab', colour: red }],
    [{ words: 'cd', colour: green }],
  ]);
});

test('words cut short with an ellipsis stand on one line, their newlines spaces', () => {
  const laid = lay({ id: 't', width: 200, text: { words: 'one\ntwo\nthree', ellipsis: true } });
  const text = laid.find((each) => each.node.id === 't');
  assert.equal(text?.lines.length, 1);
  assert.equal(text?.box.height, lineHeight(1));
});

test('room is shared out whole among many grown children of many sizes, and never past a most', () => {
  const kids: Node[] = Array.from({ length: 100 }, (_unused, index) => ({
    id: `k${index}`,
    width: 'grow',
    minWidth: index + 1,
    height: 5,
  }));
  const grown = lay({ width: 20000, children: kids });
  const total = kids.reduce((sum, kid) => sum + (boxOf(grown, kid.id ?? '')?.width ?? 0), 0);
  assert.equal(total, 20000, 'all the room handed out');
  const shrunk = lay({
    width: 4000,
    children: Array.from({ length: 100 }, (_unused, index) => ({
      id: `s${index}`,
      text: { words: 'x'.repeat(index + 1), ellipsis: true },
    })),
  });
  const used = Array.from({ length: 100 }, (_unused, index) => boxOf(shrunk, `s${index}`)?.width ?? 0);
  assert.equal(
    used.reduce((sum, width) => sum + width, 0),
    4000,
    'all the room taken back',
  );
  const capped = lay({
    width: 31,
    children: [
      { id: 'a', width: 'grow', maxWidth: 10, height: 10 },
      { id: 'b', width: 'grow', height: 10 },
      { id: 'c', width: 'grow', height: 10 },
    ],
  });
  assert.deepEqual(
    ['a', 'b', 'c'].map((id) => boxOf(capped, id)?.width),
    [10, 11, 10],
    'the spare pixel goes where there is room for it',
  );
});

test('a scroll kept past the end of what a list now holds is laid at its end, never past it', () => {
  const rows = (count: number): Node[] =>
    Array.from({ length: count }, (_unused, index) => ({ id: `row-${index}`, height: 20 }));
  const list = (count: number): Node => ({
    id: 'list',
    scroll: true,
    direction: 'column',
    height: 100,
    children: rows(count),
  });
  const boxOf = (laid: readonly Laid[], id: string) => laid.find((each) => each.node.id === id)?.box;
  const short = lay({ children: [list(2)] }, () => 500);
  assert.equal(boxOf(short, 'row-0')?.y, boxOf(short, 'list')?.y, 'two rows fit: laid from the top');
  const long = lay({ children: [list(20)] }, () => 500);
  assert.equal(boxOf(long, 'row-19')?.y, 80, 'twenty: its last row at its foot');
});
