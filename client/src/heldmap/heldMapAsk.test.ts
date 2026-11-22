import assert from 'node:assert/strict';
import { test } from 'node:test';
import { askLines, hoverLine, litCells, MapAsk, otherWater, paintTravelAsk, travelAsked } from './heldMapAsk.ts';
import { recorder } from './painterForTests.ts';
import type { MapWaters } from './watersWash.ts';

/** Three rows of four cells, 1,000 m a cell: water 0 to the west, land (-1) in the middle column, water 1 east. */
const waters: MapWaters = {
  columns: 4,
  rows: 3,
  cellM: 1_000,
  water: Int16Array.from([0, -1, 1, 1, 0, -1, 1, 1, 0, 0, 1, 1]),
  seam: new Uint8Array(12),
  waters: [
    { continent: 0, id: 'continent-1', name: 'The Lantern Sea', holder: 'home', levels: [1, 5] },
    { continent: 1, id: 'continent-3', name: 'The Elmwater', holder: 'grey-tithe', levels: [8, 14] },
  ],
  mainPorts: [],
};
const WEST: readonly [number, number] = [500, 500];
const EAST: readonly [number, number] = [3_500, 1_500];
const LAND: readonly [number, number] = [1_500, 500];

test('the water under the pointer is the one another than the ship is in, none for its own or for land', () => {
  assert.equal(otherWater(waters, EAST, WEST)?.name, 'The Elmwater');
  assert.equal(otherWater(waters, [2_500, 2_500], WEST)?.continent, 1);
  assert.equal(otherWater(waters, [500, 2_500], WEST), null, 'the ship’s own water');
  assert.equal(otherWater(waters, LAND, WEST), null, 'land');
  assert.equal(otherWater(waters, [-10, 500], WEST), null, 'off the frame');
});

test('the lit water covers its own cells and the land beside it, never another water', () => {
  const lit = litCells(waters, 1);
  assert.deepEqual([...lit], [0, 255, 255, 255, 0, 255, 255, 255, 0, 0, 255, 255]);
  assert.deepEqual([...litCells(waters, null)], new Array(12).fill(0));
});

test('the hover names the water, its holder and its level band', () => {
  assert.equal(hoverLine(waters.waters[1]!), 'The Elmwater · Grey Tithe · levels 8-14');
  assert.equal(hoverLine({ ...waters.waters[1]!, name: null, levels: null }), 'continent-3 · Grey Tithe');
});

test('a course whose end lies in another water asks to travel there; one within the ship’s own asks nothing', () => {
  assert.equal(travelAsked(waters, [WEST, [500, 2_500], EAST], WEST)?.name, 'The Elmwater');
  assert.equal(travelAsked(waters, [WEST, [500, 2_500]], WEST), null);
  assert.equal(travelAsked(waters, [], WEST), null);
});

test('the prompt asks to travel to the water, with its holder and level band, and its answers', () => {
  const lines = askLines(waters.waters[1]!, 'Enter');
  assert.deepEqual(lines, ['Travel to The Elmwater?', 'Grey Tithe · levels 8-14', 'Yes  Enter      No  Escape']);
  const { painter, texts } = recorder();
  paintTravelAsk(painter, { width: 400, height: 300 }, 1, lines);
  assert.deepEqual(texts(), lines);
});

test('the map’s ask lights the water under the pointer once, and lets it go off the map or over the ship’s own', () => {
  const ask = new MapAsk();
  const view = { left: 0, top: 0, scale: 0.1 };
  const ink = { x: 10, y: 20, width: 400, height: 300 };
  ask.pointer = { x: 10 + 350, y: 20 + 150 };
  const first = ask.hover(waters, view, ink, WEST);
  assert.equal(first.cells?.[3], 255, 'the east water lit');
  assert.equal(first.said?.line, 'The Elmwater · Grey Tithe · levels 8-14');
  assert.equal(ask.hover(waters, view, ink, WEST).cells, null, 'lit once while it stays under the pointer');
  ask.pointer = { x: 10 + 50, y: 20 + 50 };
  const own = ask.hover(waters, view, ink, WEST);
  assert.deepEqual([own.cells?.[3], own.said], [0, null], 'the ship’s own water lets it go');
  ask.pointer = null;
  assert.equal(ask.hover(waters, view, ink, EAST).said, null);
});

test('the map’s ask asks for a course into another water; no lets it go, a new choice asks again', () => {
  const ask = new MapAsk();
  ask.choose(waters, { ok: true, points: [WEST, EAST] }, WEST);
  assert.equal(ask.asking?.name, 'The Elmwater');
  assert.equal(ask.answerNo(), true, 'no is taken while it asks');
  assert.equal(ask.asking, null);
  assert.equal(ask.answerNo(), false, 'and not again');
  ask.choose(waters, { ok: true, points: [WEST, [500, 2_500]] }, WEST);
  assert.equal(ask.asking, null, 'within the ship’s own water');
  ask.choose(waters, { ok: false, why: 'No water leads there.' }, WEST);
  assert.equal(ask.asking, null, 'a course refused');
});
