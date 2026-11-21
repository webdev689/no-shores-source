import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Shot } from './camera.ts';
import {
  FALL_MOST_S,
  LANDED_BEAT_S,
  fallPlayed,
  fallShown,
  heldShot,
  TUMBLE_TURNS_A_SECOND,
  tumbleFacing,
  whistlePitch,
} from './fallLaw.ts';

const LENS = { fov: 1, near: 0.1, far: 1000 } as const;
/** The shot as the room says the player fell: an eye 4 m back and 2 m up from a body at the origin, looking north. */
const HELD: Shot = { ...LENS, eye: [0, 4, 2], yaw: 0, pitch: 0.2 };

test('the fall has played once the body has lain a beat, or 3 s on, and a death by straying tells at once', () => {
  assert.equal(fallPlayed(false, 0, null), true, 'a death by straying is told at once');
  assert.equal(fallPlayed(true, 0, null), false);
  assert.equal(fallPlayed(true, FALL_MOST_S - 0.01, null), false, 'still falling, not yet');
  assert.equal(fallPlayed(true, FALL_MOST_S, null), true, '3 s at most');
  assert.equal(fallPlayed(true, 1.2, 1.0), false, 'landed, but the beat has not passed');
  assert.equal(fallPlayed(true, 1.0 + LANDED_BEAT_S, 1.0), true, 'landed a beat ago');
  assert.ok(LANDED_BEAT_S < 1, 'a beat, not a wait');
});

test('a fallen body tumbles in the air and lies once its feet are down; anything else is no fall', () => {
  assert.equal(fallShown({ kind: 'dead', ticks: 3, fell: true }, 'air'), 'tumbling');
  assert.equal(fallShown({ kind: 'dead', ticks: 90, fell: true }, 'ground'), 'lying');
  assert.equal(fallShown({ kind: 'dead', ticks: 3, fell: false }, 'air'), null, 'strayed');
  assert.equal(fallShown({ kind: 'inside' }, 'air'), null, 'a jump');
});

test('the held shot keeps its eye and lens and turns toward the body, the short way, never past it', () => {
  const below: [number, number, number] = [0, 0, -30];
  const first = heldShot(HELD, HELD, below, 1 / 60);
  assert.deepEqual(first.eye, HELD.eye, 'the eye stays put');
  assert.ok(first.fov < HELD.fov && first.fov > 0.95, `the lens narrows smoothly, not at once: ${first.fov}`);
  assert.equal(heldShot(HELD, HELD, [0, 0, 0], 1 / 60).fov, HELD.fov, 'a body still near is not zoomed on');
  assert.ok(first.pitch > HELD.pitch, `it looks further down, ${first.pitch}`);
  let shot = first;
  for (let frame = 0; frame < 240; frame++) shot = heldShot(HELD, shot, below, 1 / 60);
  const straight = Math.atan2(2 + 30 - 0.9, 4); // the eye 2 m up, the body's middle 0.9 m over its feet
  assert.ok(Math.abs(shot.pitch - straight) < 1e-3, `on the body after 4 s: ${shot.pitch} for ${straight}`);
  // A body behind the eye's right shoulder: the turn goes round to the right, never the long way left.
  const behind = heldShot(HELD, HELD, [8, 10, 0], 1 / 60);
  assert.ok(behind.yaw > 0 && behind.yaw < Math.PI / 2, `turning right, ${behind.yaw}`);
});

test('the lens narrows to keep a body far below framed, never wider than it was, never past its narrowest', () => {
  let shot = HELD;
  for (let frame = 0; frame < 240; frame++) shot = heldShot(HELD, shot, [0, 0, -40], 1 / 60);
  const away = Math.hypot(4, 42 - 0.9);
  assert.ok(Math.abs(shot.fov - 2 * Math.atan(7 / away)) < 1e-3, `a 14 m window round the body: ${shot.fov}`);
  for (let frame = 0; frame < 240; frame++) shot = heldShot(HELD, shot, [0, 0, -400], 1 / 60);
  assert.ok(Math.abs(shot.fov - 0.3) < 1e-3, `never narrower than 0.3: ${shot.fov}`);
});

test('the turn is smooth: two half frames reach where one whole frame does', () => {
  const body: [number, number, number] = [6, -10, -20];
  const once = heldShot(HELD, HELD, body, 0.1);
  const twice = heldShot(HELD, heldShot(HELD, HELD, body, 0.05), body, 0.05);
  assert.ok(Math.abs(once.yaw - twice.yaw) < 1e-9 && Math.abs(once.pitch - twice.pitch) < 1e-9);
  assert.ok(Math.abs(once.fov - twice.fov) < 1e-9);
});

test('the tumble spins the figure about, the same at every browser from the time since it died', () => {
  assert.equal(tumbleFacing(0.5, 0), 0.5);
  const quarter = 1 / (4 * TUMBLE_TURNS_A_SECOND);
  assert.ok(Math.abs(tumbleFacing(0.5, quarter) - (0.5 + Math.PI / 2)) < 1e-9);
  assert.ok(tumbleFacing(0, 10) >= 0 && tumbleFacing(0, 10) < 2 * Math.PI, 'kept within a turn');
});

test('the whistle starts high and drops in pitch the whole way down, never below its floor', () => {
  const pitches = [0, 0.5, 1, 2, 3, 6].map(whistlePitch);
  for (let index = 1; index < pitches.length; index++)
    assert.ok((pitches[index] ?? 0) <= (pitches[index - 1] ?? 0), `${pitches.join(', ')}`);
  assert.ok((pitches[0] ?? 0) > 1500 && (pitches[3] ?? 0) < 1000, `${pitches.join(', ')}`);
  assert.equal(whistlePitch(60), whistlePitch(120), 'a floor');
});
