import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Rect } from './heldMapLaw.ts';
import { stageOf } from './heldMapLaw.ts';
import { type LayoutAsk, layOut, letterScale, nameBox, PORT_PX, WORD_PX } from './mapLayout.ts';

/** A word's width in the map's face, units: Pixelify's letters are a little over half their size wide, taken wide. */
const widthOf = (text: string, kind: string) => text.length * 0.62 * (kind === 'port' ? PORT_PX : WORD_PX);

const overlaps = (one: Rect, other: Rect) =>
  one.x < other.x + other.width &&
  other.x < one.x + one.width &&
  one.y < other.y + other.height &&
  other.y < one.y + one.height;

test('every word at a 1280 x 720 screen is at least 13 px tall, and grows with the screen', () => {
  const small = letterScale(stageOf({ width: 1280, height: 720 }).ink);
  assert.equal(small, 1);
  assert.ok(WORD_PX * small >= 13 && PORT_PX > WORD_PX, 'ports a step larger than every other word');
  const large = letterScale(stageOf({ width: 1920, height: 1080 }).ink);
  assert.ok(large > 1.45 && large < 1.6, `half again on a screen half again as large (${large})`);
  assert.equal(letterScale(stageOf({ width: 390, height: 844 }).ink), 1, 'never smaller on a small screen');
});

const ASK: LayoutAsk = {
  ink: { width: 600, height: 400 },
  scale: 1,
  covers: [],
  places: [],
  waters: [],
  ship: null,
  widthOf,
  land: () => false,
  key: null,
  current: null,
};

test('a name with no clear place is dropped by priority: a port before a water, a water before a ruin and a node', () => {
  const lettering = layOut({
    ...ASK,
    places: [
      { text: 'Hollow Barrow', x: 200, y: 100, kind: 'patrol', chosen: false },
      { text: 'Ruins of Elmhaven', x: 200, y: 100, kind: 'ruin', chosen: false },
      { text: 'Overlook', x: 200, y: 100, kind: 'port', chosen: false },
    ],
    waters: [{ text: 'The Lantern Sea, 1-4', x: 200, y: 100, colour: '#256327' }],
  });
  const named = Object.fromEntries(lettering.letters.map((letter) => [letter.text, letter.side]));
  assert.equal(named['Overlook'], 'right', 'the port takes the first place, right of its mark');
  assert.equal(named['Ruins of Elmhaven'], 'left', 'the ruin the other side');
  assert.equal(named['Hollow Barrow'], null, 'the node keeps its mark, its name dropped');
  assert.ok(named['The Lantern Sea, 1-4'] === 'centre', 'the water moves a line off her point');
  const water = lettering.letters.find((letter) => letter.kind === 'water');
  assert.notEqual(water?.y, 100);
});

test('a name runs right of its mark, and left where the right is the map’s edge', () => {
  const lettering = layOut({ ...ASK, places: [{ text: 'Windmere', x: 590, y: 200, kind: 'port', chosen: false }] });
  assert.equal(lettering.letters[0]?.side, 'left');
});

test('a water’s name under a hand moves inward clear of it rather than vanishing', () => {
  const cover = { x: 0, y: 150, width: 120, height: 80 };
  const lettering = layOut({
    ...ASK,
    covers: [cover],
    waters: [{ text: 'The Mistwrack, 16-19', x: 40, y: 190, colour: '#894314' }],
  });
  const water = lettering.letters[0];
  assert.ok(water, 'still named');
  const box = nameBox(water, 'centre', widthOf(water.text, 'water'), 1);
  assert.ok(!overlaps(box, cover), 'clear of the hand');
});

test('the key yields to nothing but land, marks, hands and ports’ names: with no corner clear it drops the lesser names under it', () => {
  const crowded = layOut({
    ...ASK,
    ink: { width: 300, height: 200 },
    key: { width: 120, height: 80 },
    waters: [
      { text: 'Fen', x: 60, y: 160, colour: '#256327' },
      { text: 'Rime', x: 240, y: 160, colour: '#256327' },
      { text: 'Gilt', x: 60, y: 40, colour: '#256327' },
      { text: 'Cairn', x: 240, y: 40, colour: '#256327' },
    ],
  });
  assert.equal(crowded.key?.corner, 'lower-left');
  assert.deepEqual(
    crowded.letters.map((letter) => letter.text),
    ['Rime', 'Gilt', 'Cairn'],
  );
});

test('a port the ship lies at keeps its name, beside the ship’s arrow where a mark takes its other side', () => {
  const lettering = layOut({
    ...ASK,
    places: [
      { text: 'Overlook', x: 300, y: 200, kind: 'port', chosen: false },
      { text: 'The Broken Causeway', x: 288, y: 199, kind: 'patrol', chosen: false },
    ],
    ship: { x: 303, y: 198, heading: 1 },
  });
  const port = lettering.letters.find((letter) => letter.kind === 'port');
  assert.equal(port?.side, 'right');
  const box = nameBox(port!, 'right', widthOf('Overlook', 'port'), 1);
  assert.ok(box.x >= 303 + 10, 'clear of the arrow');
});

test('with every corner over land the key still takes one clear of marks, hands and names, rather than vanishing', () => {
  const lettering = layOut({ ...ASK, key: { width: 120, height: 80 }, land: () => true });
  assert.equal(lettering.key?.corner, 'lower-left');
});
