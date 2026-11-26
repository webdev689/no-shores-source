import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Mark } from './effects.ts';
import { FightLamps } from './fightLamps.ts';

const flash: Mark = { x: 2, y: 3, z: 4, radius: 26, colour: [1.35, 1, 0.6], blend: 'light', alpha: 0.5 };

test('a light mark is a lamp where it stands in the world, reaching its radius, its colour dimmed by its alpha', () => {
  const lamps = new FightLamps().lampsOf([flash, { ...flash, blend: 'glow' }], { leftM: 100, topM: -50 });
  assert.equal(lamps.length, 1, 'only a light mark lights');
  assert.deepEqual(lamps[0]?.at, [102, -47, 4]);
  assert.equal(lamps[0]?.reachM, 26);
  assert.deepEqual(lamps[0]?.light, [0.675, 0.5, 0.3]);
});

test('its lamps are the same places frame to frame while their number holds, moved and dimmed in place', () => {
  const kept = new FightLamps();
  const first = kept.lampsOf([flash], { leftM: 0, topM: 0 });
  const next = kept.lampsOf([{ ...flash, x: 5, alpha: 1 }], { leftM: 0, topM: 0 });
  assert.equal(next, first, 'the same list');
  assert.equal(next[0]?.at[0], 5);
  assert.deepEqual(next[0]?.light, [1.35, 1, 0.6]);
  assert.notEqual(kept.lampsOf([flash, flash], { leftM: 0, topM: 0 }), first, 'a new list when the number changes');
  assert.equal(kept.lampsOf([], { leftM: 0, topM: 0 }).length, 0);
});
