import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FightCaptain, FightVessel, FightView } from '../rules/fightRules.ts';
import { boostRing, fightDisplay } from './fightDisplay.ts';
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

test("the plate shows the ship's hurts, fire and brace, and the rose each side's reload, the laid side gold", () => {
  const model = fightDisplay(VIEW, new FightFeel(1), 0, { boardable: false, boardKey: 'E' });
  assert.deepEqual(
    model.ship && [model.ship.hull, model.ship.sail, model.ship.crew, model.ship.fire, model.ship.braced],
    [0.5, 1, 0.8, true, true],
  );
  assert.deepEqual(
    model.ship && [model.ship.port.fill, model.ship.port.ready, model.ship.port.left, model.ship.port.laid],
    [0.4, false, 2.5, false],
  );
  assert.deepEqual(model.ship && [model.ship.starboard.ready, model.ship.starboard.laid, model.ship.starboard.load], [
    true,
    true,
    'Chain',
  ]);
});

test('the card is on the nearest captain: its name, class and distance, struck with the board key when it can be boarded', () => {
  const model = fightDisplay(VIEW, new FightFeel(1), 0, { boardable: true, boardKey: 'E' });
  assert.deepEqual(model.card && [model.card.name, model.card.sub, model.card.state, model.card.boardKey], [
    'Tithe Sloop',
    'Brig - 70 m',
    'struck',
    'E',
  ]);
  const far = fightDisplay(VIEW, new FightFeel(1), 0, { boardable: false, boardKey: 'E' });
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
  assert.equal(fightDisplay(VIEW, feel, 0.5, { boardable: false, boardKey: 'E' }).tally, null, 'not while aloft');
  step([], [], 0.8);
  assert.deepEqual(fightDisplay(VIEW, feel, 0.9, { boardable: false, boardKey: 'E' }).tally, {
    balls: 3,
    hits: 2,
    holed: 1,
    rig: 1,
  });
  assert.equal(fightDisplay(VIEW, feel, 10, { boardable: false, boardKey: 'E' }).tally, null, 'shown a while');
});

test('while the guns are laid the card is on the captain where they fall, as DFO names the ship the look is on', () => {
  const end = (east: number) => ({ time: 3, point: [east, 0, 0] as const, water: true, strike: null });
  const lay = { ...VIEW.lay!, ends: [end(196), end(204)] };
  const model = fightDisplay({ ...VIEW, lay }, new FightFeel(1), 0, { boardable: false, boardKey: 'E' });
  assert.equal(model.card?.name, 'Pirate Brig', 'the far one laid on, not the nearer Sloop');
});

test("the broadside warning names the nearest captain running out its guns, as DFO's warning does", () => {
  const quiet = fightDisplay(VIEW, new FightFeel(1), 0, { boardable: false, boardKey: 'E' });
  assert.equal(quiet.warn, null, 'none while no battery is run out');
  const running = {
    ...VIEW,
    captain: captain('Pirate Brig', 200, { run_out: ['port'] }),
    others: [captain('Tithe Sloop', 70, { state: 'struck', run_out: ['port'], id: 2 })],
  };
  const model = fightDisplay(running, new FightFeel(1), 0, { boardable: false, boardKey: 'E' });
  assert.equal(model.warn, 'Broadside from the Pirate Brig - C: brace', 'a struck ship runs out no guns at the player');
});

test('the boost ring is whole once ready, drains while the ship bursts and fills as it recharges', () => {
  assert.deepEqual(boostRing([0, 1]), { state: 'ready', share: 1 });
  assert.deepEqual(boostRing([0.75, 0]), { state: 'burst', share: 0.75 });
  assert.deepEqual(boostRing([0, 0.25]), { state: 'charging', share: 0.25 });
  const model = fightDisplay({ ...VIEW, player: { ...vessel, boost: [0.5, 0] } }, new FightFeel(1), 0, {
    boardable: false,
    boardKey: 'E',
  });
  assert.deepEqual(model.ship?.boost, { state: 'burst', share: 0.5 }, "the player's own burst, from the rules' view");
});
