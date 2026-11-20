import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FightView, FightVessel } from '../rules/fightRules.ts';
import { BOARD_REACH_M, SeaAfter, boardable, linesOf } from './seaAfter.ts';

const vessel = (x: number, state: FightVessel['state'], way = 0): FightVessel => ({
  ship: [x, 0, 0, way, 0, 0, 0, 0],
  pose: [0, 0, 0, 0],
  hull: 100,
  max_hull: 100,
  sail: 100,
  max_sail: 100,
  crew: 10,
  max_crew: 10,
  state,
  fires: 0,
  guns: { left: [0, 0], progress: [1, 1], load: 'round', braced: false },
  hull_kind: 0,
});

const fight = (her: FightVessel, own = vessel(0, 'afloat')): FightView =>
  ({
    clock: 0,
    player: own,
    captain: { ...her, name: 'Pirate Sloop', faction: 2, rank: 2, mode: 'struck', hostile: false, run_out: [] },
    others: [],
    balls: [],
    lay: null,
    events: [],
    over: null,
    fingerprint: '',
  }) as FightView;

test('a struck captain alongside, both all but still, may be boarded; one afloat, far or under way may not', () => {
  assert.equal(boardable(fight(vessel(BOARD_REACH_M - 1, 'struck'))), true);
  assert.equal(boardable(fight(vessel(BOARD_REACH_M + 1, 'struck'))), false, 'too far');
  assert.equal(boardable(fight(vessel(10, 'afloat'))), false, 'her colours still fly');
  assert.equal(boardable(fight(vessel(10, 'struck', 2.5))), false, 'she makes way');
  assert.equal(boardable(fight(vessel(10, 'struck'), vessel(0, 'afloat', 3))), false, 'the player makes way');
});

test('the sea’s word becomes the player’s lines: washing up, a piece gathered, a ship joining, her colours struck', () => {
  const kinds = new Map([[7, 'chest']]);
  const lines = linesOf(
    [
      [20, 100, 1, 1],
      [21, 101, 7, 3, 1, 0],
      [22, 102, 0, 2, 3],
      [22, 103, 4, 0, 0],
    ],
    [{ kind: 'Struck', tick: 99, ship: 1 }],
    kinds,
    ['Overlook', 'Sunspire', 'Rimeholt'],
  );
  assert.deepEqual(lines, [
    'Her colours are down: come alongside and press E to board her.',
    'Your ship went down: you washed up at Sunspire, your ship moored at its roadstead.',
    'Gathered a chest: a Rare Vestige, an Ammo box.',
    'The Pirate Schooner joined the fight.',
    'Player 4 joined the fight.',
  ]);
});

test('her repair reads its time left, whole, or how to have it', () => {
  assert.equal(SeaAfter.repairWords({ whole: false, left: 12.2 }), 'Repairing her: 13 s left');
  assert.equal(SeaAfter.repairWords({ whole: true, left: 0 }), 'She is whole');
  assert.match(SeaAfter.repairWords({ whole: false, left: 0 }), /within 3 km/);
});
