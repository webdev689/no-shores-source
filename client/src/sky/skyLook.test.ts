import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SkyReading } from './skyLaw.ts';
import { lookOf, sunLight } from './skyLook.ts';
import { AFTERNOON, skyNumbers } from './skyUniform.ts';

const luminance = (colour: readonly number[]): number =>
  0.2126 * (colour[0] ?? 0) + 0.7152 * (colour[1] ?? 0) + 0.0722 * (colour[2] ?? 0);

/** A clear, calm reading with the sun at a height (its sine) due west and the moon opposite it. */
function readingAt(sunUp: number, change: Partial<SkyReading> = {}): SkyReading {
  const level = Math.sqrt(1 - sunUp * sunUp);
  return {
    latitudeDeg: 40,
    sun: [-level, 0, sunUp],
    moon: [level, 0, -sunUp],
    moonPhase: 0.5,
    moonLit: 1,
    starTurn: 1,
    daylight: Math.min(1, Math.max(0, sunUp / 0.17)),
    cloud: 0,
    falling: 0,
    snowShare: 0,
    storm: 0,
    fog: 0,
    sand: 0,
    wind: [3, 0],
    gust: 0,
    temperatureC: 20,
    wetness: 0,
    steeringMS: 10,
    ...change,
  };
}

test('the low sun is golden, not a dim brown: red over green over blue, still bright a few degrees up', () => {
  const low = sunLight(0.05);
  assert.ok(low[0] > low[1] && low[1] > low[2], `${low.join()}`);
  assert.ok(luminance(low) > 0.25, `the sun 3 degrees up gives ${luminance(low)}`);
  const noon = sunLight(1);
  assert.ok(noon[2] > 0.75 && noon[0] < 1.1, 'overhead the sun is near white');
});

test('twilight is a blue sky that darkens through civil twilight into a deep blue night, never black', () => {
  const setting = lookOf(readingAt(0), 0, 0);
  const civil = lookOf(readingAt(-0.06), 0, 0);
  const night = lookOf(readingAt(-0.5, { moonLit: 0 }), 0, 0);
  assert.ok(setting.zenith[2] > setting.zenith[0] * 2, 'the zenith at sunset is blue');
  assert.ok(setting.horizon[2] >= setting.horizon[0], 'its horizon away from the glow is no maroon');
  assert.ok(luminance(civil.zenith) > 3 * luminance(night.zenith), 'civil twilight is not night');
  assert.ok(night.zenith[2] > 0.05 && night.zenith[2] > 2 * night.zenith[0], 'night is a deep blue');
});

test('a moonlit night is lit plainly enough to read the land: more than a moonless one, and by the moon', () => {
  const moonless = lookOf(readingAt(-0.5, { moonLit: 0 }), 0, 0);
  const moonlit = lookOf(readingAt(-0.5, { moon: [0.3, 0, 0.95], moonLit: 1 }), 0, 0);
  assert.equal(moonlit.key, moonlit.moon, 'the moon is the key light');
  assert.ok(luminance(moonlit.ambientSky) > 0.15, `moonlit ambient ${luminance(moonlit.ambientSky)}`);
  assert.ok(luminance(moonless.ambientSky) > 0.05, 'a moonless night still shows shapes');
  assert.ok(luminance(moonlit.keyLight) > 0.15 && moonlit.stars < moonless.stars, 'the moon washes out stars');
});

test('a storm darkens the sky and the day; noon keeps the clear afternoon the game was drawn in', () => {
  const noon = lookOf(readingAt(0.9), 0, 0);
  const storm = lookOf(readingAt(0.9, { cloud: 1, storm: 1, falling: 1 }), 0, 0);
  assert.ok(luminance(storm.zenith) < 0.5 * luminance(noon.zenith));
  assert.ok(luminance(storm.keyLight) < 0.3 * luminance(noon.keyLight));
  assert.deepEqual(noon.zenith, AFTERNOON.zenith);
  assert.ok(Math.abs(luminance(noon.ambientSky) - luminance(AFTERNOON.ambientSky)) < 0.05, 'noon ambient as drawn');
});

test('the clouds drift with world time, wrapped at 1024 cells; the pole and the phase reach the uniform', () => {
  for (const worldS of [0, 1e5, 1e9, -3e7]) {
    const [driftX] = lookOf(readingAt(0.5), worldS, 0).drift;
    assert.ok(driftX >= 0 && driftX < 1024, `${driftX}`);
  }
  const look = lookOf(readingAt(-0.4, { latitudeDeg: 30, moonPhase: 0.25 }), 0, 0);
  const numbers = skyNumbers(look, []);
  assert.ok(Math.abs((numbers[11 * 4 + 2] ?? 0) - Math.PI / 6) < 1e-6, 'drift.z: the latitude, radians');
  assert.ok(Math.abs((numbers[11 * 4 + 3] ?? 0) - 0.25) < 1e-6, 'drift.w: the moon phase');
});
