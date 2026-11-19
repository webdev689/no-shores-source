import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type Fire, fireParts } from './flames.ts';

const FIRE: Fire = { at: [10, 20, 3], sizeM: 1, seed: 4 };
const CALM = [0, 0] as const;

test('a fire burns the same from the same seed and otherwise from another', () => {
  assert.deepEqual(fireParts(FIRE, 2.5, CALM), fireParts(FIRE, 2.5, CALM));
  assert.notDeepEqual(fireParts(FIRE, 2.5, CALM), fireParts({ ...FIRE, seed: 5 }, 2.5, CALM));
});

test('its tongues flicker: their height wanders within a band, never still and never gone', () => {
  const tallest = [...Array(240).keys()].map((frame) =>
    Math.max(...fireParts(FIRE, frame / 60, CALM).tongues.map((tongue) => tongue.height)),
  );
  assert.ok(
    Math.min(...tallest) > 0.5 && Math.max(...tallest) <= 1.6,
    `${Math.min(...tallest)} ${Math.max(...tallest)}`,
  );
  assert.ok(Math.max(...tallest) - Math.min(...tallest) > 0.15, 'flickers');
  const steps = tallest.slice(1).map((height, index) => Math.abs(height - (tallest[index] ?? height)));
  assert.ok(Math.max(...steps) < 0.25, 'licks rather than jumps');
});

test('its size scales every part, from half a metre to four', () => {
  const small = fireParts({ ...FIRE, sizeM: 0.5 }, 1, CALM);
  const large = fireParts({ ...FIRE, sizeM: 4 }, 1, CALM);
  const height = (parts: typeof small) => Math.max(...parts.tongues.map((tongue) => tongue.height));
  assert.ok(Math.abs(height(large) / height(small) - 8) < 1e-9);
});

test('smoke rises over the fire, grows and thins as it goes, and leans with the wind', () => {
  const calm = fireParts(FIRE, 3, CALM).smoke;
  for (const puff of calm) {
    assert.ok(puff.position[2] >= FIRE.at[2]);
    assert.ok(Math.hypot(puff.position[0] - FIRE.at[0], puff.position[1] - FIRE.at[1]) < 1.5);
  }
  const oldest = calm.reduce((most, puff) => (puff.age > most.age ? puff : most));
  const youngest = calm.reduce((least, puff) => (puff.age < least.age ? puff : least));
  assert.ok(oldest.position[2] > youngest.position[2] && oldest.radius > youngest.radius);
  const blown = fireParts(FIRE, 3, [6, 0]).smoke;
  const meanEast = (puffs: typeof calm) => puffs.reduce((sum, puff) => sum + puff.position[0], 0) / puffs.length;
  assert.ok(meanEast(blown) > meanEast(calm) + 2, 'leans east in a wind from the west');
});

test('embers fly up from the fire and burn out', () => {
  const embers = fireParts(FIRE, 1.3, CALM).embers;
  assert.ok(embers.length > 0);
  for (const ember of embers) {
    assert.ok(ember.position[2] >= FIRE.at[2] && ember.position[2] <= FIRE.at[2] + 4);
    assert.ok(ember.brightness >= 0 && ember.brightness <= 1);
  }
});
