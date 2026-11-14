import assert from 'node:assert/strict';
import { test } from 'node:test';
import { areaStanding, distanceKm, radiusForAreaM, rangeFraction, references } from './measure.ts';

const constants = {
  frameWidthM: 4_915_200,
  frameHeightM: 3_072_000,
  continentCount: 9,
  minContinentKm2: 161_600,
  maxContinentKm2: 940_000,
};

test('a circle of the smallest continent area has the matching radius', () => {
  const radius = radiusForAreaM(161_600);
  assert.ok(Math.abs((Math.PI * radius * radius) / 1e6 - 161_600) < 1e-6);
  assert.ok(Math.abs(radius - 226_800) < 100, `about 227 km, got ${radius}`);
});

test('distance is in kilometres', () => {
  assert.equal(distanceKm(0, 0, 3000, 4000), 5);
});

test('the references are the smallest, the largest and Daggerfall s map', () => {
  const [smallest, largest, daggerfall] = references(constants);
  assert.equal(smallest?.shape, 'circle');
  assert.ok((largest?.halfWidthM ?? 0) > (smallest?.halfWidthM ?? 0));
  assert.equal(daggerfall?.shape, 'box');
  assert.equal((daggerfall?.halfWidthM ?? 0) * 2, 819_200);
  assert.equal((daggerfall?.halfHeightM ?? 0) * 2, 409_600);
});

test('an area stands empty, too small, fitting or too large', () => {
  assert.equal(areaStanding(0, constants), 'empty');
  assert.equal(areaStanding(100_000, constants), 'too small');
  assert.equal(areaStanding(161_600, constants), 'fits');
  assert.equal(areaStanding(940_000, constants), 'fits');
  assert.equal(areaStanding(940_001, constants), 'too large');
  assert.equal(rangeFraction(550_800, constants), 0.5);
  assert.equal(rangeFraction(0, constants), 0);
});
