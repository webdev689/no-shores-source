import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FightCaptain, FightVessel, FightView } from '../rules/fightRules.ts';
import { readoutOf, seaFightQuest } from './seaPanel.ts';

const VESSEL: FightVessel = {
  ship: [0, 0, 0],
  pose: [0, 0, 0, 0],
  hull: 140.2,
  max_hull: 200,
  sail: 80,
  max_sail: 100,
  crew: 11.4,
  max_crew: 20,
  state: 'afloat',
  fires: 0,
  guns: { left: [2.34, 0], progress: [0, 0], load: 'grape', braced: true },
};
const captain = (state: FightCaptain['state'], runOut: FightCaptain['run_out'] = []): FightCaptain => ({
  ...VESSEL,
  id: 1,
  name: 'Pirate Sloop',
  faction: 2,
  rank: 2,
  mode: 'engage',
  hostile: true,
  run_out: runOut,
  state,
});
const view = (captains: FightCaptain[], lay: FightView['lay'] = null): FightView => ({
  clock: 0,
  player: VESSEL,
  captain: captains[0] ?? captain('afloat'),
  others: captains.slice(1),
  balls: [],
  lay,
  events: [],
  over: null,
  fingerprint: '',
});

test("her ship's panel reads her hurts, each side's guns, the shot and the brace", () => {
  const { ship } = readoutOf(view([captain('afloat')]), 'Brig', []);
  assert.equal(ship.name, 'Your Brig');
  assert.deepEqual(
    [ship.hull, ship.sails, ship.crew],
    [
      [141, 200],
      [80, 100],
      [12, 20],
    ],
  );
  assert.deepEqual(ship.guns, ['2.3 s', 'Ready']);
  assert.equal(ship.shot, 'Grape shot');
  assert.equal(ship.braced, true);
  assert.equal(ship.broadside, false);
});

test('a side being laid says so, and on target once a ball would strike', () => {
  const lay = {
    side: 'starboard',
    launches: [],
    elevation: 0,
    reach: 0,
    ends: [],
    radius: 0,
    on_target: false,
  } as const;
  assert.deepEqual(readoutOf(view([captain('afloat')], lay), 'Brig', []).ship.guns, ['2.3 s', 'Laying']);
  const onTarget = { ...lay, on_target: true };
  assert.deepEqual(readoutOf(view([captain('afloat')], onTarget), 'Brig', []).ship.guns, ['2.3 s', 'On target']);
});

test('the broadside warning stands only while an afloat captain has a side run out', () => {
  assert.equal(readoutOf(view([captain('afloat', ['port'])]), 'Brig', []).ship.broadside, true);
  assert.equal(readoutOf(view([captain('struck', ['port'])]), 'Brig', []).ship.broadside, false);
});

test('the ships left are those still afloat: a struck one is beaten, and the task says sinking is not needed', () => {
  const readout = readoutOf(view([captain('afloat'), captain('struck'), captain('sinking')]), 'Brig', ['Aye']);
  assert.equal(readout.left, 1);
  assert.equal(readout.men, 12, "the afloat ship's men, rounded up");
  assert.deepEqual(readout.said, ['Aye']);
  const quest = seaFightQuest('Prologue', readout.left, readout.men);
  assert.equal(quest.task, 'Defeat their crews');
  assert.deepEqual(quest.steps, [
    { text: 'Ships left', count: 1 },
    { text: 'Their men', count: 12 },
    { text: 'No need to sink them' },
  ]);
});

test('a rival not fighting her is no ship of hers to beat, nor her broadside a warning', () => {
  const rival = { ...captain('afloat', ['port']), hostile: false };
  const readout = readoutOf(view([captain('afloat'), rival]), 'Brig', []);
  assert.deepEqual([readout.left, readout.men, readout.ship.broadside], [1, 12, false]);
});
