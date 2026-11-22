import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { bearing, CARD_NEAREST_M, cardStand, eyeOf, frameAt, viewOf } from './figures.ts';

const QUARTER = Math.PI / 2;

test('bearings run clockwise from north, with y pointing south', () => {
  assert.equal(bearing(0, 0, 0, -10), 0);
  assert.ok(Math.abs(bearing(0, 0, 10, 0) - QUARTER) < 1e-9);
  assert.ok(Math.abs(Math.abs(bearing(0, 0, 0, 10)) - Math.PI) < 1e-9);
});

test('a figure facing the eye shows its front, and its back when facing away', () => {
  // The eye stands south of the figure; the figure faces south.
  assert.deepEqual(viewOf(Math.PI, 0, 0, 0, 10), { view: 0, flip: false });
  assert.deepEqual(viewOf(0, 0, 0, 0, 10), { view: 4, flip: false });
});

test('turning to the eye left counts the views up; to its right, the same views mirrored', () => {
  // Facing south-west from the south-facing front is a turn to the eye's left: view 1.
  assert.deepEqual(viewOf(Math.PI + Math.PI / 4, 0, 0, 0, 10), { view: 1, flip: false });
  assert.deepEqual(viewOf(Math.PI + QUARTER, 0, 0, 0, 10), { view: 2, flip: false });
  assert.deepEqual(viewOf(Math.PI - Math.PI / 4, 0, 0, 0, 10), { view: 1, flip: true });
  assert.deepEqual(viewOf(Math.PI - QUARTER, 0, 0, 0, 10), { view: 2, flip: true });
});

test('frames loop at their rate', () => {
  assert.equal(frameAt(0, 4, 6), 0);
  assert.equal(frameAt(0.5, 4, 6), 3);
  assert.equal(frameAt(0.7, 4, 6), 0);
  assert.equal(frameAt(5, 0, 6), 0);
});

test('an eye looking north stands south of its target', () => {
  const eye = eyeOf({ targetX: 5, targetY: 5, yaw: 0, pitch: 0, distance: 10 });
  assert.ok(Math.abs(eye.x - 5) < 1e-9 && Math.abs(eye.y - 15) < 1e-9);
});

test('a figure’s card stands a body’s radius toward the eye, never past it, and in first person a metre off at least', () => {
  const stand = cardStand(1, 2, 1, 12);
  assert.ok(Math.abs(stand.x - 1) < 1e-12 && Math.abs(stand.y - 2.35) < 1e-12);
  assert.deepEqual(cardStand(1, 2, 1, 2.2), { x: 1, y: 2.2 }, 'the player’s own, the eye steeply over it');
  assert.deepEqual(cardStand(1, 2, 1, 2), { x: 1, y: 2 });
  // A foe in a melee, 0.7 m off through the player's own eyes: its card stands 1.5 m off along the same line.
  const melee = cardStand(1, 2, 1, 2.7, CARD_NEAREST_M);
  assert.ok(Math.abs(melee.x - 1) < 1e-12 && Math.abs(melee.y - 1.2) < 1e-12, `${melee.y}`);
  const far = cardStand(1, 2, 1, 12, CARD_NEAREST_M);
  assert.ok(Math.abs(far.y - 2.35) < 1e-12, 'one farther off stands as ever');
});
