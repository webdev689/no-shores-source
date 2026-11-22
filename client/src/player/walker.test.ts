import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Body } from '../rules/movementRules.ts';
import { plainDress } from './dressing.ts';
import { climbOf, drawnInFight, ownColours, shownDress, strokesAfter } from './walker.ts';

test('a stroke is counted when a swing begins, and again when the next begins within a frame', () => {
  assert.equal(strokesAfter(0, null, null), 0, 'no swing');
  assert.equal(strokesAfter(0, null, 0.1), 1, 'a swing begins');
  assert.equal(strokesAfter(1, 0.1, 0.4), 1, 'the same swing goes on');
  assert.equal(strokesAfter(1, 0.9, 0.05), 2, 'the next began as the last ended');
});

test('on a wall or a ledge the weapon is worn, not held', () => {
  const dress = plainDress('human', 0.3);
  const drawn = { ...dress, outfit: { ...dress.outfit, drawn: true } };
  assert.equal(shownDress(drawn, true).outfit.drawn, true);
  assert.equal(shownDress(drawn, false).outfit.drawn, false);
  assert.equal(shownDress(drawn, true), drawn, 'held hands show the dress as it is');
});

test('the climb the hands follow is read off the body: its move, feet and facing, and a mantle under way', () => {
  const body: Body = {
    x: 1,
    y: 2,
    z: 3,
    vx: 0,
    vy: 0,
    vz: 0,
    facing: 0.5,
    mode: 'hang',
    crouched: false,
    crouch: 0,
    grounded: 0,
    over: null,
    lip: 4.5,
    moving: false,
  };
  assert.deepEqual(climbOf(body), { mode: 'hang', feet: [1, 2, 3], wall: 0.5, over: 0, rise: 0 });
  const over = { from: [1, 2, 3], to: [1, 1.5, 4.5], progress: 0.25, seconds: 0.7 } as const;
  assert.deepEqual(climbOf({ ...body, mode: 'mantle', over }), {
    mode: 'mantle',
    feet: [1, 2, 3],
    wall: 0.5,
    over: 0.25,
    rise: 1.5,
  });
  assert.equal(climbOf({ ...body, mode: 'ground' }), null);
  assert.equal(climbOf({ ...body, mode: 'air' }), null);
});

test('the first person is told the faction whose colour each part wears, by the layer the outfit names it for', () => {
  const outfit = {
    armour: { gauntlets: 'fighters', boots: 'iron' },
    garments: [],
    dyes: { gauntlets_fighters: 'stormcallers', bow_long_elven: 'stormcallers', shirt_long_v: 'White' },
    right: 'bow_long_elven',
    left: null,
    drawn: true,
    hair: null,
  } as const;
  assert.deepEqual(ownColours(outfit), { hands: 'stormcallers', right: 'stormcallers' });
});

test('the weapon is put away while a drink lasts, and back in hand as it ends', () => {
  // Frame by frame in a fight, the weapon out: a swing, two frames drinking, then a blow's flinch that cut it short.
  const shown: boolean[] = [];
  let [kept, drank] = [true, false];
  for (const drinking of [false, true, true, false, false]) {
    kept = drawnInFight({ holding: true, kept, worn: true, drinking, drank });
    drank = drinking;
    shown.push(kept);
  }
  assert.deepEqual(shown, [true, false, false, true, true]);
  const busy = { holding: true, kept: false, worn: true, drinking: false, drank: false };
  assert.equal(drawnInFight(busy), false, 'busy in the rules, the hands keep what they held');
  assert.equal(drawnInFight({ ...busy, kept: true, holding: false }), false, 'on a wall, worn');
});
