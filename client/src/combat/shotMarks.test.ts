import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ShotMarks, overSea, surfaceAt } from './shotMarks.ts';

const block = { minX: 4, maxX: 6, minY: -1, maxY: 1, top: 2 };

test('what a shot stopped at struck: a body, a block, the ground, the sea, or nothing', () => {
  const feet = [10, 0, 0] as const;
  assert.deepEqual(surfaceAt([10.2, 0, 1.2], [block], [feet]), { surface: 'body', feet });
  assert.deepEqual(surfaceAt([4, 0, 1], [block], [feet]), { surface: 'stone' });
  assert.deepEqual(surfaceAt([0, 0, 0.02], [block], [feet]), { surface: 'ground' });
  assert.deepEqual(
    surfaceAt([0, 0, 1.02], [], [], () => 1),
    { surface: 'ground' },
    "the ground's own height",
  );
  assert.deepEqual(
    surfaceAt([0, 0, 0], [], [], () => -2),
    { surface: 'water' },
  );
  assert.equal(surfaceAt([0, 0, 1.5], [block], [feet]), null);
});

test('a line under the sea ends at its surface; over land, or staying above it, it is left as it is', () => {
  assert.deepEqual(
    overSea([0, 0, 2], [0, -4, -2], () => -3),
    [0, -2, 0],
  );
  assert.deepEqual(
    overSea([0, 0, 2], [0, -4, -2], () => 1),
    [0, -4, -2],
  );
  assert.deepEqual(
    overSea([0, 0, 2], [0, -4, 1], () => -3),
    [0, -4, 1],
  );
});

test("a ball's hole and an arrow in the ground last 8 s, the 24 newest kept; a splash leaves nothing", () => {
  const marks = new ShotMarks();
  marks.strike('ground', [0, 0, 0], [0, -1, 0], true);
  marks.strike('water', [1, 0, 0], [0, -1, 0], true);
  marks.strike('stone', [2, 0, 1], [0, -1, 0], false);
  marks.update(1 / 60, []);
  assert.equal(marks.kept, 2);
  for (let shot = 0; shot < 30; shot++) marks.strike('ground', [shot, 0, 0], [0, -1, 0], false);
  marks.update(1 / 60, []);
  assert.equal(marks.kept, 24);
  marks.update(7.9, []);
  assert.equal(marks.kept, 24);
  marks.update(0.2, []);
  assert.equal(marks.kept, 0);
  const out: number[] = [];
  marks.mesh(out, [0, 5, 2]);
  assert.equal(out.length, 0, 'its dust settled too');
});
