import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  boxReach,
  boxSeen,
  FAR_BAND_M,
  FAR_M,
  keeps,
  NEAR_BAND_M,
  NEAR_M,
  tiersAt,
  tiersReached,
  viewPlanes,
} from './tiers.ts';

test('a cell near the eye is drawn whole, further out as masses, far off as hulls', () => {
  assert.deepEqual(tiersAt(100), ['whole']);
  assert.deepEqual(tiersAt((NEAR_M + FAR_M - FAR_BAND_M) / 2), ['masses']);
  assert.deepEqual(tiersAt(FAR_M + 1000), ['hulls']);
});

test('inside a band a cell is drawn in both tiers it lies between', () => {
  assert.deepEqual(tiersAt(NEAR_M - NEAR_BAND_M / 2), ['whole', 'masses']);
  assert.deepEqual(tiersAt(FAR_M - FAR_BAND_M / 2), ['masses', 'hulls']);
});

test('across a band every pixel is kept by exactly one tier, so the city never shows twice or not at all', () => {
  for (let distance = 0; distance < FAR_M + 500; distance += 7)
    for (let threshold = 0.5 / 16; threshold < 1; threshold += 1 / 16) {
      const kept = tiersAt(distance).filter((tier) => keeps(tier, distance, threshold));
      assert.equal(kept.length, 1, `${distance} m at ${threshold}: ${kept.join(', ')}`);
    }
});

test('the share of pixels a tier keeps grows smoothly across its band, never in one step', () => {
  const share = (distance: number): number => {
    let kept = 0;
    for (let k = 0; k < 16; k++) if (keeps('whole', distance, (k + 0.5) / 16)) kept++;
    return kept / 16;
  };
  let previous = share(NEAR_M - NEAR_BAND_M);
  assert.equal(previous, 1);
  for (let distance = NEAR_M - NEAR_BAND_M; distance <= NEAR_M; distance += NEAR_BAND_M / 32) {
    const now = share(distance);
    assert.ok(previous - now <= 1 / 8 + 1e-9, `${distance}: ${previous} to ${now}`);
    previous = now;
  }
  assert.equal(previous, 0);
});

test('a group of cells spanning from near to far needs every tier between', () => {
  assert.deepEqual([...tiersReached(200, FAR_M + 100)].sort(), ['hulls', 'masses', 'whole']);
  assert.deepEqual([...tiersReached(FAR_M + 10, FAR_M + 400)], ['hulls']);
});

test('a box behind the eye or off to its side is not seen; one ahead is', () => {
  // looking north (-y) with a square view: the matrix rows are right, up, the depth row and forward
  const matrix = new Float32Array([1, 0, 0, 0, 0, 0, 0, -1, 0, 1, 0, 0, 0, 0, 0.1, 0]);
  const planes = viewPlanes(matrix);
  assert.ok(boxSeen(planes, [-1, -100, -1], [1, -90, 1]));
  assert.ok(!boxSeen(planes, [-1, 90, -1], [1, 100, 1]), 'behind');
  assert.ok(!boxSeen(planes, [200, -100, -1], [210, -90, 1]), 'off to the east');
});

test("a box's reach is its nearest and farthest point from the eye", () => {
  const { nearest, farthest } = boxReach([3, -1, -1], [4, 1, 1]);
  assert.equal(nearest, 3);
  assert.ok(Math.abs(farthest - Math.sqrt(18)) < 1e-12);
});
