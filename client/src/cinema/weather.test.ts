import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CLEAR, mixWeather, strikeAt, swellGained, WEATHERS, type Weather } from './weather.ts';

const STORM = WEATHERS.storm;

test('a mix at either end is that weather', () => {
  assert.deepEqual(mixWeather(CLEAR, STORM, 0), CLEAR);
  assert.deepEqual(mixWeather(CLEAR, STORM, 1), STORM);
});

test('a mix half way stands between the two in every number', () => {
  const half = mixWeather(CLEAR, STORM, 0.5);
  assert.equal(half.overcast, STORM.overcast / 2);
  assert.equal(half.rain, STORM.rain / 2);
  assert.deepEqual(half.wind, [STORM.wind[0] / 2, STORM.wind[1] / 2]);
  assert.equal(half.seaGain, (1 + STORM.seaGain) / 2);
});

test('a mix holds its share between none and all', () => {
  assert.deepEqual(mixWeather(CLEAR, STORM, -2), CLEAR);
  assert.deepEqual(mixWeather(CLEAR, STORM, 7), STORM);
});

test('clouds thin in from nothing and out to nothing', () => {
  const clouds = WEATHERS.clouds;
  assert.ok(clouds.clouds);
  const coming = mixWeather(CLEAR, clouds, 0.25);
  assert.equal(coming.clouds?.base, clouds.clouds.base);
  assert.equal(coming.clouds?.cover, clouds.clouds.cover * 0.25);
  assert.equal(mixWeather(clouds, CLEAR, 1).clouds, null);
});

test('a bolt and a glow belong to the weather nearer them', () => {
  const struck: Weather = { ...STORM, bolt: { x: 5, y: 6, seed: 3 } };
  assert.deepEqual(mixWeather(CLEAR, struck, 0.6).bolt, struck.bolt);
  assert.equal(mixWeather(CLEAR, struck, 0.4).bolt, null);
  const burning: Weather = { ...WEATHERS.deep, glow: { colour: [1, 0.5, 0.2], strength: 1 } };
  assert.deepEqual(mixWeather(CLEAR, burning, 0.5).glow, { colour: [1, 0.5, 0.2], strength: 0.5 });
});

test('the gained swell lifts every wave and carries it further, nothing else', () => {
  const swell = {
    waves: [
      { direction: [1, 0] as const, number: 0.1, frequency: 1, amplitude: 0.5, shift: 0.2, phase: 1 },
      { direction: [0, 1] as const, number: 0.2, frequency: 2, amplitude: 0.25, shift: 0.1, phase: 2 },
    ],
    fullDepthM: 30,
    goneDepthM: 2,
    bearing: 1,
  };
  const gained = swellGained(swell, 2.5);
  assert.deepEqual(
    gained.waves.map((wave) => [wave.amplitude, wave.shift]),
    [
      [1.25, 0.5],
      [0.625, 0.25],
    ],
  );
  assert.equal(gained.waves[1]?.frequency, 2);
  assert.equal(gained.fullDepthM, 30);
  assert.equal(swellGained(swell, 1), swell);
});

test('each weather to try is within its ranges', () => {
  for (const [name, weather] of Object.entries(WEATHERS)) {
    for (const key of ['overcast', 'rain', 'snow', 'mist', 'flash', 'deep'] as const) {
      assert.ok(weather[key] >= 0 && weather[key] <= 1, `${name}.${key}`);
    }
  }
});

test('a stroke of lightning comes once in each spell and flickers out within its third of a second', () => {
  const lit: number[] = [];
  for (let frame = 0; frame < 60 * 40; frame++) {
    const seconds = frame / 60;
    const strike = strikeAt(seconds, 8, [100, 200], 500, 4);
    assert.equal(strike.flash > 0, strike.bolt !== null);
    if (strike.bolt) {
      assert.ok(Math.hypot(strike.bolt.x - 100, strike.bolt.y - 200) <= 500);
      lit.push(seconds);
    }
  }
  const strokes = new Set(lit.map((seconds) => Math.floor(seconds / 8)));
  assert.equal(strokes.size, 5);
  for (const stroke of strokes) {
    const within = lit.filter((seconds) => Math.floor(seconds / 8) === stroke);
    assert.ok(within.length >= 10 && within.length <= 22, `${within.length} frames lit`);
  }
});

test('the same seed strikes the same, another seed elsewhere', () => {
  const flashes = (seed: number) =>
    [...Array(400).keys()].map((frame) => strikeAt(frame / 50, 8, [0, 0], 500, seed).flash);
  assert.deepEqual(flashes(1), flashes(1));
  assert.notDeepEqual(flashes(1), flashes(2));
});
