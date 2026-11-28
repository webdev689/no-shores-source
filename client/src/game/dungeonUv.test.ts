import assert from 'node:assert/strict';
import { test } from 'node:test';
import { uvOf } from './dungeonUv.ts';

/** Each way a wall faces, and the way that is right of one facing it: x east, y south, so facing north east is
 *  right. */
const FACINGS = [
  { normal: [0, 1, 0], right: [1, 0] },
  { normal: [0, -1, 0], right: [-1, 0] },
  { normal: [-1, 0, 0], right: [0, 1] },
  { normal: [1, 0, 0], right: [0, -1] },
] as const;

test("a wall's picture reads left to right for one facing it, whichever way it faces, and stands upright", () => {
  for (const { normal, right } of FACINGS) {
    const mapped = uvOf(normal, 4);
    const [here, rightward, higher] = [mapped([5, 7, 2]), mapped([5 + right[0], 7 + right[1], 2]), mapped([5, 7, 3])];
    assert.ok(rightward[0] > here[0], `facing ${normal}: u grows to the right`);
    assert.ok(Math.abs(rightward[0] - here[0] - 1 / 3.2) < 1e-12, 'a picture to 3.2 m');
    assert.ok(higher[1] < here[1], 'v grows down');
  }
});

test('a floor or a ceiling lies by x and y', () => {
  assert.deepEqual(uvOf([0, 0, 1], 0)([3.2, 6.4, 0]), [1, 2]);
});
