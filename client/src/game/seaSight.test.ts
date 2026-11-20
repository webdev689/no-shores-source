import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FightLay, FightVessel } from '../rules/fightRules.ts';
import { aimLineOf } from './seaSight.ts';

const vessel: FightVessel = {
  ship: [0, 0, 0, 0, 0, 0, 0, 2],
  pose: [0, 0, 0, 0],
  hull: 240,
  max_hull: 240,
  sail: 96,
  max_sail: 96,
  crew: 0,
  max_crew: 0,
  state: 'afloat',
  fires: 0,
  guns: { left: [0, 0], progress: [1, 1], load: 'round', braced: false },
};
/** Heading north, her starboard guns fire east: two guns at her side, laid to fall 112 m out. */
const LAY: FightLay = {
  side: 'starboard',
  launches: [
    [3, -2, 2, 50, 0, 3],
    [3, 2, 2, 50, 0, 3],
  ],
  elevation: 0.05,
  reach: 153.6,
  ends: [
    { time: 2.2, point: [115, -2, 0], water: true, strike: null },
    { time: 2.2, point: [115, 2, 0], water: true, strike: null },
  ],
  radius: 2,
  on_target: false,
};

test('the aim line names the side, the shot and the range the guns are laid to, as DFO says it', () => {
  assert.deepEqual(aimLineOf(LAY, vessel), {
    words: 'Starboard broadside, round shot - ',
    range: '112 m',
    tail: '',
    hot: false,
    dim: false,
  });
  const port = { ...LAY, side: 'port' as const };
  const grape = { ...vessel, guns: { ...vessel.guns, load: 'grape' as const } };
  assert.equal(aimLineOf(port, grape)?.words, 'Port broadside, grapeshot - ');
});

test('laid to their longest it says so; on target it says so and burns red', () => {
  const longest = { ...LAY, ends: LAY.ends.map((end) => end && { ...end, point: [156.4, 0, 0] as const }) };
  assert.equal(aimLineOf(longest, vessel)?.range, '153 m (longest)');
  const hot = aimLineOf({ ...LAY, on_target: true }, vessel);
  assert.equal(hot?.tail, ' - on target');
  assert.equal(hot?.hot, true);
});

test('while the side reloads, braces or her guns are silent, the line says why and dims', () => {
  const loading = { ...vessel, guns: { ...vessel.guns, left: [0, 4.24] as const } };
  const reloading = aimLineOf({ ...LAY, on_target: true }, loading);
  assert.equal(reloading?.tail, ' - reloading 4.2\u00a0s');
  assert.deepEqual([reloading?.hot, reloading?.dim], [false, true]);
  const braced = { ...vessel, guns: { ...vessel.guns, braced: true } };
  assert.equal(aimLineOf(LAY, braced)?.tail, ' - braced');
  assert.equal(aimLineOf(LAY, { ...vessel, state: 'wrecked' })?.tail, ' - guns silent');
  assert.equal(aimLineOf(null, vessel), null);
});
