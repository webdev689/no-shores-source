import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  askLines,
  type AskWaters,
  hoverLine,
  litCells,
  MapAsk,
  otherWater,
  paintHover,
  paintTravelAsk,
  type WaterJudge,
} from './heldMapAsk.ts';
import { recorder } from './painterForTests.ts';
import type { MapWaters } from './watersWash.ts';

/** Three rows of four cells, 1,000 m a cell: water 0 to the west, land (-1) in the middle column, water 1 east. */
const waters: MapWaters = {
  columns: 4,
  rows: 3,
  cellM: 1_000,
  water: Int16Array.from([0, -1, 1, 1, 0, -1, 1, 1, 0, 0, 1, 1]),
  waters: [
    { continent: 0, id: 'continent-1', name: 'The Lantern Sea', holder: 'home', levels: [1, 5] },
    { continent: 1, id: 'continent-3', name: 'The Elmwater', holder: 'grey-tithe', levels: [8, 14] },
  ],
  mainPorts: [],
};
const WEST: readonly [number, number] = [500, 500];
const EAST: readonly [number, number] = [3_500, 1_500];
const LAND: readonly [number, number] = [1_500, 500];
/** The exact rule (the room's): the water west of 1,500 m is the first, east of it the second, land in neither; a
 *  coast's own water reads the grid's land cell as sea. The first is home north of 2,000 m, the Grey Tithe's past it. */
const exact: WaterJudge = ([x, y]) => {
  const continent = x < 1_500 ? 0 : x >= 1_600 ? 1 : null;
  if (continent === null) return null;
  return { continent, holder: continent === 0 && y < 2_000 ? 'home' : 'grey-tithe' };
};
/** How far each cell lies from the first water's coast: its south row past the reach, so washed as the Grey Tithe's. */
const reach = { distance: Float32Array.from([500, 0, 0, 0, 500, 0, 0, 0, 2_500, 2_500, 0, 0]), reachM: 2_000 };
const asked: AskWaters = { waters, judge: exact, reach, travelShortM: 400 };

test('the water under the pointer is the one another than the ship is in, none for its own or for land', () => {
  assert.equal(otherWater(waters, EAST, 0)?.name, 'The Elmwater');
  assert.equal(otherWater(waters, [2_500, 2_500], 0)?.continent, 1);
  assert.equal(otherWater(waters, [500, 2_500], 0), null, 'the ship’s own water');
  assert.equal(otherWater(waters, EAST, 1), null, 'the ship’s own water, as the exact rule has it');
  assert.equal(otherWater(waters, LAND, 0), null, 'land');
  assert.equal(otherWater(waters, [-10, 500], 0), null, 'off the frame');
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
  const first = ask.hover(asked, view, ink, WEST);
  assert.equal(first.cells?.[3], 255, 'the east water lit');
  assert.equal(first.said?.line, 'The Elmwater · Grey Tithe · levels 8-14');
  assert.equal(ask.hover(asked, view, ink, WEST).cells, null, 'lit once while it stays under the pointer');
  ask.pointer = { x: 10 + 50, y: 20 + 50 };
  const own = ask.hover(asked, view, ink, WEST);
  assert.deepEqual([own.cells?.[3], own.said], [0, null], 'the ship’s own water lets it go');
  ask.pointer = null;
  assert.equal(ask.hover(asked, view, ink, EAST).said, null);
});

test('the map’s ask asks for a course anywhere at sea, in another water or its own; no lets it go, a new choice asks again', () => {
  const ask = new MapAsk();
  // Read through a call: a strict assert that it is null would narrow `ask.asking` for the rest of the test.
  const askingName = (): string | null => ask.asking?.name ?? null;
  ask.choose(asked, { ok: true, points: [WEST, EAST] }, WEST);
  assert.equal(askingName(), 'The Elmwater');
  assert.equal(ask.answerNo(), true, 'no is taken while it asks');
  assert.equal(askingName(), null);
  assert.equal(ask.answerNo(), false, 'and not again');
  ask.choose(asked, { ok: true, points: [WEST, [500, 2_500]] }, WEST);
  assert.equal(askingName(), 'The Lantern Sea', 'within the ship’s own water');
  ask.choose(asked, { ok: false, why: 'No water leads there.' }, WEST);
  assert.equal(askingName(), null, 'a course refused');
  ask.choose(asked, { ok: true, points: [WEST, LAND] }, WEST);
  assert.equal(askingName(), null, 'an end whose water is unknown asks nothing');
});

test('the prompt is judged by the exact rule, not the grid: a coast’s sea the grid reads as land still asks', () => {
  const ask = new MapAsk();
  const coastSea: readonly [number, number] = [1_700, 500];
  assert.equal(waters.water[1], -1, 'the grid has its cell as land');
  ask.choose(asked, { ok: true, points: [WEST, coastSea] }, WEST);
  assert.equal(ask.asking?.name, 'The Elmwater');
  ask.choose(asked, { ok: true, points: [EAST, [3_500, 500]] }, [1_700, 1_500]);
  assert.equal(ask.asking?.name, 'The Elmwater', 'a ship whose cell the grid misreads asks for its own water');
});

test('the pointer’s words stand to its right, drawn back where they would run off the map', () => {
  const placed = (x: number) => {
    const { painter, calls } = recorder();
    paintHover(painter, 'The Elmwater · Grey Tithe · levels 8-14', x, 100, { width: 400, height: 300 }, 1);
    const moved = calls.find((call) => call.name === 'translate')?.args as number[];
    return moved[0]!;
  };
  assert.equal(placed(50), 64, 'right of the pointer');
  const width = 'The Elmwater · Grey Tithe · levels 8-14'.length * 6;
  assert.equal(placed(380), 400 - 6 - width, 'ending at the map’s edge, near it');
});

test('the pointer’s words stand where it came into the water, so moving within it paints nothing anew', () => {
  const ask = new MapAsk();
  const view = { left: 0, top: 0, scale: 0.1 };
  const ink = { x: 10, y: 20, width: 400, height: 300 };
  ask.pointer = { x: 10 + 350, y: 20 + 150 };
  const first = ask.hover(asked, view, ink, WEST).said;
  ask.pointer = { x: 10 + 360, y: 20 + 120 };
  assert.equal(ask.hover(asked, view, ink, WEST).said, first, 'the same words, where they stood');
  ask.pointer = { x: 10 + 50, y: 20 + 50 };
  ask.hover(asked, view, ink, WEST);
  ask.pointer = { x: 10 + 360, y: 20 + 120 };
  assert.deepEqual(ask.hover(asked, view, ink, WEST).said, { ...first!, x: 360, y: 120 }, 'come in again, anew');
});

test('the prompt names the key that answers no as the last device used names it', () => {
  assert.deepEqual(askLines(waters.waters[1]!, 'A', 'B').at(-1), 'Yes  A      No  B');
});

test('the pointer’s words stand anew once the map has moved under them', () => {
  const ask = new MapAsk();
  const ink = { x: 10, y: 20, width: 400, height: 300 };
  ask.pointer = { x: 10 + 350, y: 20 + 150 };
  ask.hover(asked, { left: 0, top: 0, scale: 0.1 }, ink, WEST);
  ask.pointer = { x: 10 + 300, y: 20 + 100 };
  const panned = ask.hover(asked, { left: 100, top: 0, scale: 0.1 }, ink, WEST);
  assert.deepEqual([panned.cells, panned.said?.x, panned.said?.y], [null, 300, 100], 'by the pointer, the wash kept');
});

test('the prompt and the hover say who holds the sea where they point, not the water as near its coast', () => {
  const ask = new MapAsk();
  ask.choose(asked, { ok: true, points: [WEST, [500, 2_500]] }, WEST);
  assert.deepEqual(ask.asking && askLines(ask.asking, 'Enter')[1], 'Grey Tithe · levels 1-5', 'past the reach');
  ask.choose(asked, { ok: true, points: [[500, 2_500], WEST] }, [500, 2_500]);
  assert.deepEqual(ask.asking && askLines(ask.asking, 'Enter')[1], 'Home · levels 1-5', 'within it');
  const view = { left: 0, top: 0, scale: 0.1 };
  const ink = { x: 10, y: 20, width: 400, height: 300 };
  ask.pointer = { x: 10 + 50, y: 20 + 250 };
  assert.equal(ask.hover(asked, view, ink, EAST).said?.line, 'The Lantern Sea · Grey Tithe · levels 1-5');
  ask.pointer = { x: 10 + 50, y: 20 + 50 };
  const home = ask.hover(asked, view, ink, EAST);
  assert.deepEqual([home.cells, home.said?.line], [null, 'The Lantern Sea · Home · levels 1-5'], 'said anew, unlit');
});

test('a course too short for a travel to move the ship asks nothing, so Set sail sails it', () => {
  const ask = new MapAsk();
  const askingName = (): string | null => ask.asking?.name ?? null;
  ask.choose(asked, { ok: true, points: [WEST, [500, 900]] }, WEST);
  assert.equal(askingName(), null, '400 m: the travel would lay the ship where it lies');
  ask.choose(asked, { ok: true, points: [WEST, WEST] }, WEST);
  assert.equal(askingName(), null, 'the ship’s own place');
  ask.choose(asked, { ok: true, points: [WEST, [500, 901]] }, WEST);
  assert.equal(askingName(), 'The Lantern Sea', 'a metre more');
});

test('a ship whose own water is unknown asks nothing', () => {
  const ask = new MapAsk();
  ask.choose(asked, { ok: true, points: [LAND, EAST] }, LAND);
  assert.equal(ask.asking, null);
});
