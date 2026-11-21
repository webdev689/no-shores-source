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

test('her panel stands at the bottom left, the broadside’s warning only while one is run out, its bars easing', async () => {
  const { FightPanel } = await import('./seaPanel.ts');
  const panel = new FightPanel();
  const ship = {
    name: 'Your Sloop',
    hull: [50, 100],
    sails: [80, 80],
    crew: [20, 20],
    guns: ['Ready', '3.4 s'],
    shot: 'Round shot',
    braced: false,
    broadside: false,
  } as const;
  assert.equal(panel.shown, false);
  panel.show(ship, 0);
  const said = (now: number, still = false) => JSON.stringify(panel.node({ width: 1280, height: 720 }, now, still));
  assert.ok(!said(0).includes('BROADSIDE') && !said(0).includes('Braced'));
  assert.ok(said(0).includes('"50%"'), 'the hull half full from the first');
  panel.show({ ...ship, hull: [0, 100], broadside: true, braced: true }, 1);
  assert.ok(said(1).includes('"50%"') && said(2).includes('"0%"'), 'eased to what she has now');
  assert.ok(said(2).includes('BROADSIDE! BRACE') && said(2).includes('Braced'));
  assert.equal(panel.node({ width: 800, height: 600 }, 2, true)?.float?.y, -262, 'over the dialogue box when narrow');
});
