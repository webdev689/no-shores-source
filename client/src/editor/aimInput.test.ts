import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AimInput, LOAD_STEP_S } from './aimInput.ts';

test('the right button held aims and its release fires once', () => {
  const aim = new AimInput();
  assert.equal(aim.down(2), true);
  assert.deepEqual(aim.take(), { aiming: true, fires: 0, loadSteps: 0 });
  aim.up(2);
  assert.deepEqual(aim.take(), { aiming: false, fires: 1, loadSteps: 0 });
  assert.deepEqual(aim.take(), { aiming: false, fires: 0, loadSteps: 0 });
});

test('a left click while aiming puts the lay down unfired', () => {
  const aim = new AimInput();
  aim.down(2);
  assert.equal(aim.down(0), true);
  aim.up(2);
  assert.equal(aim.take().fires, 0);
  assert.equal(aim.down(0), false, 'not aiming, a left click is the editor own');
});

test('the wheel steps the load while aiming, once a debounce at most', () => {
  const aim = new AimInput();
  assert.equal(aim.wheel(100, 0), false, 'not aiming, the wheel zooms');
  aim.down(2);
  assert.equal(aim.wheel(100, 1), true);
  aim.wheel(100, 1 + LOAD_STEP_S / 2);
  aim.wheel(-100, 1.01 + LOAD_STEP_S);
  assert.equal(aim.take().loadSteps, 0, 'one on, one back');
});
