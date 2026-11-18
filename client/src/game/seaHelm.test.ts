import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Point2 } from '../overworld/ground.ts';
import { AHEAD, clearAhead, turned } from './seaHelm.ts';

/** A point `east` and `south` metres from one well inside the world's frame. */
const place = (east: number, south: number): Point2 => [1_000_000 + east, 1_000_000 + south];
/** A square island 10 km a side, its west coast 30 km east of that point. */
const ISLAND: readonly Point2[][] = [
  [place(30_000, -5_000), place(40_000, -5_000), place(40_000, 5_000), place(30_000, 5_000)],
];
const EAST = Math.PI / 2;

const near = (found: readonly number[] | null, wanted: readonly number[], why = '') =>
  assert.ok(
    found?.every((value, index) => Math.abs(value - (wanted[index] ?? NaN)) < 1e-6),
    `${why} ${found}`,
  );

test('straight on reaches the whole way over open water, along her heading', () => {
  near(clearAhead(ISLAND, place(0, 0), 0), place(0, -AHEAD.reachM));
  near(clearAhead(ISLAND, place(0, 0), Math.PI), place(0, AHEAD.reachM));
  near(clearAhead(ISLAND, place(0, 0), EAST, 25_000), place(25_000, 0));
});

test('straight on stops short of the first coast the way meets, and not at all too near one', () => {
  near(clearAhead(ISLAND, place(15_000, 0), EAST), place(30_000 - AHEAD.shortM, 0));
  near(clearAhead(ISLAND, place(15_000, 4_000), EAST), place(30_000 - AHEAD.shortM, 4_000));
  assert.equal(clearAhead(ISLAND, place(29_600, 0), EAST), null, 'the coast 400 m ahead');
  near(
    clearAhead(ISLAND, place(29_600, 0), -EAST),
    place(29_600 - AHEAD.reachM, 0),
    'turned away from it, the way is open',
  );
  near(
    clearAhead(ISLAND, place(15_000, 6_000), EAST),
    place(15_000 + AHEAD.reachM, 6_000),
    'passing south of the island',
  );
});

test('a coast behind her or beside her way does not stop her', () => {
  near(clearAhead(ISLAND, place(45_000, 0), EAST), place(45_000 + AHEAD.reachM, 0));
  near(clearAhead(ISLAND, place(35_000, 10_000), Math.PI), place(35_000, 10_000 + AHEAD.reachM));
});

test("the world's frame stops her as a coast does, since the sea room takes no point past it", () => {
  near(clearAhead([], [100_000, 10_000], 0), [100_000, AHEAD.shortM]);
  assert.equal(clearAhead([], [100_000, 300], 0), null, 'its edge 300 m ahead');
  near(clearAhead([], [100_000, 300], Math.PI), [100_000, 300 + AHEAD.reachM]);
});

test('a turned heading stays within one turn', () => {
  assert.ok(Math.abs(turned(6.2, 0.2) - (6.4 - 2 * Math.PI)) < 1e-12);
  assert.ok(Math.abs(turned(0.1, -0.3) - (2 * Math.PI - 0.2)) < 1e-12);
  assert.equal(turned(1, 0.5), 1.5);
});
