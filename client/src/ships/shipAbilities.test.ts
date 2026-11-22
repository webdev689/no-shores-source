import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import type { FightVessel } from '../rules/fightRules.ts';
import { BURST_S, RECHARGE_S, SHIP_KEYS, shipAbilities } from './shipAbilities.ts';

const VESSEL: FightVessel = {
  ship: [0, 0, 0, 0, 0, 0, 0, 2],
  pose: [0, 0, 0, 0],
  hull: 60,
  max_hull: 60,
  sail: 40,
  max_sail: 40,
  crew: 10,
  max_crew: 10,
  state: 'afloat',
  fires: 0,
  guns: { left: [3.2, 0], progress: [0.6, 1], load: 'chain', braced: false },
  boost: [0, 1],
};
const shownOf = (more: Partial<FightVessel> = {}, laid: 'port' | 'starboard' | null = null) => {
  const [port, starboard, burst, brace, load] = shipAbilities({ ...VESSEL, ...more }, laid);
  assert.ok(port && starboard && burst && brace && load);
  return { port, starboard, burst, brace, load };
};
const guns = (more: Partial<FightVessel['guns']>) => ({ guns: { ...VESSEL.guns, ...more } });

test("the bar's abilities stand in order, each with the key that uses it", () => {
  const abilities = shipAbilities(VESSEL, null, { aim: 'pad:LT', burst: 'pad:LS', brace: 'pad:B', load: 'pad:Right' });
  assert.deepEqual(
    abilities.map((ability) => [ability.id, ability.name, ability.key]),
    [
      ['port', 'Port broadside', 'pad:LT'],
      ['starboard', 'Starboard broadside', 'pad:LT'],
      ['burst', 'Burst', 'pad:LS'],
      ['brace', 'Brace', 'pad:B'],
      ['load', 'Chain shot', 'pad:Right'],
    ],
  );
  assert.deepEqual(
    shipAbilities(VESSEL, null).map((ability) => ability.key),
    [SHIP_KEYS.aim, SHIP_KEYS.aim, 'Shift', 'C', 'Wheel'],
    'the keys as the fight takes them unbound',
  );
});

test('a broadside reloads as its share loaded and the seconds it still takes, ready once loaded', () => {
  const { port, starboard } = shownOf();
  assert.deepEqual([port.state, port.charge, port.left, port.said], ['charging', 0.6, 3.2, '4 s to reload']);
  assert.deepEqual([starboard.state, starboard.charge, starboard.said], ['ready', 1, 'ready']);
  assert.equal(shownOf(guns({ progress: [1.4, 1] })).port.charge, 1, 'held to whole');
});

test('a side laid by the look glows only while it is loaded and may fire', () => {
  assert.equal(shownOf({}, 'starboard').starboard.laid, true);
  assert.equal(shownOf({}, 'starboard').starboard.said, 'laid, ready');
  assert.equal(shownOf({}, 'port').port.laid, false, 'still loading');
  assert.equal(shownOf({}, 'port').starboard.laid, false, 'the other side');
  assert.equal(shownOf(guns({ braced: true }), 'starboard').starboard.laid, false, 'braced');
});

test('the guns cannot fire while braced or once the ship is no longer afloat', () => {
  const braced = shownOf(guns({ braced: true }));
  assert.deepEqual([braced.port.unable, braced.starboard.unable], [true, true]);
  assert.equal(braced.starboard.said, 'braced, holding fire');
  const wrecked = shownOf({ state: 'wrecked' });
  assert.deepEqual([wrecked.port.unable, wrecked.port.said], [true, 'guns silent']);
  assert.equal(shownOf().port.unable, false);
});

test('the burst runs, then recharges for its 12 s, then is ready; a wreck cannot burst', () => {
  const running = shownOf({ boost: [0.75, 0] }).burst;
  assert.deepEqual([running.state, running.running, running.charge, running.left], ['active', 0.75, 0, 3]);
  assert.equal(running.said, 'bursting');
  const charging = shownOf({ boost: [0, 0.25] }).burst;
  assert.deepEqual([charging.state, charging.charge, charging.left], ['charging', 0.25, 0.75 * RECHARGE_S]);
  assert.equal(charging.said, '9 s to recharge');
  assert.deepEqual([shownOf().burst.state, shownOf().burst.said], ['ready', 'ready']);
  assert.equal(shownOf({ state: 'wrecked' }).burst.unable, true);
});

test('the brace is in use while held; going down the ship no longer braces or loads', () => {
  assert.deepEqual(
    [shownOf(guns({ braced: true })).brace.state, shownOf(guns({ braced: true })).brace.said],
    ['active', 'braced'],
  );
  assert.equal(shownOf().brace.state, 'ready');
  const sinking = shownOf({ state: 'sinking' });
  assert.deepEqual([sinking.brace.unable, sinking.load.unable], [true, true]);
  const wrecked = shownOf({ state: 'wrecked' });
  assert.deepEqual([wrecked.brace.unable, wrecked.load.unable], [false, false], 'a wreck still braces and loads');
});

test('the load shows the shot the guns take, by its own picture', () => {
  for (const load of ['round', 'grape', 'chain', 'heated'] as const) {
    const shown = shownOf(guns({ load })).load;
    assert.deepEqual([shown.icon, shown.state, shown.said], [load, 'ready', 'loaded']);
  }
});

test("the burst's seconds are the rules' own", async () => {
  const rules = await readFile(new URL('../../../crates/naval/src/boost.rs', import.meta.url), 'utf8');
  assert.match(rules, new RegExp(`pub const BURST_S: f64 = ${BURST_S}\\.0;`));
  assert.match(rules, new RegExp(`pub const RECHARGE_S: f64 = ${RECHARGE_S}\\.0;`));
});
