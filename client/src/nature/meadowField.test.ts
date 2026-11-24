import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { NatureGround } from './field.ts';
import type { GroundAt } from './ground.ts';
import { CELL_M, GRID, grassShare, MeadowField, readCell, REACH_M } from './meadowField.ts';

const meadowAt = (more: Partial<GroundAt> = {}): GroundAt => ({
  height: 20,
  slope: 0.05,
  water: 'dry',
  mark: 0,
  ...more,
});

test('grass grows on dry, open, gentle ground, and not on water, a road, a town or what is kept clear', () => {
  assert.equal(grassShare(meadowAt(), false, 2300), 1);
  assert.equal(grassShare(meadowAt({ water: 'river' }), false, 2300), 0);
  assert.equal(grassShare(meadowAt({ mark: 3 }), false, 2300), 0);
  assert.equal(grassShare(meadowAt({ mark: 4 }), false, 2300), 0);
  assert.equal(grassShare(meadowAt(), true, 2300), 0);
});

test('stone shows through as a slope steepens, dirt comes in up high, and none grows under the snow or on a beach', () => {
  assert.equal(grassShare(meadowAt({ slope: 0.29 }), false, 2300), 1);
  assert.ok(grassShare(meadowAt({ slope: 0.38 }), false, 2300) < 1);
  assert.equal(grassShare(meadowAt({ slope: 0.5 }), false, 2300), 0);
  assert.ok(grassShare(meadowAt({ height: 900 }), false, 2300) < 0.6);
  assert.equal(grassShare(meadowAt({ height: 2250 }), false, 2300), 0);
  assert.equal(grassShare(meadowAt({ height: 1, coastM: 20 }), false, 2300), 0);
  assert.equal(grassShare(meadowAt({ height: 1, coastM: 200 }), false, 2300), 1);
});

/** A ground of gentle meadow rising eastward, a road along y = 40 and the sea west of x = -100. */
function ground(
  version = 1,
  unchanged?: NatureGround['unchanged'],
  biome = 'temperate-coast',
): NatureGround & { reads: number } {
  const made = {
    biome,
    snowM: 2300,
    version,
    unchanged,
    reads: 0,
    cleared: () => false,
    sample: (x: number, y: number): GroundAt => {
      made.reads++;
      return meadowAt({ height: 10 + x * 0.01, water: x < -100 ? 'sea' : 'dry', mark: Math.abs(y - 40) < 3 ? 3 : 0 });
    },
  };
  return made;
}

test("a cell's grid is the ground's height and grass share, its edges shared with its neighbours'", () => {
  const { grid, low, high } = readCell(2, 2, ground());
  assert.equal(grid.length, GRID * GRID * 2);
  const sample = (column: number, row: number) => [
    grid[(row * GRID + column) * 2],
    grid[(row * GRID + column) * 2 + 1],
  ];
  assert.ok(Math.abs((sample(0, 0)[0] ?? 0) - (10 + 2 * CELL_M * 0.01)) < 1e-6 && sample(0, 0)[1] === 1);
  assert.ok(
    Math.abs((sample(GRID - 1, 0)[0] ?? 0) - (10 + 3 * CELL_M * 0.01)) < 1e-6,
    "its east edge is the next cell's west",
  );
  assert.equal(sample(4, 4)[1], 0, 'none on the road');
  assert.ok(low < high);
  assert.ok(
    readCell(0, 0, ground(1, undefined, 'desert')).grid.every((value, index) => index % 2 === 0 || value === 0),
  );
});

test('the field keeps the cells round the eye, nearest first, and lets those out of reach go', () => {
  const field = new MeadowField(512, Infinity);
  const land = ground();
  assert.equal(field.update(0, 0, land), false);
  const kept = [...field.cells.values()];
  assert.ok(kept.length > 300 && kept.length <= 512);
  assert.equal(field.filled[0]?.x, -1, 'the eye stands at a corner, so a nearest cell first');
  assert.ok(kept.every(({ slot }) => slot >= 0 && slot < 512));
  assert.equal(new Set(kept.map(({ slot }) => slot)).size, kept.length, 'no two share a slot');
  field.update(1000, 0, land);
  assert.ok([...field.cells.values()].every(({ x }) => x * CELL_M > 1000 - REACH_M - 2 * CELL_M));
});

test('a frame reads no more than its budget, and the rest wait', () => {
  let clock = 0;
  const field = new MeadowField(512, 5);
  const waiting = field.update(0, 0, ground(), () => (clock += 1));
  assert.ok(waiting && field.filled.length > 0 && field.filled.length < 10);
});

test('a changed ground is read again only where it changed', () => {
  const field = new MeadowField(512, Infinity);
  field.update(0, 0, ground(1));
  const before = field.cells.size;
  const changed = ground(2, (tileX) => tileX !== 0);
  field.update(0, 0, changed);
  assert.ok(field.filled.length > 0 && field.filled.length < before);
  assert.ok(field.filled.every(({ x }) => Math.floor((x * CELL_M) / 64) === 0));
  assert.equal(field.update(0, 0, changed), false);
  assert.equal(field.filled.length, 0, 'then nothing more');
});
