// A dungeon of two storeys as the page reads it: the ground and the ceiling under a body on its own storey, a flight's
// slope, a Void's fall, the rooms' names by storey, and the solids and slabs standing on their own floors.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { roomNameAt } from './footTrips.ts';
import {
  ceilingAt,
  courseOf,
  type DungeonLayout,
  floorOf,
  groundAt,
  planeOf,
  seenBlocks,
  slopeAt,
  storeyAt,
  storeyOf,
} from './dungeonLayout.ts';

/** Six columns by two rows on two storeys: room 0 at (0, 0) and (1, 1) on top, a flight east along row 0 from its
 *  landing (0, 0) down to room 1's (5, 0), room 1 filling row 1 below, and a Void at (0, 1) over it. */
const stair = { upper: 0, cells: [1, 2, 3, 4], top: 0, bottom: 5 };
const layout = {
  cell: 3.2,
  columns: 6,
  rows: 2,
  storeys: 2,
  storeyM: 8,
  floors: [0, -8],
  stairs: [stair],
  cells: [0, -3, -3, -3, -3, -2, -4, 0, -2, -2, -2, -2, -2, -3, -3, -3, -3, 1, 1, 1, 1, 1, 1, 1],
  ceilings: [4, 3.2, 3.2, 3.2, 3.2, 0, 4, 4, 0, 0, 0, 0, 0, 3.2, 3.2, 3.2, 3.2, 4, 4, 4, 4, 4, 4, 4],
  rooms: [{ name: 'the Ossuary' }, { name: 'the Crypt' }],
  boxes: [[16.5, 4, 17, 4.5, -8, -7]],
} as unknown as DungeonLayout;

test("a cell names its storey and its plane, and a storey's floor lies STOREY_M under the one over it", () => {
  assert.deepEqual([storeyOf(layout, 17), planeOf(layout, 17), floorOf(layout, 1)], [1, 5, -8]);
  assert.deepEqual(
    [storeyAt(layout, 1.5), storeyAt(layout, -3.9), storeyAt(layout, -4.1), storeyAt(layout, -20)],
    [0, 0, 1, 1],
  );
  const older = { ...layout, storeys: undefined, floors: undefined, storeyM: undefined } as unknown as DungeonLayout;
  assert.deepEqual([storeyAt(older, -9), floorOf(older, 0)], [0, 0], 'a module older than storeys stands one');
});

test("a flight's slope falls a storey along it, as the rules walk it", () => {
  assert.equal(slopeAt(layout, stair, 3.2, 1.6), 0);
  assert.equal(slopeAt(layout, stair, 16, 1.6), -8);
  assert.ok(Math.abs(slopeAt(layout, stair, 9.6, 1.6) + 4) < 1e-12);
  assert.ok(Math.abs((groundAt(layout, 9.6, 1.6, -3) ?? NaN) + 4) < 1e-12);
  assert.ok(
    Math.abs((ceilingAt(layout, 9.6, 1.6, -4) ?? NaN) + 0.8) < 1e-12,
    "the camera keeps under the flight's slope",
  );
});

test('the ground under a body is its own storey’s, a Void falls through, and rock or the outside holds none', () => {
  assert.equal(groundAt(layout, 1.6, 1.6, 0), 0);
  assert.equal(groundAt(layout, 1.6, 4.8, 0), -8, 'the Void');
  assert.equal(groundAt(layout, 4.8, 4.8, 0), 0, 'room 0 over room 1');
  assert.equal(groundAt(layout, 4.8, 4.8, -8), -8, 'room 1 under room 0');
  assert.equal(groundAt(layout, 17.6, 1.6, 0), -8);
  assert.equal(groundAt(layout, -1, 1.6, 0), null);
  assert.equal(ceilingAt(layout, 4.8, 4.8, -8), -4);
  assert.equal(ceilingAt(layout, 1.6, 4.8, -8), 4, "the Void lifts the lower room's ceiling to its own");
  assert.equal(ceilingAt(layout, 4.8, 4.8, 0), 4);
  assert.equal(roomNameAt(layout, { x: 4.8, y: 4.8, z: -8 }), 'the Crypt');
  assert.equal(roomNameAt(layout, { x: 4.8, y: 4.8, z: 0 }), 'the Ossuary');
});

test('a solid stands on its own floor, and the slab between two storeys is a block', () => {
  assert.deepEqual(courseOf(layout), [{ minX: 16.5, minY: 4, maxX: 17, maxY: 4.5, top: -7, bottom: -8 }]);
  const slab = { minX: 3.2, minY: 3.2, maxX: 6.4, maxY: 6.4, top: 0, bottom: -4 };
  assert.ok(seenBlocks(layout).some((block) => JSON.stringify(block) === JSON.stringify(slab)));
  const lowerRock = seenBlocks(layout).filter((block) => block.bottom === -8);
  assert.ok(lowerRock.length > 0 && lowerRock.every((block) => block.top === 0 || block.top === -7));
});
