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

test('a roof ending at a wall off the grid lattice still shelters the floor up to the wall', () => {
  const roof = { minX: 1000, minY: 2000, maxX: 1020.9, maxY: 2020, top: 114, bottom: 112 };
  const wall = { minX: 1020.9, minY: 2000, maxX: 1025.9, maxY: 2020, top: 114, bottom: 99 };
  const shelter = shelterOver([roof, wall], EYE);
  assert.ok(sheltered(shelter, [1020.5, 2010, 100.6]), 'the floor by the wall');
  assert.ok(!sheltered(shelter, [1028, 2010, 100.6]), 'the ground outside the wall');
});

test('the far end of a long hall is sheltered from wherever in it the grid was laid', () => {
  const hall = { minX: 1000, minY: 2000, maxX: 1068, maxY: 2060, top: 114, bottom: 112 };
  const laidAt = [1034, 2078, 101.7] as const;
  const shelter = shelterOver([hall], laidAt);
  const door = [1034, 2062, 101.7] as const;
  assert.ok(stillServes(shelter, door));
  for (const end of [
    [1034, 2001],
    [1001, 2030],
    [1067, 2030],
  ] as const)
    assert.ok(sheltered(shelter, [end[0], end[1], 100.6]), `${end.join(',')} at the hall's far side`);
});

test('a piece narrower than a cell overhead (a brazier, a lamp) keeps no square of ground dry', () => {
  const bowl = { minX: 1100.5, minY: 2000.5, maxX: 1101.5, maxY: 2001.5, top: 101.6, bottom: 101.1 };
  const shelter = shelterOver([bowl], [1100, 2000, 101.7]);
  assert.ok(!sheltered(shelter, [1101.9, 2001, 100]), 'beside the bowl');
  assert.ok(shelter.undersides.every((under) => under === OPEN_SKY));
});

test('a room walked into is dry everywhere inside its lining, wherever its walls fall on the grid', () => {
  // Its ceiling's box spans it to its outer faces, as a room's does (crates/layout/src/interiors.rs); its lining's inner
  // face stands 0.24 m inside them.
  const inside = 0.24;
  for (let step = 0; step < 40; step++) {
    const offset = step * 0.05;
    const [west, north, east, south] = [1000 + offset, 2000 + offset, 1008 + offset, 2006 + offset];
    const ceiling = { minX: west, minY: north, maxX: east, maxY: south, top: 103, bottom: 102.84 };
    const shelter = shelterOver([ceiling], EYE);
    for (let x = west + inside + 0.01; x < east - inside; x += 0.1)
      for (const y of [north + inside + 0.01, (north + south) / 2, south - inside - 0.01])
        assert.ok(
          sheltered(shelter, [x, y, 101.5]),
          `dry at (${x.toFixed(2)}, ${y.toFixed(2)}), the room ${offset} m off`,
        );
  }
});
