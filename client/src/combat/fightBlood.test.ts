import assert from 'node:assert/strict';
import { test } from 'node:test';
import { surfacesOf } from './fightBlood.ts';

const CRATE = { minX: 2, minY: -1, maxX: 3, maxY: 1, top: 1, bottom: 0 };
const surfaces = surfacesOf([CRATE]);

test('blood falling on open ground meets it at height zero', () => {
  assert.deepEqual(surfaces([0, 0, 1.125], [0, 0, -1], 3), { distance: 1.125, normal: [0, 0, 1] });
});

test("blood falling over a block meets the block's top", () => {
  assert.deepEqual(surfaces([2.5, 0, 1.5], [0, 0, -1], 3), { distance: 0.5, normal: [0, 0, 1] });
});

test('blood thrown at a block meets its side, facing back at it', () => {
  assert.deepEqual(surfaces([0, 0, 0.5], [1, 0, 0], 3), { distance: 2, normal: [-1, 0, 0] });
});

test('blood thrown short of a block, or upward under the open sky, meets nothing', () => {
  assert.equal(surfaces([0, 0, 0.5], [1, 0, 0], 1.5), null);
  assert.equal(surfaces([0, 0, 1], [0, 0, 1], 4), null);
});

/** Land rising to the east, half a metre a metre, with a crate standing 1.5 m on it. */
const RISING = (x: number) => 10 + x * 0.5;
const onLand = surfacesOf([{ ...CRATE, top: 12.75 }], RISING);

test('blood falling on the land meets it where it lies, facing up its slope', () => {
  const hit = onLand([-2, 0, 12], [0, 0, -1], 5);
  assert.ok(hit && Math.abs(hit.distance - 3) <= 0.05, `meets it 3 m down, not at height zero: ${hit?.distance}`);
  const [east, south, up] = hit.normal;
  const slope = Math.hypot(0.5, 1);
  assert.ok(Math.abs(east + 0.5 / slope) < 1e-9 && south === 0 && Math.abs(up - 1 / slope) < 1e-9);
  assert.equal(onLand([-2, 0, 12], [0, 0, -1], 2), null, 'out of reach');
  assert.equal(onLand([-2, 0, 8], [0, 0, -1], 5), null, 'a ray under the land meets nothing');
  assert.deepEqual(onLand([2.5, 0, 13.25], [0, 0, -1], 3), { distance: 0.5, normal: [0, 0, 1] }, 'its top first');
});

test("among a wreck's thousands of blocks blood meets the nearest in its way, and a ray costs little", () => {
  // A grid of crates 4 m apart, 60 by 60, and one crate in the way of a ray thrown along a diagonal.
  const crates = Array.from({ length: 3600 }, (unused, nth) => {
    const [x, y] = [(nth % 60) * 4 + 1, Math.floor(nth / 60) * 4 + 1];
    return { minX: x, minY: y, maxX: x + 1, maxY: y + 1, top: 1, bottom: 0 };
  });
  const many = surfacesOf(crates);
  const hit = many([0, 0, 0.5], [Math.SQRT1_2, Math.SQRT1_2, 0], 3);
  assert.ok(hit && Math.abs(hit.distance - Math.SQRT2) < 1e-9, `meets the first crate's corner: ${hit?.distance}`);
  assert.equal(many([2.5, 2.5, 0.5], [0, 0, -1], 0.4), null, 'a gap between crates, short of the ground');
  const started = performance.now();
  for (let ray = 0; ray < 200; ray++) many([ray % 200, 100, 3], [0, 0, -1], 4);
  const each = (performance.now() - started) / 200;
  assert.ok(each < 0.25, `${each.toFixed(3)} ms a ray`);
});
