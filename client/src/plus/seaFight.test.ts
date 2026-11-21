import assert from 'node:assert/strict';
import { test } from 'node:test';
import { UNDER_COMPASS } from './compass.ts';
import { type RoseSide, seaFightCss, type SeaFightModel, seaFightWords } from './seaFight.ts';

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
  faction: 2,
  band: 'orange',
} as const;

test("the rose's chip says its load, and the seconds a side still loads", () => {
  const words = seaFightWords({
    ship: { ...ship, port: side({ ready: false, fill: 0.4, left: 3.2 }) },
    card: null,
    tally: null,
    warn: null,
  });
  assert.equal(words.port, 'Round 4s');
  assert.equal(words.starboard, 'Round');
});

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

test("in a sea fight the sea's status line stands in the top right corner, never over the sky the aim looks at", () => {
  const rule = /#hud:has\(> \.seafight:not\(\[hidden\]\)\) > \.status \{([^}]*)\}/.exec(seaFightCss())?.[1] ?? '';
  assert.match(rule, /right: 28px/);
  assert.match(rule, /top: 22px/);
  assert.match(rule, /left: auto/);
  assert.match(rule, /transform: none/);
  assert.match(
    seaFightCss(),
    /#hud:has\(> \.seafight:not\(\[hidden\]\)\) \.place \{ visibility: hidden; \}/,
    "the place's name gives way to the ship's bars",
  );
});

test("the side the look lays glows gold round its chip, as DFO's active battery does, its fill kept", () => {
  const rule = /\.seafight-side\.laid \{([^}]*)\}/.exec(seaFightCss())?.[1] ?? '';
  assert.match(rule, /box-shadow: 0 0 0 1px #050608, 0 0 8px rgba\(243, ?207, ?134, ?0\.45\)/);
  assert.doesNotMatch(rule, /background/, 'its load still fills it');
});

test('the broadside warning stands under the target card at the top, never over the sight or the ship aimed at', () => {
  const rule = /\.seafight-warn \{([^}]*)\}/.exec(seaFightCss())?.[1] ?? '';
  assert.doesNotMatch(rule, /50%\s*[-+]/, 'not stood off the middle of the screen, where the sight is');
  assert.match(rule, new RegExp(`top: ${UNDER_COMPASS}px`), 'under the compass while no card shows');
  assert.match(seaFightCss(), /@media \(prefers-reduced-motion: reduce\) \{ \.seafight-warn \{ animation: none; \} \}/);
});
