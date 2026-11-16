import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type HullMask, hullFoam, hullInside } from './hullMask.ts';

const SLOOP_AT_REST: HullMask = { x: 0, y: 0, heading: 0, halfLength: 3, halfBeam: 1, way: 0 };

test('no water stands inside her waterline; a metre past her beam it does', () => {
  assert.equal(hullInside(SLOOP_AT_REST, [0, 0], 0.01), 1);
  assert.equal(hullInside(SLOOP_AT_REST, [0, -2], 0.01), 1, 'forward, inside her length');
  assert.equal(hullInside(SLOOP_AT_REST, [2, 0], 0.01), 0, 'a metre off her starboard side (east, heading north)');
  assert.equal(
    hullInside({ ...SLOOP_AT_REST, heading: Math.PI / 2 }, [2, 0], 0.01),
    1,
    'heading east, that is her bow',
  );
});

test('foam gathers round her at way, most at her bow, and none at rest', () => {
  const underWay = { ...SLOOP_AT_REST, way: 2 };
  const [bow, stern] = [hullFoam(underWay, [0, -3.05]), hullFoam(underWay, [0, 3.05])];
  assert.equal(hullFoam(SLOOP_AT_REST, [0, -3.05]), 0);
  assert.ok(bow > 0.5 && bow > stern * 2, `bow ${bow}, stern ${stern}`);
  assert.equal(hullFoam(underWay, [0, -5]), 0, 'two metres off her bow the band is gone');
  assert.equal(hullFoam(underWay, [0, 0]), 0, 'none inside her');
});
