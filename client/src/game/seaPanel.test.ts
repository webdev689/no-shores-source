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
  boost: [0, 1],
};
const captain = (state: FightCaptain['state'], runOut: FightCaptain['run_out'] = []): FightCaptain => ({
  ...VESSEL,
  id: 1,
  name: 'Tithe Sloop',
  faction: 1,
  rank: 2,
  mode: 'engage',
  hostile: true,
  run_out: runOut,
  state,
});
const view = (captains: FightCaptain[]): FightView => ({
  clock: 0,
  player: VESSEL,
  captain: captains[0] ?? captain('afloat'),
  others: captains.slice(1),
  balls: [],
  lay: null,
  events: [],
  over: null,
  fingerprint: '',
});

test('the ships left are those still afloat: a struck one is beaten, and the task says sinking is not needed', () => {
  const readout = readoutOf(view([captain('afloat'), captain('struck'), captain('sinking')]), ['Aye']);
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

test('a rival not fighting the player is no ship of theirs to beat', () => {
  const rival = { ...captain('afloat', ['port']), hostile: false };
  const readout = readoutOf(view([captain('afloat'), rival]), []);
  assert.deepEqual([readout.left, readout.men], [1, 12]);
});
