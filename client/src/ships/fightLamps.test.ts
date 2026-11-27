import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BURN_LIGHT, Effects, MUZZLE_LIGHT } from './effects.ts';
import { FIGHT_DAY_SHARE, fightLamps } from './fightLamps.ts';

test("a gun's flash lights round it as a lamp in world metres, DFO's 26 m shrinking to nothing over 0.12 s", () => {
  const effects = new Effects(7);
  effects.fire([10, 20, 1], [0, 3, 1], [0, 400, 0], 0);
  const view = { leftM: 1000, topM: 2000 };
  const lampsAt = (now: number) => fightLamps(effects.marks(now), view, 1);
  const [first] = lampsAt(0);
  assert.deepEqual(first?.at, [1010, 2023, 2], 'at the mouth, the window put back into the world');
  assert.equal(first?.reachM, MUZZLE_LIGHT.reachM);
  assert.deepEqual(first?.light, MUZZLE_LIGHT.colour);
  assert.equal(first?.day, FIGHT_DAY_SHARE, 'it shows by day too, faintly');
  assert.equal(first?.steady, true, 'its light keeps its own fade, no flame flickering it');
  const half = lampsAt(MUZZLE_LIGHT.seconds / 2)[0]?.reachM ?? 0;
  assert.ok(Math.abs(half - MUZZLE_LIGHT.reachM / 2) < 1e-6, 'half its reach halfway through');
  assert.equal(lampsAt(MUZZLE_LIGHT.seconds + 0.01).length, 0, 'gone once its time is out');
});

test('only the light marks are lamps: the flash, smoke and splinters themselves give none', () => {
  const marks = [
    { x: 1, y: 2, z: 3, radius: BURN_LIGHT.reachM, colour: BURN_LIGHT.colour, blend: 'light' as const, alpha: 0.9 },
    { x: 1, y: 2, z: 3, radius: 1, colour: [1, 1, 1] as const, blend: 'glow' as const, alpha: 1 },
    { x: 1, y: 2, z: 3, radius: 1, colour: [1, 1, 1] as const, blend: 'smoke' as const, alpha: 1 },
    { x: 1, y: 2, z: 3, radius: 1, colour: [1, 1, 1] as const },
  ];
  const lamps = fightLamps(marks, { leftM: 0, topM: 0 }, 0.5);
  assert.equal(lamps.length, 1);
  assert.deepEqual(lamps[0]?.at, [1, 2, 1.5], 'at its height as drawn');
  assert.ok(Math.abs((lamps[0]?.reachM ?? 0) - BURN_LIGHT.reachM * 0.9) < 1e-9, 'a fire reaches as far as it flickers');
});
