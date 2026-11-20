import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Rect } from './heldMapLaw.ts';
import { stageOf } from './heldMapLaw.ts';
import { type LayoutAsk, layOut, letterScale, markBox, nameBox, PORT_PX, WORD_PX } from './mapLayout.ts';

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
  sea: () => 2,
  land: () => false,
  key: null,
  current: null,
};
/** A water whose name may stand at `spots`, likeliest first. */
const water = (text: string, ...spots: [number, number][]) => ({
  text,
  continent: 0,
  colour: '#256327',
  spots: spots.map(([x, y]) => ({ x, y })),
});

test('a name with no clear place is dropped by priority: a port before a water, a water before a ruin and a node', () => {
  // Three marks clear of each other, one over another, their names in each other's way; a hand left of the node.
  const lettering = layOut({
    ...ASK,
    covers: [{ x: 100, y: 80, width: 95, height: 16 }],
    places: [
      { text: 'Hollow Barrow', x: 200, y: 88, kind: 'patrol', chosen: false },
      { text: 'Ruins of Elmhaven', x: 200, y: 112, kind: 'ruin', chosen: false },
      { text: 'Overlook', x: 200, y: 100, kind: 'port', chosen: false },
    ],
    waters: [water('The Lantern Sea, 1-4', [200, 100], [200, 60])],
  });
  const named = Object.fromEntries(lettering.letters.map((letter) => [letter.text, letter.side]));
  assert.equal(named['Overlook'], 'right', 'the port takes the first place, right of its mark');
  assert.equal(named['Ruins of Elmhaven'], 'left', 'the ruin the other side');
  assert.equal(named['Hollow Barrow'], null, 'the node keeps its mark, its name dropped');
  const lantern = lettering.letters.find((letter) => letter.kind === 'water');
  assert.deepEqual([lantern?.x, lantern?.y], [200, 60], 'the water takes her next spot, clear of the port');
});

test('a name runs right of its mark, and left where the right is the map’s edge', () => {
  const lettering = layOut({ ...ASK, places: [{ text: 'Windmere', x: 590, y: 200, kind: 'port', chosen: false }] });
  assert.equal(lettering.letters[0]?.side, 'left');
});

test('a water’s name under a hand takes her next spot clear of it rather than vanishing', () => {
  const cover = { x: 480, y: 150, width: 120, height: 80 };
  const lettering = layOut({
    ...ASK,
    covers: [cover],
    waters: [water('The Elmwater, 7-10', [560, 190], [380, 190])],
  });
  const elmwater = lettering.letters[0];
  assert.deepEqual([elmwater?.x, elmwater?.y], [380, 190]);
  assert.ok(!overlaps(nameBox(elmwater!, 'centre', widthOf(elmwater!.text, 'water'), 1), cover));
});

test('a water’s name stands only where it lies wholly on her own sea, else is dropped', () => {
  const lettering = layOut({
    ...ASK,
    sea: (box, continent) => (continent === 0 && box.x > 300 ? 2 : 0),
    waters: [
      water('The Elmwater, 7-10', [100, 100], [400, 100]),
      { ...water('The Fen Deeps, 22-26', [100, 300]), continent: 1 },
    ],
  });
  assert.deepEqual(
    lettering.letters.map((letter) => [letter.text, letter.x]),
    [['The Elmwater, 7-10', 400]],
  );
});

test('with no corner clear the key takes the one covering fewest names, a water’s weighing most, and they move round it', () => {
  const lettering = layOut({
    ...ASK,
    ink: { width: 300, height: 200 },
    key: { width: 120, height: 80 },
    places: [{ text: 'Ruins', x: 150, y: 160, kind: 'ruin', chosen: false }],
    waters: [water('Fen', [60, 160], [150, 100]), water('Gilt', [60, 40]), water('Cairn', [240, 40])],
  });
  assert.equal(lettering.key?.corner, 'lower-right');
  assert.deepEqual(
    lettering.letters.map((letter) => [letter.text, letter.side, letter.x, letter.y]),
    [
      ['Ruins', 'left', 150, 160],
      ['Fen', 'centre', 60, 160],
      ['Gilt', 'centre', 60, 40],
      ['Cairn', 'centre', 240, 40],
    ],
  );
});

test('a water the key must cover is named again at her next spot clear of it', () => {
  const lettering = layOut({
    ...ASK,
    ink: { width: 300, height: 200 },
    key: { width: 120, height: 80 },
    waters: [
      water('Fen', [60, 160], [160, 100]),
      water('Rime', [240, 160]),
      water('Gilt', [60, 40]),
      water('Cairn', [240, 40]),
    ],
  });
  assert.equal(lettering.key?.corner, 'lower-left');
  const fen = lettering.letters.find((letter) => letter.text === 'Fen');
  assert.deepEqual([fen?.x, fen?.y], [160, 100]);
  for (const letter of lettering.letters)
    assert.ok(!overlaps(nameBox(letter, 'centre', widthOf(letter.text, 'water'), 1), lettering.key!.box), letter.text);
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

test('a water’s name takes a spot wholly on her own sea before an earlier one that runs over a neighbour’s', () => {
  const lettering = layOut({
    ...ASK,
    sea: (box) => (box.x > 300 ? 2 : 1),
    waters: [water('The Elmwater, 7-10', [200, 100], [400, 100])],
  });
  assert.equal(lettering.letters[0]?.x, 400);
});

test("a node's mark over a ruin's moves out along the line between them, just clear, and its name with it", () => {
  const lettering = layOut({
    ...ASK,
    places: [
      { text: 'Saltpan Ruins', x: 303, y: 204, kind: 'patrol', chosen: false },
      { text: 'Ruins of Windmere', x: 300, y: 200, kind: 'ruin', chosen: false },
    ],
  });
  const [node, ruin] = ['Saltpan Ruins', 'Ruins of Windmere'].map((text) =>
    lettering.letters.find((letter) => letter.text === text),
  );
  assert.ok(node && ruin);
  assert.deepEqual(lettering.letters.slice(0, 2), [node, ruin], 'the places lettered first, in the order asked');
  assert.deepEqual([ruin.x, ruin.y], [300, 200], 'the ruin stands where it lies');
  const [away, down] = [node.x - 300, node.y - 200];
  assert.ok(Math.abs(away * 4 - down * 3) < 1e-6, `along the line from the ruin (${away}, ${down})`);
  const [ruinBox, nodeBox] = [markBox('ruin', ruin.x, ruin.y, 1), markBox('patrol', node.x, node.y, 1)];
  assert.ok(!overlaps(ruinBox, nodeBox), 'clear of the ruin');
  assert.ok(Math.max(Math.abs(away), Math.abs(down)) < 9 + 0.5, 'by no more than the overlap');
  assert.ok(node.side && !overlaps(nameBox(node, node.side, widthOf(node.text, 'patrol'), 1), ruinBox), 'named beside');
});
