import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MEASURED_WINDOWS, levelOf, measureOf, measureOver, measuredOf, rushOf } from './soundMeasure.ts';

test('a recording is measured once over every window the game asks, as each window alone would measure it', () => {
  const rate = 1000;
  const burst = Float32Array.from({ length: 4000 }, (unused, index) => (index >= 1000 && index < 1400 ? 0.5 : 0.05));
  const measured = measuredOf([burst], rate);
  for (const windowS of MEASURED_WINDOWS)
    assert.deepEqual(measureOver(measured, windowS), measureOf([burst], rate, windowS), `over ${windowS} s`);
  assert.equal(measured.level, levelOf([burst], rate));
  assert.equal(measured.rush, rushOf([burst], rate));
  assert.deepEqual(
    measureOver(measured, 0.5),
    measureOf([burst], rate, 0.4),
    'a window not measured takes the nearest',
  );
});
