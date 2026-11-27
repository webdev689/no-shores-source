import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Rect } from './heldMapLaw.ts';
import { stageOf } from './heldMapLaw.ts';
import {
  type LayoutAsk,
  layOut,
  letterScale,
  type MapLetter,
  markBox,
  nameBox,
  PORT_PX,
  SEA_PX,
  shipRoomLost,
  WORD_PX,
} from './mapLayout.ts';

/** A word's width in the map's face, units: Pixelify's letters are a little over half their size wide, taken wide. */
const widthOf = (text: string, kind: string) =>
  text.length * 0.62 * (kind === 'water' ? SEA_PX : kind === 'port' || kind === 'island' ? PORT_PX : WORD_PX);
/** The box a laid sea's name covers, at the size and spread it was laid with. */
const boxOf = (letter: MapLetter) =>
  nameBox(letter, (widthOf(letter.text, 'water') * (letter.px ?? SEA_PX)) / SEA_PX, 1, letter.spread);

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
  spots: spots.map(([x, y]) => ({ x, y })),
});

test('a place is its mark alone, its name left for the pointer, and a sea’s name takes its next spot clear of it', () => {
  const lettering = layOut({
    ...ASK,
    places: [
      { text: 'Ruins of Elmhaven', x: 200, y: 120, kind: 'ruin', chosen: false },
      { text: 'Overlook', x: 200, y: 100, kind: 'port', chosen: false },
    ],
    waters: [water('The Lantern Sea', [200, 100], [300, 300])],
  });
  assert.deepEqual(
    lettering.letters.filter((letter) => letter.kind !== 'water').map((letter) => [letter.text, letter.side]),
    [
      ['Ruins of Elmhaven', null],
      ['Overlook', null],
    ],
  );
  const lantern = lettering.letters.find((letter) => letter.kind === 'water');
  assert.deepEqual([lantern?.x, lantern?.y, lantern?.side], [300, 300, 'centre']);
});

test('an island’s name and its level band stand at its middle, laid before a sea’s name', () => {
  const lettering = layOut({
    ...ASK,
    islands: [{ text: 'Saltmere', band: '1-4', colour: '#256327', x: 300, y: 200 }],
    waters: [water('The Lantern Sea', [300, 200], [300, 330])],
  });
  const island = lettering.letters.find((letter) => letter.kind === 'island');
  assert.deepEqual([island?.x, island?.y, island?.band, island?.colour], [300, 200, '1-4', '#256327']);
  const sea = lettering.letters.find((letter) => letter.kind === 'water');
  assert.deepEqual([sea?.x, sea?.y], [300, 330]);
});

test('a locked sea’s padlock stands at its middle, never dropped, and its sea’s name keeps clear of it', () => {
  const lettering = layOut({
    ...ASK,
    locks: [{ x: 300, y: 200 }],
    waters: [water('The Elmwater', [300, 200], [300, 320])],
  });
  const lock = lettering.letters.find((letter) => letter.kind === 'lock');
  assert.deepEqual([lock?.x, lock?.y, lock?.side], [300, 200, null]);
  const sea = lettering.letters.find((letter) => letter.kind === 'water');
  assert.deepEqual([sea?.x, sea?.y], [300, 320]);
  assert.ok(!overlaps(boxOf(sea!), markBox('lock', 300, 200, 1)));
  const edge = layOut({ ...ASK, locks: [{ x: 6, y: 200 }] });
  assert.equal(edge.letters.length, 0, 'none where it would hang over the map’s edge');
});

test('a sea’s name spreads its letters wide where it fits, closer where it does not, and at a word’s size last', () => {
  const laid = (width: number) =>
    layOut({ ...ASK, ink: { width, height: 400 }, waters: [water('The Lantern Sea', [width / 2, 200])] }).letters[0];
  assert.deepEqual([laid(600)?.spread, laid(600)?.px], [9, SEA_PX]);
  assert.deepEqual([laid(250)?.spread, laid(250)?.px], [4, SEA_PX]);
  assert.deepEqual([laid(180)?.spread, laid(180)?.px], [0, SEA_PX]);
  assert.deepEqual([laid(140)?.spread, laid(140)?.px], [0, WORD_PX]);
  assert.equal(laid(100), undefined, 'dropped where nothing fits');
  const box = boxOf(laid(600)!);
  assert.ok(box.width > widthOf('The Lantern Sea', 'water') * 1.5, 'stretched across its sea');
});

test('a water’s name under a hand takes its next spot clear of it rather than vanishing', () => {
  const cover = { x: 480, y: 150, width: 120, height: 80 };
  const lettering = layOut({
    ...ASK,
    covers: [cover],
    waters: [water('The Elmwater, 7-10', [560, 190], [380, 190])],
  });
  const elmwater = lettering.letters[0];
  assert.deepEqual([elmwater?.x, elmwater?.y], [380, 190]);
  assert.ok(!overlaps(boxOf(elmwater!), cover));
});

test('a water’s name stands only where it lies wholly on its own sea, else is dropped', () => {
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
      ['Ruins', null, 150, 160],
      ['Fen', 'centre', 60, 160],
      ['Gilt', 'centre', 60, 40],
      ['Cairn', 'centre', 240, 40],
    ],
  );
});

test('a water the key must cover is named again at its next spot clear of it', () => {
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
  for (const letter of lettering.letters) assert.ok(!overlaps(boxOf(letter), lettering.key!.box), letter.text);
});

test('with every corner over land the key still takes one clear of marks, hands and names, rather than vanishing', () => {
  const lettering = layOut({ ...ASK, key: { width: 120, height: 80 }, land: () => true });
  assert.equal(lettering.key?.corner, 'lower-left');
});

test('a water’s name takes a spot wholly on its own sea before an earlier one that runs over a neighbour’s', () => {
  const lettering = layOut({
    ...ASK,
    sea: (box) => (box.x > 300 ? 2 : 1),
    waters: [water('The Elmwater, 7-10', [200, 100], [400, 100])],
  });
  assert.equal(lettering.letters[0]?.x, 400);
});

test("a quest's node's mark over a ruin's moves out along the line between them, just clear", () => {
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
  assert.ok(Math.max(Math.abs(away), Math.abs(down)) >= 10 + 1.5, 'with a clear gap between them');
  assert.ok(Math.max(Math.abs(away), Math.abs(down)) < 10 + 1.5 + 0.5, 'by no more than the overlap and a clear gap');
});

test('a node between two marks clears both, and one on another mark takes a clear spot beside it', () => {
  const lettering = layOut({
    ...ASK,
    places: [
      { text: 'Sunspire', x: 100, y: 200, kind: 'port', chosen: false },
      { text: 'Ruins of Cairnwatch', x: 114, y: 200, kind: 'ruin', chosen: false },
      { text: 'The Highwater Fells', x: 107, y: 200, kind: 'patrol', chosen: false },
      { text: 'The Ochre Wastes', x: 300, y: 100, kind: 'patrol', chosen: false },
      { text: 'Shrine of Tides', x: 300, y: 100, kind: 'shrine', chosen: false },
    ],
  });
  const marks = lettering.letters.map((letter) => markBox(letter.kind, letter.x, letter.y, 1));
  marks.forEach((box, index) =>
    marks.slice(index + 1).forEach((other) => assert.ok(!overlaps(box, other), lettering.letters[index]?.text)),
  );
  assert.deepEqual(
    lettering.letters.slice(0, 2).map((letter) => [letter.x, letter.y]),
    [
      [100, 200],
      [114, 200],
    ],
    'the port and the ruin where they lie',
  );
});

test('a place the quest names keeps its ring through the layout', () => {
  const place = { text: 'Saltgrass Downs', x: 100, y: 100, kind: 'patrol', chosen: false };
  const lettering = layOut({
    ...ASK,
    places: [
      { ...place, quest: true },
      { ...place, text: 'Elsewhere', x: 400 },
    ],
  });
  assert.deepEqual(
    lettering.letters.map((letter) => [letter.text, letter.quest === true]),
    [
      ['Saltgrass Downs', true],
      ['Elsewhere', false],
    ],
  );
});

test('the layout stands while the ship’s arrow sails clear of every name and the key, and gives way once it meets one', () => {
  const lettering = layOut({
    ...ASK,
    key: { width: 120, height: 80 },
    ship: { x: 300, y: 200, heading: 0 },
    waters: [water('Fen', [300, 140])],
  });
  const fen = lettering.letters.find((letter) => letter.text === 'Fen');
  assert.ok(fen && lettering.key, 'the name and the key are laid');
  assert.equal(shipRoomLost(lettering, { x: 306, y: 204 }), false, 'a few pixels on, clear of both');
  assert.equal(shipRoomLost(lettering, null), false, 'off the map, it needs no room');
  assert.equal(shipRoomLost(lettering, { x: fen.x, y: fen.y }), true, 'onto the sea’s name');
  const key = lettering.key.box;
  assert.equal(shipRoomLost(lettering, { x: key.x + key.width / 2, y: key.y + key.height / 2 }), true, 'onto the key');
  assert.equal(shipRoomLost(layOut(ASK), { x: 300, y: 200 }), true, 'laid with the arrow off the map, it has none');
});

test('a layout asks whether a sea’s name lies on its sea once at each spot and size, however many places the key tries', () => {
  const asked: string[] = [];
  const lettering = layOut({
    ...ASK,
    ink: { width: 300, height: 200 },
    key: { width: 120, height: 80 },
    sea: (box) => {
      asked.push(JSON.stringify(box));
      return 2;
    },
    waters: [
      water('Fen', [60, 160], [160, 100]),
      water('Rime', [240, 160]),
      water('Gilt', [60, 40]),
      water('Cairn', [240, 40]),
    ],
  });
  assert.equal(lettering.key?.corner, 'lower-left', 'every corner held a name, so the key tried its places');
  assert.ok(asked.length > 0);
  assert.equal(asked.length, new Set(asked).size, 'no box asked twice');
});
