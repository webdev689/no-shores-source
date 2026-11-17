import assert from 'node:assert/strict';
import { test } from 'node:test';
import { COAST_BAND_M, coastField, NO_ISLAND } from './coastField.ts';

// Two square islands 100 km a side on a grid of 10 km cells: the first from 100 to 200 km, the second from 400 km.
const square = (left: number) =>
  [
    [left, 100_000],
    [left + 100_000, 100_000],
    [left + 100_000, 200_000],
    [left, 200_000],
  ] as const;
const field = coastField([square(100_000), square(400_000)], 60, 40, 10_000);
const cellAt = (x: number, y: number) => {
  const index = Math.floor(y / 10_000) * field.columns + Math.floor(x / 10_000);
  return { distance: field.distance[index], island: field.island[index] };
};

test("a cell's distance is to the nearest coast, negative on land", () => {
  assert.equal(cellAt(155_000, 155_000).distance, -45_000, "the first island's middle, 45 km in");
  assert.equal(cellAt(225_000, 155_000).distance, 25_000, '25 km off its east coast');
  assert.equal(cellAt(105_000, 105_000).distance, -5_000, 'by its corner');
});

test('past the band the distance is held at it, and no island is nearest', () => {
  assert.equal(cellAt(305_000, 355_000).distance, COAST_BAND_M);
  assert.equal(cellAt(305_000, 355_000).island, NO_ISLAND);
});

test('each cell knows whose coast is nearest it', () => {
  assert.equal(cellAt(235_000, 155_000).island, 0);
  assert.equal(cellAt(375_000, 155_000).island, 1);
  assert.equal(cellAt(455_000, 155_000).island, 1);
});
