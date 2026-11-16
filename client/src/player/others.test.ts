import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Body } from '../rules/movementRules.ts';
import { moveOf } from './others.ts';

const body: Body = {
  x: 0,
  y: 0,
  z: 0,
  vx: 0,
  vy: 0,
  vz: 0,
  facing: 0,
  mode: 'ground',
  crouched: false,
  crouch: 0,
  grounded: 1,
  over: null,
  lip: 0,
  moving: false,
};

test('another player plays the move their body is in: standing, walking, running, crouching, in the air or on a wall', () => {
  assert.equal(moveOf(body), 'idle');
  assert.equal(moveOf({ ...body, moving: true, vy: -4.43 }), 'walk');
  assert.equal(moveOf({ ...body, moving: true, vy: -7.59 }), 'run');
  assert.equal(moveOf({ ...body, crouched: true }), 'crouch_idle');
  assert.equal(moveOf({ ...body, mode: 'air' }), 'jump');
  assert.equal(moveOf({ ...body, mode: 'hang', moving: true }), 'shimmy');
  assert.equal(moveOf({ ...body, mode: 'vault' }), 'vault');
});
