import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type RoseSide, type SeaFightModel, seaFightWords } from './seaFight.ts';

const side = (more: Partial<RoseSide> = {}): RoseSide => ({
  fill: 1,
  ready: true,
  fresh: false,
  laid: false,
  load: 'Round',
  left: 0,
  ...more,
});
const ship = {
  name: 'Your Sloop',
  hull: 1,
  sail: 1,
  crew: 1,
  fire: false,
  braced: false,
  port: side(),
  starboard: side(),
  blow: null,
};
const card = {
  name: 'Pirate Brig',
  sub: 'Brig - 70 m',
  hull: 0.5,
  sail: 1,
  state: 'afloat',
  hostile: true,
  boardKey: null,
} as const;

test("the rose's chip says its load, and the seconds a side still loads", () => {
  const words = seaFightWords({
    ship: { ...ship, port: side({ ready: false, fill: 0.4, left: 3.2 }) },
    card: null,
    tally: null,
  });
  assert.equal(words.port, 'Round 4s');
  assert.equal(words.starboard, 'Round');
});

test("the card says DFO's states: hostile, colours struck with the key that boards her, going down", () => {
  const state = (more: Partial<SeaFightModel['card'] & object>) =>
    seaFightWords({ ship: null, card: { ...card, ...more }, tally: null }).state;
  assert.equal(state({}), 'Hostile');
  assert.equal(state({ state: 'struck' }), 'Colors struck');
  assert.equal(state({ state: 'struck', boardKey: 'E' }), 'Colors struck - E: board');
  assert.equal(state({ state: 'sinking' }), 'Going down');
});

test("the tally counts her last volley's balls struck, below her waterline and through her rigging", () => {
  const tally = (balls: number, hits: number, holed: number, rig: number) =>
    seaFightWords({ ship: null, card: null, tally: { balls, hits, holed, rig } }).tally;
  assert.equal(tally(6, 3, 1, 2), '3 of 6 balls struck - 1 below the waterline - 2 in the rigging');
  assert.equal(tally(1, 0, 0, 0), '0 of 1 ball struck');
});
