import assert from 'node:assert/strict';
import { test } from 'node:test';
import { viewPlanes } from '../city/tiers.ts';
import {
  CULL_MARGIN_M,
  POSE_CADENCE,
  TURN_LEAD_MAX,
  cadenceDue,
  cardReach,
  leadMargin,
  poseEvery,
  sphereSeen,
  turnBetween,
} from './figureCull.ts';

// Looking north (-y) with a square view a quarter turn wide: a point d metres ahead is seen while |x| and |z| <= d.
const planes = viewPlanes(new Float32Array([1, 0, 0, 0, 0, 0, 0, -1, 0, 1, 0, 0, 0, 0, 0.1, 0]));

test('a figure is posed every frame within 10 m, every second frame to 25 m, every third beyond, the edges inclusive', () => {
  assert.deepEqual(POSE_CADENCE, [
    [10, 1],
    [25, 2],
    [Infinity, 3],
  ]);
  assert.deepEqual([0, 10, 10.01, 25, 25.01, 1e6].map(poseEvery), [1, 1, 2, 2, 3, 3]);
  // The far band still shows a 6 frames a second move's every frame at 60 frames a second.
  assert.ok(60 / poseEvery(Infinity) >= 2 * 6);
});

test('figures on one cadence are posed on different frames, each evenly, and every frame poses a share of them', () => {
  const figures = [0, 1, 2, 3, 4, 5];
  const posed = (frame: number) => figures.filter((id) => cadenceDue(frame, id, 3));
  for (let frame = 0; frame < 9; frame++) assert.equal(posed(frame).length, 2, `frame ${frame} poses two of six`);
  for (const id of figures) {
    const frames = [...Array(9).keys()].filter((frame) => cadenceDue(frame, id, 3));
    assert.deepEqual(
      frames.map((frame, nth) => frame - (frames[nth - 1] ?? frame - 3)),
      [3, 3, 3],
      `figure ${id} every third frame`,
    );
  }
  assert.ok(
    [...Array(5).keys()].every((frame) => cadenceDue(frame, 7, 1)),
    'near: every frame',
  );
});

test("a turning eye's margin grows with the turn and the distance, and stops growing at the most angle", () => {
  assert.equal(leadMargin(40, 0), CULL_MARGIN_M);
  assert.ok(leadMargin(40, 0.05) > leadMargin(10, 0.05));
  assert.ok(leadMargin(10, 0.1) > leadMargin(10, 0.05));
  assert.equal(leadMargin(10, 5), CULL_MARGIN_M + 10 * Math.tan(TURN_LEAD_MAX));
  assert.ok(Math.abs(turnBetween(3.1, -3.1) - (2 * Math.PI - 6.2)) < 1e-9, 'the shorter way round');
  assert.equal(turnBetween(1, 1), 0);
});

test("a card's reach holds every corner however it turns about its feet, and its shade's lean at a low sun", () => {
  // A card 1 m wide and 2 m tall standing on the middle of its foot.
  assert.equal(cardReach(1, 2, 0.5, 2, 0), Math.hypot(0.5, 2));
  assert.equal(cardReach(1, 2, 0.1, 2, 0), Math.hypot(0.9, 2), 'its feet off its middle');
  assert.ok(cardReach(1, 2, 0.5, 2, 12) > 3, 'a sun on the horizon throws the shade far');
});

test('a figure is seen while its sphere meets the view: ahead, just past its edge, never behind or far aside', () => {
  assert.ok(sphereSeen(planes, 0, -20, 0, 1));
  assert.ok(sphereSeen(planes, 20.5, -20, 0, 1), 'its middle past the edge, its reach inside');
  assert.ok(!sphereSeen(planes, 23, -20, 0, 1), 'off to the east');
  assert.ok(!sphereSeen(planes, 0, 20, 0, 1), 'behind');
  assert.ok(sphereSeen(planes, 23, -20, 0, leadMargin(28, 0.1)), 'turning toward it, the margin takes it in');
});
