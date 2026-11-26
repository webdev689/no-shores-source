import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { DungeonLayout } from '../dungeonLayout.ts';
import { cellIndex, floorAt, kindAt, storeyOfHeight, storeysOf } from './mapStoreys.ts';

/** Today's one-storey layout: a room, a corridor and rock in a row. */
const flat = { cell: 3.2, columns: 3, rows: 1, cells: [0, -1, -2], ceilings: [4, 3.2, 0] } as unknown as DungeonLayout;

/** A hand-made storeyed layout as the storey engine's keys will give it: two storeys of a 6 by 1 plane, a flight of
 *  four cells (columns 1 to 4) from storey 0's landing at column 0 down to storey 1's landing at column 5, and a void
 *  cell (an unknown code) on storey 0 over the room under it. */
export const STOREYED = {
  cell: 3.2,
  columns: 6,
  rows: 1,
  storeys: 2,
  storeyM: 8,
  floors: [0, -8],
  stairs: [{ upper: 0, cells: [1, 2, 3, 4], top: 0, bottom: 5 }],
  cells: [0, -5, -5, -5, -5, -3, -2, -5, -5, -5, -5, 1],
  ceilings: [4, 3.2, 3.2, 3.2, 3.2, 0, 0, 3.2, 3.2, 3.2, 3.2, 4],
  boxes: [],
} as unknown as DungeonLayout;

test('a layout without storeys reads as one storey at 0 m with no stairs', () => {
  const storeys = storeysOf(flat);
  assert.deepEqual(storeys, { count: 1, floors: [0], plane: 3, stairs: [], storeyM: 8 });
  assert.equal(kindAt(flat, storeys, 0, 0, 0), 'open');
  assert.equal(kindAt(flat, storeys, 0, 1, 0), 'open');
  assert.equal(kindAt(flat, storeys, 0, 2, 0), 'rock');
  assert.equal(kindAt(flat, storeys, 0, 3, 0), 'rock', 'off the grid is rock');
  assert.equal(kindAt(flat, storeys, 1, 0, 0), 'rock', 'a storey the layout lacks is rock');
});

test('a storeyed layout reads its storeys, its flights on both storeys and a void', () => {
  const storeys = storeysOf(STOREYED);
  assert.equal(storeys.count, 2);
  assert.deepEqual(storeys.floors, [0, -8]);
  assert.equal(cellIndex(STOREYED, 1, 2, 0), 8);
  assert.equal(kindAt(STOREYED, storeys, 0, 2, 0), 'stair');
  assert.equal(kindAt(STOREYED, storeys, 1, 2, 0), 'stair');
  assert.equal(kindAt(STOREYED, storeys, 0, 5, 0), 'void');
  assert.equal(kindAt(STOREYED, storeys, 1, 0, 0), 'rock');
  assert.equal(kindAt(STOREYED, storeys, 1, 5, 0), 'open');
});

test('a flight is walked as its ramp, from the upper floor down to the lower', () => {
  const storeys = storeysOf(STOREYED);
  assert.equal(floorAt(STOREYED, storeys, 0, 0, 0), 0);
  assert.equal(floorAt(STOREYED, storeys, 0, 1, 0), -1);
  assert.equal(floorAt(STOREYED, storeys, 1, 4, 0), -7);
  assert.equal(floorAt(STOREYED, storeys, 1, 5, 0), -8);
  assert.equal(floorAt(STOREYED, storeys, 1, 0, 0), null);
});

test('the storey a body stands on is the highest floor under its feet by less than half a storey', () => {
  const storeys = storeysOf(STOREYED);
  assert.equal(storeyOfHeight(storeys, 0), 0);
  assert.equal(storeyOfHeight(storeys, -0.4), 0);
  assert.equal(storeyOfHeight(storeys, -3), 0, "on the flight's upper half, still the storey over");
  assert.equal(storeyOfHeight(storeys, -5), 1);
  assert.equal(storeyOfHeight(storeys, -8), 1);
  assert.equal(storeyOfHeight(storeys, -30), 1);
});
