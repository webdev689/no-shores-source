import assert from 'node:assert/strict';
import { test } from 'node:test';
import { countdownText, distanceText, vignette } from './hudLaw.ts';

test('the warning counts down in whole seconds and stops at 0', () => {
  assert.equal(countdownText(9.2), '10');
  assert.equal(countdownText(0.01), '1');
  assert.equal(countdownText(-3), '0');
});

test('the screen darkens as the count runs out, and stays dark in death', () => {
  assert.equal(vignette({ kind: 'inside' }, 10), 0);
  const early = vignette({ kind: 'warned', secondsLeft: 9 }, 10);
  const late = vignette({ kind: 'warned', secondsLeft: 1 }, 10);
  assert.ok(early > 0 && early < late && late < 0.9, `${early} ${late}`);
  assert.equal(vignette({ kind: 'dead', secondsDead: 1, canRespawn: false }, 10), 0.85);
});

test('distances read in metres near and kilometres far', () => {
  assert.equal(distanceText(347), '350 m');
  assert.equal(distanceText(4_260), '4.3 km');
  assert.equal(distanceText(146_000), '146 km');
});
