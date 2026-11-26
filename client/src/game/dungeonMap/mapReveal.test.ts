import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { DungeonLayout } from '../dungeonLayout.ts';
import { Reveal, REVEAL } from './mapReveal.ts';
import { STOREYED } from './mapStoreys.test.ts';
import { cellIndex, storeysOf } from './mapStoreys.ts';

/** A row of twelve cells (38.4 m): a room of three, a corridor of eight, rock at the far end, and rock under it. */
const row = {
  cell: 3.2,
  columns: 12,
  rows: 2,
  cells: [0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -2, ...Array<number>(12).fill(-2)],
  ceilings: Array<number>(24).fill(3.2),
  boxes: [],
} as unknown as DungeonLayout;

/** The same row with a pillar standing across the corridor's fourth cell. */
const blocked = { ...row, boxes: [[16, 0, 19.2, 3.2, 4]] } as unknown as DungeonLayout;

const revealOf = (layout: DungeonLayout) => new Reveal(layout, storeysOf(layout));

test('a cell is drawn once it is walked or seen across the floor, as far as the sight reaches', () => {
  const reveal = revealOf(row);
  assert.equal(reveal.tick([1.6, 1.6, 0], REVEAL.everyS), true);
  assert.ok(reveal.cells.has(0), 'walked');
  assert.ok(reveal.cells.has(6), 'seen down the corridor (20.8 m to its middle edge is within reach)');
  assert.ok(!reveal.cells.has(8), 'past the sight');
  assert.ok(!reveal.cells.has(11) && !reveal.cells.has(12), 'rock is never drawn');
});

test('the feet are read five times a second, and a point already walked casts nothing new', () => {
  const reveal = revealOf(row);
  assert.equal(reveal.tick([1.6, 1.6, 0], REVEAL.everyS / 2), false, 'too soon');
  assert.equal(reveal.tick([1.6, 1.6, 0], REVEAL.everyS / 2), true);
  assert.equal(reveal.tick([1.7, 1.6, 0], REVEAL.everyS), false, 'the same metre');
});

test('a solid standing over the rise stops the sight', () => {
  const reveal = revealOf(blocked);
  reveal.tick([1.6, 1.6, 0], REVEAL.everyS);
  assert.ok(reveal.cells.has(4));
  assert.ok(!reveal.cells.has(6), 'behind the pillar');
});

test('a step between two reads is walked through, and the cells it crosses are walked', () => {
  const reveal = revealOf(row);
  reveal.tick([25, 1.6, 0], REVEAL.everyS);
  reveal.tick([27.5, 1.6, 0], REVEAL.everyS);
  assert.ok(reveal.walked.has('26,1,0'), 'the metre between the two reads');
  reveal.tick([5, 1.6, 0], REVEAL.everyS);
  assert.ok(!reveal.walked.has('15,1,0'), 'a jump of more than 3 m is a carry, not a walk');
});

test('on a storeyed layout sight goes down a flight to the storey under, never up one', () => {
  const storeys = storeysOf(STOREYED);
  const upper = new Reveal(STOREYED, storeys);
  upper.tick([1.6, 1.6, 0], REVEAL.everyS);
  assert.ok(upper.cells.has(cellIndex(STOREYED, 0, 4, 0)), 'down the flight');
  assert.ok(upper.cells.has(cellIndex(STOREYED, 1, 4, 0)), 'a flight cell is drawn on both its storeys');
  assert.ok(upper.cells.has(cellIndex(STOREYED, 1, 5, 0)), 'the landing at its foot, on the storey under');
  assert.ok(!upper.cells.has(cellIndex(STOREYED, 0, 5, 0)), 'not the open air over the landing, past the flight');
  const lower = new Reveal(STOREYED, storeys);
  lower.tick([17.6, 1.6, -8], REVEAL.everyS);
  assert.ok(lower.cells.has(cellIndex(STOREYED, 1, 5, 0)));
  assert.ok(!lower.cells.has(cellIndex(STOREYED, 1, 3, 0)), 'up the flight is a rise past what is seen over');
  assert.ok(!lower.cells.has(cellIndex(STOREYED, 0, 0, 0)), 'never the storey over');
});

test('from half way down a flight, sight goes on down it and never back up', () => {
  const storeys = storeysOf(STOREYED);
  const reveal = new Reveal(STOREYED, storeys);
  reveal.tick([8, 1.6, -3], REVEAL.everyS);
  assert.ok(reveal.cells.has(cellIndex(STOREYED, 1, 4, 0)), 'the flight under the feet');
  assert.ok(reveal.cells.has(cellIndex(STOREYED, 1, 5, 0)), 'the landing at its foot');
  assert.ok(!reveal.cells.has(cellIndex(STOREYED, 0, 0, 0)), 'not the landing at its head, a rise away');
});

test('what was revealed is kept and given back', () => {
  const reveal = revealOf(row);
  reveal.tick([1.6, 1.6, 0], REVEAL.everyS);
  const again = new Reveal(row, storeysOf(row), [...reveal.cells]);
  assert.deepEqual([...again.cells].sort(), [...reveal.cells].sort());
});

test('sight crosses open air over the storey under, at the height it was cast from', () => {
  const gallery = {
    ...STOREYED,
    stairs: [],
    cells: [0, -3, -3, 0, -2, -2, 1, 1, 1, 1, -2, -2],
  } as unknown as DungeonLayout;
  const reveal = new Reveal(gallery, storeysOf(gallery));
  reveal.tick([1.6, 1.6, 0], REVEAL.everyS);
  assert.ok(reveal.cells.has(cellIndex(gallery, 0, 2, 0)), 'the open air');
  assert.ok(reveal.cells.has(cellIndex(gallery, 0, 3, 0)), 'the floor across it');
});
