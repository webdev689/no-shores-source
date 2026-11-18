import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AHEAD, clearAhead, turned } from './seaHelm.ts';

/** A square island 10 km a side, its west coast 30 km east of the origin. */
const ISLAND: readonly (readonly [number, number])[][] = [
  [
    [30_000, -5_000],
    [40_000, -5_000],
    [40_000, 5_000],
    [30_000, 5_000],
  ],
];
const EAST = Math.PI / 2;

const near = (found: readonly number[] | null, wanted: readonly number[], why = '') =>
  assert.ok(
    found?.every((value, index) => Math.abs(value - (wanted[index] ?? NaN)) < 1e-6),
    `${why} ${found}`,
  );

test('straight on reaches the whole way over open water, along her heading', () => {
  near(clearAhead(ISLAND, [0, 0], 0), [0, -AHEAD.reachM]);
  near(clearAhead(ISLAND, [0, 0], Math.PI), [0, AHEAD.reachM]);
  near(clearAhead(ISLAND, [0, 0], EAST, 25_000), [25_000, 0]);
});

test('straight on stops short of the first coast the way meets, and not at all too near one', () => {
  near(clearAhead(ISLAND, [15_000, 0], EAST), [30_000 - AHEAD.shortM, 0]);
  near(clearAhead(ISLAND, [15_000, 4_000], EAST), [30_000 - AHEAD.shortM, 4_000]);
  assert.equal(clearAhead(ISLAND, [29_600, 0], EAST), null, 'the coast 400 m ahead');
  near(clearAhead(ISLAND, [29_600, 0], -EAST), [29_600 - AHEAD.reachM, 0], 'turned away from it, the way is open');
  near(clearAhead(ISLAND, [15_000, 6_000], EAST), [15_000 + AHEAD.reachM, 6_000], 'passing south of the island');
});

test('a coast behind her or beside her way does not stop her', () => {
  near(clearAhead(ISLAND, [45_000, 0], EAST), [45_000 + AHEAD.reachM, 0]);
  near(clearAhead(ISLAND, [35_000, 10_000], Math.PI), [35_000, 10_000 + AHEAD.reachM]);
});

test('a turned heading stays within one turn', () => {
  assert.ok(Math.abs(turned(6.2, 0.2) - (6.4 - 2 * Math.PI)) < 1e-12);
  assert.ok(Math.abs(turned(0.1, -0.3) - (2 * Math.PI - 0.2)) < 1e-12);
  assert.equal(turned(1, 0.5), 1.5);
});
