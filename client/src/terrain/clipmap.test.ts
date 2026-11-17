import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CLIPMAP_LEVELS, CLIPMAP_QUADS, clipmapLevels, finestSpacing } from './clipmap.ts';

test("each ring lies on the next ring's grid, holds the finer one whole, and keeps a margin round it", () => {
  for (const [x, y, finest] of [
    [622_664.37, 357_500.81, 0.25],
    [1_234.5, 98_765.25, 8],
    [-3.2, 7.9, 0.5],
  ] as const) {
    const levels = clipmapLevels(x, y, finest);
    assert.equal(levels.length, CLIPMAP_LEVELS);
    assert.equal(levels[0]?.hole, null);
    for (const [index, level] of levels.entries()) {
      assert.equal(level.spacing, finest * 2 ** index);
      for (const axis of [0, 1] as const) {
        const steps = level.corner[axis] / (2 * level.spacing);
        assert.ok(Math.abs(steps - Math.round(steps)) < 1e-9, "its corner is on the next ring's grid");
        const eye = axis === 0 ? x : y;
        const centre = level.corner[axis] + (CLIPMAP_QUADS / 2) * level.spacing;
        assert.ok(Math.abs(eye - centre) <= 2 * level.spacing, 'it is centred on the eye to a step');
      }
      if (index === 0) continue;
      const hole = level.hole ?? [-1, -1];
      for (const start of hole) {
        assert.ok(Number.isInteger(start), 'the finer ring sits on whole quads');
        assert.ok(start >= 20 && start + CLIPMAP_QUADS / 2 <= CLIPMAP_QUADS - 20, `a margin round it: ${start}`);
      }
    }
  }
});

test('the finest ring is a quarter metre for a walker and doubles as the eye climbs', () => {
  assert.equal(finestSpacing(1.7), 0.25);
  assert.equal(finestSpacing(600), 8);
  assert.equal(finestSpacing(-30), 0.5, 'a diver below the surface');
  assert.ok(finestSpacing(100_000) >= 2048);
});
