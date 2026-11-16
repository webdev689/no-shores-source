import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GroundPatch } from '../rules/landRules.ts';
import { breaker, breakerProfile, FRESH_SINK_M, SHORE, shoreField, waterUnder } from './shore.ts';

/** A patch 8 m a sample: a beach rising to the west, its waterline 200 m from the west edge, the sea deepening east. */
function beach(lake?: { column: number; row: number; level: number }): GroundPatch {
  const [width, height, step] = [129, 33, 8];
  const heights = new Float32Array(width * height);
  const water = new Float32Array(width * height);
  for (let row = 0; row < height; row++) {
    for (let column = 0; column < width; column++) {
      heights[row * width + column] = (200 - column * step) * 0.015;
      if (lake && Math.abs(column - lake.column) <= 1 && Math.abs(row - lake.row) <= 1) {
        heights[row * width + column] = lake.level - 1;
        water[row * width + column] = lake.level;
      }
    }
  }
  return { left: 10_000, top: 20_000, step, width, height, heights, water, marks: new Uint8Array(width * height) };
}

const travelAt = (field: ReturnType<typeof shoreField>, column: number, row: number) =>
  field.shore[(row * field.width + column) * 4] ?? Number.NaN;

test('a breaker reaches a straight shore along its whole length at once, and sooner the nearer it starts', () => {
  const field = shoreField(beach());
  for (const column of [30, 40, 60, 100]) {
    const along = [4, 16, 28].map((row) => travelAt(field, column, row));
    assert.ok(Math.max(...along) - Math.min(...along) < 0.05, `column ${column}: ${along.join(' ')}`);
  }
  // Shallow water is slow: the first sample out, 8 m off, is several seconds away.
  assert.ok(travelAt(field, 26, 16) > 0 && travelAt(field, 26, 16) < 8, `${travelAt(field, 26, 16)}`);
  assert.ok(travelAt(field, 40, 16) < travelAt(field, 60, 16) && travelAt(field, 60, 16) < travelAt(field, 100, 16));
  assert.ok(travelAt(field, 10, 16) < 0, 'up the beach the swash takes over');
  const slopeEast = field.shore[(16 * field.width + 60) * 4 + 1] ?? 0;
  assert.ok(slopeEast > 0, 'travel grows seaward');
  assert.equal(field.shore[(16 * field.width + 60) * 4 + 3], 1, 'sea');
  assert.equal(field.shore[(16 * field.width + 10) * 4 + 3], 0, 'land');
});

test('the crests bunch up as the sea shoals: a breaker slows in shallow water', () => {
  const field = shoreField(beach());
  const nearShore = travelAt(field, 32, 16) - travelAt(field, 28, 16);
  const offshore = travelAt(field, 112, 16) - travelAt(field, 108, 16);
  assert.ok(nearShore > offshore * 1.5, `${nearShore} ${offshore}`);
});

test('a breaker grows as it shoals, breaks where it nears the depth, and only its swash climbs the beach', () => {
  const sets = 1;
  const highest = (depth: number, travel: number) =>
    Math.max(...Array.from({ length: 90 }, (_value, tick) => breaker(travel, depth, sets, tick * 0.1).height));
  assert.ok(highest(30, 200) < 1e-9, 'deep water has no breakers');
  assert.ok(highest(6, 30) > highest(10, 50), 'shoaling raises them');
  const shallow = breaker(1, 1, sets, 0);
  assert.equal(shallow.broken, 1);
  assert.ok(highest(1, 1) <= (SHORE.breakRatio * 1) / 2 + SHORE.runUpM + 1e-9);
  assert.ok(highest(0, -3) > 0 && highest(0, -3) <= SHORE.runUpM, 'the swash runs up');
  assert.ok(highest(0, -40) < 0.01, 'far up the beach it is dry');
});

test('a breaker rises fast on its face and falls slowly on its back', () => {
  assert.equal(breakerProfile(0, 0.2), 1);
  assert.equal(breakerProfile(0.8, 0.2), -1);
  const slope = (phase: number) => Math.abs(breakerProfile(phase + 0.01, 0.2) - breakerProfile(phase - 0.01, 0.2));
  assert.ok(slope(0.9) > 3 * slope(0.4), 'the face is far steeper than the back');
});

test('a point of the close-up is sea, fresh water on its banks, or dry ground', () => {
  const patch = beach({ column: 4, row: 16, level: 3.5 });
  const field = shoreField(patch);
  const place = (column: number, row: number) => ({
    x: patch.left + column * patch.step,
    y: patch.top + row * patch.step,
  });
  const sea = waterUnder(field, undefined, place(126, 16), 0);
  assert.equal(sea?.kind, 'sea');
  assert.ok(Math.abs(sea?.surface ?? 9) < 0.01, 'calm far out');
  const lake = waterUnder(field, undefined, place(4, 16), 0);
  assert.deepEqual([lake?.kind, lake?.surface], ['fresh', 3.5 - FRESH_SINK_M]);
  assert.equal(waterUnder(field, undefined, place(12, 16), 0)?.kind, 'dry');
  assert.equal(waterUnder(field, undefined, { x: 0, y: 0 }, 0), null);
});
