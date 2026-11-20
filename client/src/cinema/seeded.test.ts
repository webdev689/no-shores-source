import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hashUnit, smoothNoise } from './seeded.ts';

test('the hash gives numbers spread over [0, 1)', () => {
  const values = [...Array(1000).keys()].map(hashUnit);
  assert.ok(values.every((value) => value >= 0 && value < 1));
  assert.ok(Math.abs(values.reduce((sum, value) => sum + value, 0) / 1000 - 0.5) < 0.05);
});

test('the smooth wander passes through its whole steps and never jumps', () => {
  assert.equal(smoothNoise(3, 4), hashUnit(3 * 65_537 + 4));
  for (let along = 0; along < 20; along += 0.01) {
    assert.ok(Math.abs(smoothNoise(3, along + 0.01) - smoothNoise(3, along)) < 0.03);
  }
  assert.notEqual(smoothNoise(3, 2.5), smoothNoise(4, 2.5));
});
