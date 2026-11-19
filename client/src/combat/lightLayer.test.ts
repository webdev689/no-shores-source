import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GLOW_RAMPS } from '../elementGlow.ts';
import { LIGHT, LIGHT_WGSL, lightLevel, lightOf, lightSize } from './lightLayer.ts';
import { RAMP, swingRampColour } from './swingLook.ts';

const brightest = (colour: readonly number[]) => Math.max(...colour);

test('only the light and white-hot stops give light, white-hot the most; dark and body stops give none', () => {
  for (const look of [1, 2, 3] as const) {
    const [dark, body, light, hot] = GLOW_RAMPS[look].map((stop) => brightest(lightOf(stop)));
    assert.equal(dark, 0, `element ${look}'s dark stop`);
    assert.equal(body, 0, `element ${look}'s body stop`);
    assert.ok((light ?? 0) > 0 && (hot ?? 0) > (light ?? 0), `element ${look}'s light and white-hot stops`);
  }
  const steel = [0.75, 0.8, 0.9] as const;
  assert.equal(brightest(lightOf(swingRampColour(RAMP.metal, 1, steel))), 0, "steel's body stop");
  assert.ok(brightest(lightOf(swingRampColour(RAMP.metal, 3, steel))) > 0.8, "steel's white-hot edge");
  assert.equal(brightest(lightOf([1, 1, 1], 0.5)), 0.5, 'a see-through mark gives light by its share');
});

test('blurred light is cut to three levels a channel, the most never past the cap', () => {
  const third = 1 / 3 / LIGHT.gain;
  assert.deepEqual(
    [0, third * 0.9, third * 1.1, 2 * third * 0.95, 2 * third * 1.05, 5].map(lightLevel),
    [0, 0, 0.5, 0.5, 1, 1],
  );
  assert.ok(LIGHT.cap <= 0.35);
});

test('the light is a quarter of the picture each way, every pixel of it covered', () => {
  assert.deepEqual(lightSize(1920, 1080), [480, 270]);
  assert.deepEqual(lightSize(1281, 721), [321, 181]);
  assert.ok(!/NaN|undefined|\$\{/.test(LIGHT_WGSL));
});
