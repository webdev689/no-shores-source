import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FightCaptain, ShipState } from '../rules/fightRules.ts';
import { HINTS } from './hints.ts';
import type { Hud } from './hud.ts';
import type { Sea } from './sea.ts';
import type { SeaFrame } from './seaFrame.ts';
import { seaPlace, type SeaHudState, seaShipMarks, showSeaHud } from './seaHud.ts';

const captain = (x: number, y: number, state: ShipState, hostile: boolean): FightCaptain =>
  ({ ship: [x, y, 0], pose: [0, 0, 0], state, hostile }) as unknown as FightCaptain;

test('out of a fight the compass marks every other player’s ship in bone and every hostile one in red', () => {
  const others = [{ player: 4, x: 10, y: -20, heading: 0, pace: 1 }];
  const pirates = [
    { id: 7, x: -300, y: 40, heading: 1, faction: 2, rank: 3 },
    { id: 8, x: 9_000, y: 0, heading: 1, faction: 1, rank: 2, sight: 25_920 },
  ];
  assert.deepEqual(seaShipMarks(null, { others, pirates }), [
    { x: 10, y: -20, kind: 'ship' },
    { x: -300, y: 40, kind: 'hostile', rangeM: 5_000 },
    { x: 9_000, y: 0, kind: 'hostile', rangeM: 25_920 },
  ]);
  assert.deepEqual(seaShipMarks(null, null), [], 'out of a room, none');
});

test('in a fight it marks its captains: red while she would take the player, grey once her colours are down, none going down', () => {
  const captains = [
    captain(100, 0, 'afloat', true),
    captain(0, 100, 'afloat', false),
    captain(50, 50, 'struck', true),
    captain(60, 60, 'wrecked', true),
    captain(70, 70, 'sinking', true),
    captain(80, 80, 'sunk', true),
  ];
  const pirates = [{ id: 7, x: -300, y: 40, heading: 1, faction: 2, rank: 3 }];
  assert.deepEqual(seaShipMarks(captains, { others: [], pirates }), [
    { x: 100, y: 0, kind: 'hostile' },
    { x: 0, y: 100, kind: 'ship' },
    { x: 50, y: 50, kind: 'struck' },
    { x: 60, y: 60, kind: 'struck' },
  ]);
});

test('in a fight the sea bar goes: its map, pace, Manage and Leave do nothing there', () => {
  const bars: unknown[] = [];
  const hud = new Proxy(
    {},
    { get: (_target, key) => (key === 'seaBar' ? (bar: unknown) => bars.push(bar) : () => undefined) },
  );
  const sea = (fight: unknown) =>
    ({
      helmView: false,
      aboard: { walking: false, managing: false, active: false, atWheel: false, where: {} },
      boarding: { words: null },
      waterWords: null,
      fight,
      sighted: null,
      inRoom: true,
    }) as unknown as Sea;
  const shown = { shot: { eye: [0, 0, 10], yaw: 0, pitch: 0.3, fov: 1 }, marks: [], bars: [], focus: [0, 0], note: '' };
  const state = { landing: false, onSea: true, region: 'The sea', clock: 0, friendly: [] };
  const show = (fight: unknown) =>
    showSeaHud(hud as unknown as Hud, sea(fight), shown as unknown as SeaFrame, state as unknown as SeaHudState);
  show(null);
  const fight = {
    lines: () => ['Fighting'],
    captains: [],
    aimingNow: false,
    view: { lay: null, captain: { name: 'Pirate Brig' } },
    display: () => null,
  };
  show(fight);
  assert.notEqual(bars[0], null, 'out of a fight the bar stands');
  assert.equal(bars[1], null, 'in one it is hidden');
});

test('the place line names the water she is in as the helm does, managing her too', () => {
  const waterWords = 'The Lantern Sea, Overlook’s home waters';
  const here = (helmView: boolean, managing: boolean) =>
    ({ boarding: { words: null }, helmView, aboard: { walking: false, managing }, waterWords }) as never;
  const state = { landing: false, island: 'Saltmere', region: 'The Pale Expanse' };
  const shown = { landfall: null } as never;
  assert.deepEqual(seaPlace(here(true, false), shown, state), ['At the helm', waterWords]);
  assert.deepEqual(seaPlace(here(false, true), shown, state), ['Managing the Sloop', waterWords]);
  const nowhere = { boarding: { words: null }, helmView: false, aboard: { walking: false, managing: true } } as never;
  assert.deepEqual(seaPlace(nowhere, shown, state), ['Managing the Sloop', 'The Pale Expanse']);
});

test("in a fight the readout stands over the sea: her plate, rose, card and tally; on a struck ship's deck it goes", () => {
  const readouts: unknown[] = [];
  const hud = new Proxy(
    {},
    { get: (_target, key) => (key === 'seaFight' ? (model: unknown) => readouts.push(model) : () => undefined) },
  );
  const model = { ship: null, card: null, tally: null, warn: null };
  const fight = {
    lines: () => [],
    captains: [],
    aimingNow: false,
    view: { lay: null, captain: { name: 'Pirate Brig' } },
    display: () => model,
  };
  const sea = (deck: unknown) =>
    ({
      helmView: false,
      aboard: { walking: false, managing: false, active: false, atWheel: false, where: {} },
      boarding: { words: deck },
      waterWords: null,
      fight,
      sighted: null,
      inRoom: true,
    }) as unknown as Sea;
  const shown = { shot: { eye: [0, 0, 10], yaw: 0, pitch: 0.3, fov: 1 }, marks: [], bars: [], focus: [0, 0], note: '' };
  const state = { landing: false, onSea: true, region: 'The sea', clock: 0, friendly: [] };
  const show = (deck: unknown) =>
    showSeaHud(hud as unknown as Hud, sea(deck), shown as unknown as SeaFrame, state as unknown as SeaHudState);
  show(null);
  show({ place: 'Her deck', line: 'Fighting', hints: [] });
  assert.deepEqual(readouts, [model, null]);
});

test("in a fight the hints are the fight's keys alone, as on foot, and the panel's messages are notices", () => {
  const said: Record<string, unknown[]> = { hints: [], notices: [] };
  const hud = new Proxy(
    {},
    { get: (_target, key: string) => (key in said ? (value: unknown) => said[key]?.push(value) : () => undefined) },
  );
  const lines = [
    'Pirate Brig, 200 m off, closing: hull 60/60, sails 40/40, 8 men.',
    'Broadside from the Pirate Brig: C to brace.',
    'The Pirate Brig surrenders!',
  ];
  const view = { lay: null, captain: { name: 'Pirate Brig' }, others: [] };
  const fight = { lines: () => lines, captains: [], aimingNow: false, view, display: () => null };
  const sea = {
    helmView: false,
    aboard: { walking: false, managing: false, active: false, atWheel: false, where: {} },
    boarding: { words: null },
    waterWords: null,
    fight,
    sighted: null,
    inRoom: true,
  } as unknown as Sea;
  const shown = { shot: { eye: [0, 0, 10], yaw: 0, pitch: 0.3, fov: 1 }, marks: [], bars: [], focus: [0, 0], note: '' };
  const state = { landing: false, onSea: true, region: 'The sea', clock: 0, friendly: [] };
  showSeaHud(hud as unknown as Hud, sea, shown as unknown as SeaFrame, state as unknown as SeaHudState);
  assert.deepEqual(said['hints'], [HINTS.fight]);
  assert.deepEqual(said['notices'], [['The Pirate Brig surrenders!']]);
});
