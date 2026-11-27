import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CellSums } from './heldMapWaters.ts';
import { anyCellUnder } from './mapKey.ts';

test('the summed cells answer as asking every few pixels does wherever the steps are finer than a cell', () => {
  const grid = { columns: 40, rows: 30, cellM: 4800 };
  let seed = 7;
  const random = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const marked = Array.from({ length: grid.columns * grid.rows }, () => random() < 0.08);
  const test = (cell: number) => marked[cell] === true;
  const sums = new CellSums(grid, test);
  // Half a cell to six pixels: from 1,200 m a pixel, where a step of four pixels spans a cell, down to closer views.
  for (const scale of [1 / 1200, 1 / 600, 1 / 100, 1 / 20])
    for (let each = 0; each < 400; each++) {
      const view = { left: (random() - 0.2) * 50_000, top: (random() - 0.2) * 50_000, scale };
      const box = { x: random() * 900 - 100, y: random() * 600 - 100, width: random() * 160, height: random() * 24 };
      assert.equal(sums.anyUnder(view, box), anyCellUnder(grid, view, box, test), JSON.stringify({ view, box }));
    }
});

test('a box wholly off the grid asks no cell', () => {
  const sums = new CellSums({ columns: 4, rows: 4, cellM: 100 }, () => true);
  assert.equal(sums.anyUnder({ left: 0, top: 0, scale: 1 }, { x: -50, y: 0, width: 20, height: 20 }), false);
  assert.equal(sums.anyUnder({ left: 0, top: 0, scale: 1 }, { x: 500, y: 0, width: 20, height: 20 }), false);
  assert.equal(sums.anyUnder({ left: 0, top: 0, scale: 1 }, { x: 390, y: 390, width: 20, height: 20 }), true);
});
