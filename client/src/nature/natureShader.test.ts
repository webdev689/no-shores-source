import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SWAY } from './natureShader.ts';

test('the plants sway slowly: gusts roll by in ten seconds, a plant rocks in seven and its leaves tremble in two', () => {
  const period = (perS: number) => (2 * Math.PI) / perS;
  assert.ok(period(SWAY.gustPerS) >= 10, `a gust every ${period(SWAY.gustPerS).toFixed(1)} s`);
  assert.ok(period(SWAY.rockPerS) >= 7, `a rock every ${period(SWAY.rockPerS).toFixed(1)} s`);
  assert.ok(period(SWAY.tremblePerS) >= 2, `a tremble every ${period(SWAY.tremblePerS).toFixed(1)} s`);
});
