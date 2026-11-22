import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import type { FightCaptain, FightVessel, FightView } from '../rules/fightRules.ts';
import { bowWords, fightDisplay, RUN_IN_DEG, RUN_OUT_S } from './fightDisplay.ts';
import { FightFeel } from './fightFeel.ts';

const vessel: FightVessel = {
  ship: [0, 0, 0, 0, 0, 0, 0, 2],
  pose: [0, 0, 0, 0],
  hull: 30,
  max_hull: 60,
  sail: 40,
  max_sail: 40,
  crew: 8,
  max_crew: 10,
  state: 'afloat',
  fires: 1,
  guns: { left: [2.5, 0], progress: [0.4, 1], load: 'chain', braced: true },
  boost: [0, 1],
};
const captain = (name: string, east: number, more: Partial<FightCaptain> = {}): FightCaptain => ({
  ...vessel,
  ship: [east, 0, 0, 0, 0, 0, 0, 2],
  fires: 0,
  id: 1,
  name,
  faction: 2,
  rank: 2,
  mode: 'engage',
  hostile: true,
  run_out: [],
  hull_kind: 2,
  ...more,
});
const VIEW: FightView = {
  clock: 0,
  player: vessel,
  captain: captain('Pirate Brig', 200),
  others: [captain('Tithe Sloop', 70, { state: 'struck', faction: 1, id: 2 })],
  balls: [],
  lay: { side: 'starboard', launches: [], elevation: 0, reach: 150, ends: [], radius: 3, on_target: false },
  events: [],
  over: null,
  fingerprint: '',
};

test("the plate shows the ship's hurts and fire, and its bar each side's reload, its burst, brace and load", () => {
  const model = fightDisplay(VIEW, new FightFeel(1), 0, { boardable: false, boardKey: 'E', braceKey: 'C' });
  assert.deepEqual(model.ship && [model.ship.hull, model.ship.sail, model.ship.crew, model.ship.fire], [
    0.5,
    1,
    0.8,
    true,
  ]);
  const shown = (model.ship?.abilities ?? []).map((ability) => [ability.id, ability.state, ability.unable]);
  assert.deepEqual(shown, [
    ['port', 'charging', true],
    ['starboard', 'ready', true],
    ['burst', 'ready', false],
    ['brace', 'active', false],
    ['load', 'ready', false],
  ]);
  assert.equal(model.ship?.abilities[4]?.icon, 'chain');
  assert.deepEqual(
    model.ship?.abilities.map((ability) => ability.key),
    ['Right button', 'Right button', 'Shift', 'C', 'Wheel'],
    "the game's own keys where none are given",
  );
});

test("the side the look lays glows on the bar while it may fire, with the keys the game's binds give", () => {
  const unbraced = { ...VIEW, player: { ...vessel, guns: { ...vessel.guns, braced: false } } };
  const keys = { aim: 'pad:LT', burst: 'pad:LS', brace: 'pad:B', load: 'pad:Right' };
  const model = fightDisplay(unbraced, new FightFeel(1), 0, { boardable: false, boardKey: 'X', braceKey: 'B', keys });
  const starboard = model.ship?.abilities.find((ability) => ability.id === 'starboard');
  assert.deepEqual([starboard?.laid, starboard?.key], [true, 'pad:LT']);
  assert.equal(model.ship?.abilities.find((ability) => ability.id === 'port')?.laid, false);
});

test('the card is on the nearest captain: its name, class and distance, struck with the board key when it can be boarded', () => {
  const model = fightDisplay(VIEW, new FightFeel(1), 0, { boardable: true, boardKey: 'E', braceKey: 'C' });
  assert.deepEqual(model.card && [model.card.name, model.card.sub, model.card.state, model.card.boardKey], [
    'Tithe Sloop',
    'Brig - 70 m',
    'struck',
    'E',
  ]);
  const far = fightDisplay(VIEW, new FightFeel(1), 0, { boardable: false, boardKey: 'E', braceKey: 'C' });
  assert.equal(far.card?.boardKey, null);
});

test("the volley's tally once its last ball is down: how many struck, holed and through the rigging", () => {
  const feel = new FightFeel(2);
  const ships = new Map();
  const step = (events: never[], balls: [number, number, number, number][], now: number) =>
    feel.frame({ events, ships, balls, now, seconds: 0.1, windBearing: 0, toWindow: (point) => point });
  const muzzle = { kind: 'muzzle', ship: 0, point: [0, 2, 2], launch: [0, 300, 0] };
  step([muzzle, muzzle, muzzle] as never[], [[0, 5, 2, 0.07]], 0);
  step([{ kind: 'hit', ship: 1, by: 0, zone: 'holed', point: [0, 60, 1] }] as never[], [[0, 30, 2, 0.07]], 0.3);
  step([{ kind: 'hit', ship: 1, by: 0, zone: 'rig', point: [0, 60, 6] }] as never[], [[0, 40, 2, 0.07]], 0.5);
  assert.equal(
    fightDisplay(VIEW, feel, 0.5, { boardable: false, boardKey: 'E', braceKey: 'C' }).tally,
    null,
    'not while aloft',
  );
  step([], [], 0.8);
  assert.deepEqual(fightDisplay(VIEW, feel, 0.9, { boardable: false, boardKey: 'E', braceKey: 'C' }).tally, {
    balls: 3,
    hits: 2,
    holed: 1,
    rig: 1,
  });
  assert.equal(
    fightDisplay(VIEW, feel, 10, { boardable: false, boardKey: 'E', braceKey: 'C' }).tally,
    null,
    'shown a while',
  );
});

test('while the guns are laid the card is on the captain where they fall, as DFO names the ship the look is on', () => {
  const end = (east: number) => ({ time: 3, point: [east, 0, 0] as const, water: true, strike: null });
  const lay = { ...VIEW.lay!, ends: [end(196), end(204)] };
  const model = fightDisplay({ ...VIEW, lay }, new FightFeel(1), 0, { boardable: false, boardKey: 'E', braceKey: 'C' });
  assert.equal(model.card?.name, 'Pirate Brig', 'the far one laid on, not the nearer Sloop');
});

test("the broadside warning names the nearest captain running out its guns at the player, as DFO's warning does", () => {
  const board = { boardable: false, boardKey: 'E', braceKey: 'C' };
  const quiet = fightDisplay(VIEW, new FightFeel(1), 0, board);
  assert.equal(quiet.warn, null, 'none while no battery is run out');
  const running = {
    ...VIEW,
    captain: captain('Pirate Brig', 200, { run_out: ['port'] }),
    others: [captain('Tithe Sloop', 70, { state: 'struck', run_out: ['port'], id: 2 })],
  };
  const model = fightDisplay(running, new FightFeel(1), 0, board);
  assert.deepEqual(
    model.warn,
    {
      id: '1 port',
      name: 'Pirate Brig',
      range: 200,
      bearing: 'on your starboard beam',
      load: 'chain',
      tell: RUN_OUT_S,
      braceKey: 'C',
      braced: true,
    },
    'a struck ship runs out no guns at the player',
  );
  const pad = fightDisplay(running, new FightFeel(1), 0, { boardable: false, boardKey: 'X', braceKey: 'B' });
  assert.equal(pad.warn?.braceKey, 'B', 'the brace as bound, on the pad played last');
});

test('a battery warns only run out at the player: not an ally’s, not one turned away; the nearest named', () => {
  const board = { boardable: false, boardKey: 'E', braceKey: 'C' };
  const warnOf = (captains: FightCaptain[]) =>
    fightDisplay({ ...VIEW, captain: captains[0]!, others: captains.slice(1) }, new FightFeel(1), 0, board).warn;
  assert.equal(warnOf([captain('Pirate Brig', 200, { run_out: ['starboard'] })]), null, 'its starboard faces away');
  assert.equal(warnOf([captain('Tithe Sloop', 200, { run_out: ['port'], hostile: false })]), null, 'an ally’s');
  const many = warnOf([
    captain('Pirate Brig', 200, { run_out: ['port'] }),
    captain('Pirate Sloop', -90, { run_out: ['starboard'], id: 2 }),
  ]);
  assert.deepEqual([many?.name, many?.bearing], ['Pirate Sloop', 'on your port beam'], 'nearest first');
});

test('where a ship lies is said from the bow as a sailor says it, a quarter of a side each', () => {
  const lying = (degrees: number) => {
    const radians = (degrees * Math.PI) / 180;
    return bowWords(vessel, [Math.sin(radians) * 100, -Math.cos(radians) * 100]);
  };
  assert.deepEqual([0, 30, 90, 140, 180, -30, -90, -140].map(lying), [
    'dead ahead',
    'off your starboard bow',
    'on your starboard beam',
    'off your starboard quarter',
    'astern',
    'off your port bow',
    'on your port beam',
    'off your port quarter',
  ]);
});

test("the tell and the reach of a side run out are the captains' own", async () => {
  const rules = await readFile(new URL('../../../crates/naval/src/captain/aim.rs', import.meta.url), 'utf8');
  assert.match(rules, new RegExp(`pub const RUN_OUT_S: f64 = ${RUN_OUT_S};`));
  assert.match(rules, new RegExp(`pub const RUN_IN_DEG: f64 = ${RUN_IN_DEG}\\.0;`));
});

test("the burst on the bar is the player's own, from the rules' view", () => {
  const model = fightDisplay({ ...VIEW, player: { ...vessel, boost: [0.5, 0] } }, new FightFeel(1), 0, {
    boardable: false,
    boardKey: 'E',
    braceKey: 'C',
  });
  const burst = model.ship?.abilities.find((ability) => ability.id === 'burst');
  assert.deepEqual([burst?.state, burst?.running], ['active', 0.5]);
});
