import assert from 'node:assert/strict';
import { test } from 'node:test';
import { KEEP_RIGHT_M, alongPath, pathThrough } from './paths.ts';

type Point = readonly [number, number];
const turned = (one: number, two: number) => Math.abs(Math.atan2(Math.sin(two - one), Math.cos(two - one)));

test('a walker keeps right of the way, so two walking it toward each other pass side by side', () => {
  const east = pathThrough([
    [0, 3],
    [0, 0],
    [10, 0],
    [20, 0],
    [20, 3],
  ]);
  const west = pathThrough([
    [20, -3],
    [20, 0],
    [10, 0],
    [0, 0],
    [0, -3],
  ]);
  const middleOf = (path: typeof east) => path.points.find((point) => Math.abs(point[0] - 10) < 1e-9) as Point;
  // Facing east, the right is south (+y); facing west, north.
  assert.deepEqual(middleOf(east), [10, KEEP_RIGHT_M]);
  assert.deepEqual(middleOf(west), [10, -KEEP_RIGHT_M]);
  assert.deepEqual(
    [east.points[0], east.points.at(-1)],
    [
      [0, 3],
      [20, 3],
    ],
    'its ends, the posts, stay put',
  );
});

test('a corner is rounded: the walker turns a little at a time, inside the corner of the kept-right ways', () => {
  const path = pathThrough([
    [-5, 0],
    [0, 0],
    [10, 0],
    [10, 10],
    [10, 15],
  ]);
  for (let metres = 0.25; metres < path.length; metres += 0.25) {
    const [before, after] = [alongPath(path, metres - 0.25), alongPath(path, metres)];
    assert.ok(turned(before.facing, after.facing) < Math.PI / 6, `turns sharply ${metres} m along`);
  }
  // The kept-right corner is at (10 - 0.7, 0.7); the walk cuts inside it, never past the way's middle.
  const corner = path.points.filter((point) => point[0] > 8 && point[1] < 2);
  assert.ok(corner.length > 3, 'drawn through several points');
  for (const [east, south] of corner) assert.ok(east <= 10 - KEEP_RIGHT_M + 1e-9 && south >= KEEP_RIGHT_M - 1e-9);
});

test('turning back the way it came, a walker goes round the turning point to the other side of the way', () => {
  const path = pathThrough([
    [0, 2],
    [0, 0],
    [10, 0],
    [0, 0],
    [0, -2],
  ]);
  const round = path.points.filter((point) => point[0] > 9);
  assert.ok(
    round.every((point) => Math.hypot(point[0] - 10, point[1]) > 0.6),
    'round it, not through it',
  );
  assert.ok(Math.max(...round.map((point) => point[0])) > 10.6, 'beyond it');
});

test('along a path: its start, its end, and the way it faces between', () => {
  const path = pathThrough([
    [0, 0],
    [0, -5],
    [0, -10],
  ]);
  assert.ok(path.length > 10 && path.length < 10.5, `${path.length} m`);
  assert.deepEqual(alongPath(path, 0).place, [0, 0]);
  assert.deepEqual(alongPath(path, path.length / 2).place, [KEEP_RIGHT_M, -5], 'kept right, facing north');
  assert.deepEqual(alongPath(path, 99).place, [0, -10], 'held at its end');
  assert.equal(alongPath(path, path.length / 2).facing, 0, 'north');
});
