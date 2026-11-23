import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ATMOSPHERE_FLOATS, type AtmosphereFrame, atmosphereValues, drawsNothing } from './atmosphere.ts';
import { CLEAR } from './weather.ts';
import { WEATHERS } from './weathersForTests.ts';

const FRAME: AtmosphereFrame = {
  weather: { ...WEATHERS.storm, flash: 0.9, bolt: { x: 1100, y: 2050, seed: 7 } },
  camera: {
    eye: [1000, 2000, 12],
    forward: [0, -1, 0],
    right: [1, 0, 0],
    up: [0, 0, 1],
    depthScale: 0.01,
    depthOffset: 0.5,
  },
  tanHalfView: 0.5,
  size: [1280, 720],
  time: 3.5,
  motionReduced: false,
};

test('the frame packs into the shader’s eleven rows of four, the cloud lit the day’s white unless told', () => {
  const values = atmosphereValues(FRAME);
  assert.equal(values.length, ATMOSPHERE_FLOATS);
  assert.equal(ATMOSPHERE_FLOATS, 44);
  assert.deepEqual([...values.subarray(0, 4)], [1000, 2000, 12, 3.5]);
  assert.deepEqual([...values.subarray(4, 8)], [0, -1, 0, Math.fround(0.01)]);
  assert.deepEqual([...values.subarray(8, 12)], [1, 0, 0, 0.5]);
  assert.deepEqual([...values.subarray(12, 16)], [0, 0, 1, 0.5]);
  assert.deepEqual([...values.subarray(16, 20)], [1280, 720, 0.8999999761581421, 0]);
  assert.deepEqual([...values.subarray(20, 24)], [0.9200000166893005, 1, 0, 0.30000001192092896]);
  assert.deepEqual([...values.subarray(24, 28)], [11, 5, 0, 0]);
  assert.deepEqual([...values.subarray(40, 44)], [1, 1, 1, 0]);
  const dawn = atmosphereValues({ ...FRAME, light: [0.5, 0.25, 0.125] });
  assert.deepEqual([...dawn.subarray(40, 44)], [0.5, 0.25, 0.125, 0], "the sky's light at first light");
});

test('a bolt is carried from the eye, so its place keeps its metres however far out the world reaches', () => {
  const values = atmosphereValues(FRAME);
  assert.deepEqual([...values.subarray(36, 40)], [100, 50, 7, 1]);
  const none = atmosphereValues({ ...FRAME, weather: WEATHERS.storm });
  assert.equal(none[39], 0);
});

test('with motion reduced no flash is brighter than a third', () => {
  const values = atmosphereValues({ ...FRAME, motionReduced: true });
  assert.ok(Math.abs((values[18] ?? 0) - 1 / 3) < 1e-6);
});

test('clouds and a glow ride in their own rows', () => {
  const values = atmosphereValues({
    ...FRAME,
    weather: { ...WEATHERS.clouds, glow: { colour: [1, 0.5, 0.25], strength: 0.5 } },
  });
  assert.deepEqual([...values.subarray(28, 32)], [1, 0.5, 0.25, 0.5]);
  assert.deepEqual([...values.subarray(32, 36)], [120, 260, 0.699999988079071, 0]);
});

test('a clear sky draws nothing and anything else does', () => {
  assert.ok(drawsNothing(CLEAR));
  assert.ok(drawsNothing({ ...CLEAR, wind: [4, 4], seaGain: 2 }));
  for (const weather of Object.values(WEATHERS)) assert.ok(!drawsNothing(weather));
  assert.ok(!drawsNothing({ ...CLEAR, flash: 0.2 }));
});
