import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OPEN_SKY, SHELTER_CELL_M, SHELTER_CELLS, sheltered, shelterOver, stillServes } from './shelter.ts';

// A hall 20 m square: its floor slab at 100 m, its walls, and its roof slab from 112 m to 114 m.
const FLOOR = { minX: 1000, minY: 2000, maxX: 1020, maxY: 2020, top: 100, bottom: 99 };
const WALL = { minX: 1000, minY: 2000, maxX: 1001, maxY: 2020, top: 112, bottom: 100 };
const ROOF = { minX: 1000, minY: 2000, maxX: 1020, maxY: 2020, top: 114, bottom: 112 };
const HALL = [FLOOR, WALL, ROOF];
const EYE = [1010, 2010, 101.7] as const;

test('under a roof is sheltered, on it and beside it is not', () => {
  const shelter = shelterOver(HALL, EYE);
  assert.ok(sheltered(shelter, [1010, 2010, 100]), 'the floor under the roof');
  assert.ok(sheltered(shelter, [1015, 2004, 106]), 'the air in the hall');
  assert.ok(!sheltered(shelter, [1010, 2010, 114]), 'the roof top');
  assert.ok(!sheltered(shelter, [1030, 2010, 100]), 'the open ground beside the hall');
  assert.ok(!sheltered(shelter, [1010, 2010, 120]), 'the air over the roof');
});

test('a slab standing on the ground shelters nothing beside it or on it', () => {
  const shelter = shelterOver([FLOOR], EYE);
  assert.ok(!sheltered(shelter, [1010, 2010, 100]));
  assert.ok(shelter.undersides.every((under) => under === OPEN_SKY || under === 99 - shelter.base));
});

test('the grid stands on the world lattice round the eye, and outside it is open sky', () => {
  const shelter = shelterOver(HALL, EYE);
  assert.equal(shelter.west % SHELTER_CELL_M, 0);
  assert.equal(shelter.north % SHELTER_CELL_M, 0);
  assert.equal(shelter.undersides.length, SHELTER_CELLS * SHELTER_CELLS);
  const far = SHELTER_CELLS * SHELTER_CELL_M;
  const everywhere = shelterOver([{ ...ROOF, minX: 0, maxX: 1e5, minY: 0, maxY: 1e5 }], EYE);
  assert.ok(!sheltered(everywhere, [EYE[0] + far, 2010, 100]));
});

test('a grid serves an eye near its middle and is laid again further off', () => {
  const shelter = shelterOver(HALL, EYE);
  assert.ok(stillServes(shelter, [EYE[0] + 10, EYE[1] - 10, EYE[2]]));
  assert.ok(!stillServes(shelter, [EYE[0] + 40, EYE[1], EYE[2]]));
});
