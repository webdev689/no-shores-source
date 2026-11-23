import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MOST_PIXELS, RESOLUTIONS, resolution, sceneScale, sceneSize, setResolution } from './renderScale.ts';

test('the scene draws at the share chosen each way, never past MOST_PIXELS whatever the screen', () => {
  assert.deepEqual(sceneSize({ width: 1920, height: 1080 }, 1), { width: 1920, height: 1080 });
  assert.deepEqual(sceneSize({ width: 1920, height: 1080 }, 0.75), { width: 1440, height: 810 });
  assert.deepEqual(sceneSize({ width: 5120, height: 2880 }, 1), { width: 3840, height: 2160 });
  assert.deepEqual(sceneSize({ width: 5120, height: 2880 }, 0.5), { width: 2560, height: 1440 });
  const wide = sceneSize({ width: 7680, height: 2160 }, 1);
  assert.ok(wide.width * wide.height <= MOST_PIXELS * 1.001, 'an ultrawide is kept to the most too');
  assert.ok(Math.abs(wide.width / wide.height - 7680 / 2160) < 0.01, 'its shape kept');
  assert.deepEqual(sceneSize({ width: 1, height: 1 }, 0.5), { width: 1, height: 1 }, 'never below a pixel');
});

test('Settings offers Auto first, then 100% down to 50%; Auto is chosen until another is, and is kept', () => {
  assert.deepEqual(
    RESOLUTIONS.map((choice) => choice.words),
    ['Auto', '100%', '85%', '75%', '67%', '50%'],
  );
  assert.equal(resolution(), 'auto');
  assert.equal(sceneScale(), 1, 'Auto starts at the full share');
  setResolution('0.67');
  assert.equal(resolution(), '0.67');
  assert.equal(sceneScale(), 0.67);
  setResolution('auto');
});
