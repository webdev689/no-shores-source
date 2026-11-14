import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LandMask } from './landMask.ts';
import { simplifyRing, traceCoast } from './traceCoast.ts';

function maskWith(rows: string[]): LandMask {
  const mask = new LandMask((rows[0]?.length ?? 0) * 1000, rows.length * 1000);
  rows.forEach((row, cellY) =>
    [...row].forEach((char, cellX) => (mask.cells[cellY * mask.width + cellX] = char === '#' ? 1 : 0)),
  );
  return mask;
}

test('a square of land traces to its four corners, land on the right', () => {
  const mask = maskWith(['.....', '.###.', '.###.', '.....']);
  assert.deepEqual(traceCoast(mask, 1), [
    [1000, 1000],
    [4000, 1000],
    [4000, 3000],
    [1000, 3000],
  ]);
});

test('an L shape traces to its six corners', () => {
  const mask = maskWith(['#..', '#..', '###']);
  assert.deepEqual(traceCoast(mask, 1), [
    [0, 0],
    [1000, 0],
    [1000, 2000],
    [3000, 2000],
    [3000, 3000],
    [0, 3000],
  ]);
});

test('a lake inside is not part of the coast', () => {
  const mask = maskWith(['###', '#.#', '###']);
  assert.deepEqual(traceCoast(mask, 1), [
    [0, 0],
    [3000, 0],
    [3000, 3000],
    [0, 3000],
  ]);
});

test('no land traces to nothing', () => {
  assert.deepEqual(traceCoast(maskWith(['...']), 1), []);
});

test('a staircase simplifies to its diagonal within the tolerance', () => {
  const mask = maskWith(['#....', '##...', '###..', '####.', '#####']);
  const coast = traceCoast(mask, 1);
  assert.equal(coast.length, 12);
  const simple = simplifyRing(coast, 1000);
  assert.deepEqual(simple, [
    [0, 0],
    [5000, 5000],
    [0, 5000],
  ]);
  assert.deepEqual(simplifyRing(coast, 0), coast, 'no tolerance keeps every point');
});

test('simplifying keeps the points whole metres from the original ring', () => {
  const mask = maskWith(['..##..', '.####.', '######', '.####.', '..##..']);
  const coast = traceCoast(mask, 1);
  const simple = simplifyRing(coast, 900);
  assert.ok(simple.length >= 3 && simple.length < coast.length);
  for (const point of simple) assert.ok(coast.some(([x, y]) => x === point[0] && y === point[1]));
});
