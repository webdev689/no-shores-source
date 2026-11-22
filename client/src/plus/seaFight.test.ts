import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type SeaFightModel, seaFightWords } from './seaFight.ts';

const card = {
  name: 'Pirate Brig',
  sub: 'Brig - 70 m',
  hull: 0.5,
  sail: 1,
  state: 'afloat',
  hostile: true,
  boardKey: null,
  faction: 2,
  band: 'orange',
} as const;

test("the card says DFO's states: hostile, colours struck with the key that boards it, going down", () => {
  const state = (more: Partial<SeaFightModel['card'] & object>) =>
    seaFightWords({ ship: null, card: { ...card, ...more }, tally: null, warn: null }).state;
  assert.equal(state({}), 'Hostile');
  assert.equal(state({ state: 'struck' }), 'Colors struck');
  assert.equal(state({ state: 'struck', boardKey: 'E' }), 'Colors struck - E: board');
  assert.equal(state({ state: 'sinking' }), 'Going down');
});

test("the tally counts the last volley's balls struck, below the waterline and through the rigging", () => {
  const tally = (balls: number, hits: number, holed: number, rig: number) =>
    seaFightWords({ ship: null, card: null, tally: { balls, hits, holed, rig }, warn: null }).tally;
  assert.equal(tally(6, 3, 1, 2), '3 of 6 balls struck - 1 below the waterline - 2 in the rigging');
  assert.equal(tally(1, 0, 0, 0), '0 of 1 ball struck');
});
