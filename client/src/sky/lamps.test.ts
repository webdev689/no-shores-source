import assert from 'node:assert/strict';
import { test } from 'node:test';
import { carriedLight, flicker, type LampPlace, lampsLit, lampsRound } from './lamps.ts';
import { AFTERNOON, LAMPS_MOST, skyNumbers, WRAP_M } from './skyUniform.ts';

const place = (x: number, seed = 0): LampPlace => ({ at: [x, 0, 2], reachM: 10, light: [1, 0.6, 0.3], seed });

test('lamps are out by day, come up through the dusk and are full at night', () => {
  assert.equal(lampsLit(1), 0);
  assert.equal(lampsLit(0.6), 0);
  assert.ok(lampsLit(0.4) > 0 && lampsLit(0.4) < 1);
  assert.equal(lampsLit(0.15), 1);
  assert.equal(lampsLit(0), 1);
});

test('a torch or a lantern in the left hand carries a light; anything else none', () => {
  assert.equal(carriedLight('torch_l'), 'torch');
  assert.equal(carriedLight('lantern'), 'lantern');
  assert.equal(carriedLight('shield_kite_plain'), null);
  assert.equal(carriedLight(null), null);
});

test('a flame flickers gently: never above full, never below 84%', () => {
  for (let seconds = 0; seconds < 20; seconds += 0.013) {
    const shown = flicker(3, seconds);
    assert.ok(shown <= 1 && shown >= 0.84, `${shown} at ${seconds}`);
  }
  assert.notEqual(flicker(1, 2), flicker(2, 2));
});

test('no lamp is lit by day, not even a carried one', () => {
  assert.deepEqual(lampsRound([0, 0, 0], [place(5)], { light: 'torch', feet: [0, 0, 0] }, 1, 0), []);
});

test("at night the carried light comes first, at the carrier's hand, then the nearest places from the eye", () => {
  const places = [place(300, 1), place(20, 2), place(-50, 3)];
  const lamps = lampsRound([10, 0, 1], places, { light: 'lantern', feet: [14, 3, 0.9] }, 0, 0);
  assert.equal(lamps.length, 4);
  assert.deepEqual(lamps[0]?.fromEye, [4, 3, 1]);
  assert.deepEqual(lamps[1]?.fromEye, [10, 0, 1]);
  assert.deepEqual(lamps[2]?.fromEye, [-60, 0, 1]);
  assert.deepEqual(lamps[3]?.fromEye, [290, 0, 1]);
  assert.ok((lamps[1]?.light[0] ?? 0) > 0.8 && (lamps[1]?.light[0] ?? 0) <= 1);
});

test('only the nearest LAMPS_MOST are lit, a carried light among them', () => {
  const places = Array.from({ length: 40 }, (_unused, index) => place(index * 7));
  const lamps = lampsRound([0, 0, 0], places, { light: 'torch', feet: [0, 0, 0] }, 0, 1);
  assert.equal(lamps.length, LAMPS_MOST);
  assert.deepEqual(lamps.at(-1)?.fromEye, [(LAMPS_MOST - 2) * 7, 0, 2]);
});

test('a lamp at the cut fades as the first left out nears it, so neither switches on or off at the swap', () => {
  const crowd = Array.from({ length: LAMPS_MOST - 1 }, () => place(0));
  const brightOf = (x: number) => lampsRound([0, 0, 0], [...crowd, place(50), place(x)], null, 0, 0).at(-1)?.light[0];
  assert.ok(Math.abs((brightOf(100) ?? 0) / (brightOf(1000) ?? 1) - 1) < 1e-9, 'whole when well ahead');
  assert.ok(
    (brightOf(55) ?? 1) < (brightOf(60) ?? 0) && (brightOf(60) ?? 0) < (brightOf(100) ?? 0),
    'dimmer as it nears',
  );
  assert.ok((brightOf(50.001) ?? 1) < 1e-3, 'all but out at the swap');
});

test('a great fire farther off is lit before a nearer lantern whose light falls short of the eye', () => {
  const fire: LampPlace = { at: [70, 0, 0], reachM: 60, light: [1, 0.6, 0.3], seed: 0 };
  const lamps = lampsRound([0, 0, 0], [place(40), fire], null, 0, 0);
  assert.deepEqual(
    lamps.map((lamp) => lamp.fromEye[0]),
    [70, 40],
  );
});

test("the eye's place goes to the uniform wrapped, marked known; without it, unknown", () => {
  const known = skyNumbers(AFTERNOON, [], [WRAP_M + 5, -3]);
  const row = 13 * 4;
  assert.deepEqual([...known.slice(row, row + 4)], [0, 5, WRAP_M - 3, 1]);
  const unknown = skyNumbers(AFTERNOON, []);
  assert.deepEqual([...unknown.slice(row, row + 4)], [0, 0, 0, 0]);
});
