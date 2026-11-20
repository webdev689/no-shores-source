import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Standing } from '../network/messages.ts';
import type { Body } from '../rules/movementRules.ts';
import type { Shot } from './camera.ts';
import { FALL_MOST_S, LANDED_BEAT_S } from './fallLaw.ts';
import { FallWatch } from './fallWatch.ts';

const BODY: Body = {
  x: 0,
  y: 0,
  z: 80,
  vx: 0,
  vy: 6,
  vz: -12,
  facing: 1,
  mode: 'air',
  crouched: false,
  crouch: 0,
  grounded: 0,
  over: null,
  lip: 0,
  moving: false,
};
const FOLLOWED: Shot = { eye: [0, 5, 83], yaw: 0, pitch: 0.2, fov: 1, near: 0.1, far: 1000 };
const fell = (ticks: number): Standing => ({ kind: 'dead', ticks, fell: true });

test('from the room saying the player fell, the shot holds its eye while the following camera goes on', () => {
  const watch = new FallWatch();
  assert.equal(watch.figure({ kind: 'inside' }, BODY, 1), null, 'a jump is no fall');
  assert.equal(watch.shot(FOLLOWED, [0, 0, 80], 1 / 60), FOLLOWED, 'not held before the fall');
  assert.deepEqual(watch.figure(fell(0), BODY, 1), { tumbling: true, facing: 1 });
  const first = watch.shot(FOLLOWED, [0, 0, 80], 1 / 60);
  const moved: Shot = { ...FOLLOWED, eye: [0, 5, 60] };
  const later = watch.shot(moved, [0, 3, 50], 1 / 60);
  assert.deepEqual([first.eye, later.eye], [FOLLOWED.eye, FOLLOWED.eye], 'the eye stays where it was');
  assert.ok(later.pitch > first.pitch, 'turning down after the body');
});

test('the figure tumbles while it falls and lies, facing as it landed, once its feet are down; death is told after', () => {
  const watch = new FallWatch();
  watch.figure(fell(0), BODY, 1);
  const tumbling = watch.figure(fell(30), BODY, 1);
  assert.ok(tumbling?.tumbling && tumbling.facing !== 1, 'spinning about');
  assert.equal(watch.told(true), false, 'not while it falls');
  const landed = { ...BODY, mode: 'ground', z: 46 } as const;
  const lying = watch.figure(fell(60), landed, 4);
  assert.deepEqual(lying, { tumbling: false, facing: tumbling?.facing });
  assert.equal(watch.told(true), false, 'not the moment it lands');
  watch.figure(fell(60 + Math.ceil(LANDED_BEAT_S * 60)), landed, 4);
  assert.equal(watch.told(true), true, 'once it has lain a beat');
  assert.equal(watch.figure({ kind: 'inside' }, landed, 4), null, 'respawned, the camera is given back');
  assert.equal(watch.shot(FOLLOWED, [0, 0, 80], 1 / 60), FOLLOWED);
});

test('a fall still going at 3 s is told then, and a death by straying at once', () => {
  const watch = new FallWatch();
  watch.figure(fell(FALL_MOST_S * 60 - 1), BODY, 1);
  assert.equal(watch.told(true), false);
  watch.figure(fell(FALL_MOST_S * 60), BODY, 1);
  assert.equal(watch.told(true), true);
  const strayed = new FallWatch();
  assert.equal(strayed.figure({ kind: 'dead', ticks: 0, fell: false }, BODY, 1), null, 'no tumble for straying');
  assert.equal(strayed.told(false), true);
});
