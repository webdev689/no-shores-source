import assert from 'node:assert/strict';
import { test } from 'node:test';
import { maskFromOutlines } from '../overworld/seaRoute.ts';
import type { Node } from '../ui/node.ts';
import { byId, fakeInterface, nodesOf, wordsIn } from '../ui/uiForTests.ts';
import { consoleOf, consoleShown, boundWords } from './seaScreen.ts';
import { Passage } from './passage.ts';
import type { Sea } from './sea.ts';
import type { SeaLandings } from './seaLandings.ts';
import type { SeaRoom } from './seaRoom.ts';
import {
  bearingWords,
  type ConsoleActions,
  type ConsoleState,
  degreesOf,
  shipConsoleNode,
  windOf,
} from './shipConsole.ts';

/** Open sea round a point well inside the world's frame. */
const OPEN = { leftM: 900_000, topM: 900_000, widthM: 200_000, heightM: 200_000 };

const STATE: ConsoleState = {
  ...{ level: 'oversea', name: 'The Gull', hull: 'Sloop', heading: Math.PI / 2, wind: null, sailing: true },
  ...{
    resumable: false,
    pace: 200,
    paceNow: 200,
    held: false,
    speed: 2_400,
    bound: null,
    share: 0.25,
    line: 'Sailing · 9 km to go',
  },
  ...{ water: 'The Lantern Sea', kept: { hull: 0.82, sail: 1, crew: 0.5 }, canLeave: true, canManage: true },
};

/** The console as laid on a view `width` wide, its presses heard in `heard`, clicking `pressed` first if given. */
function laid(state: ConsoleState, width = 1280, pressed: string | null = null) {
  const { ui, step } = fakeInterface(width, 720);
  const heard: string[] = [];
  const said = (what: string) => () => void heard.push(what);
  const act: ConsoleActions = {
    level: (level) => heard.push(`level ${level}`),
    ...{ map: said('map'), voyage: said('voyage'), sailOn: said('sail on'), heaveTo: said('heave to') },
    ...{ manage: said('manage'), leave: said('leave') },
  };
  let node: Node = shipConsoleNode(ui, state, act, width);
  const root = () => (node = shipConsoleNode(ui, state, act, width));
  step(root);
  const box = pressed ? ui.boxOf(pressed) : null;
  if (pressed) assert.ok(box, pressed);
  if (box) {
    const spot = { x: box.x + 3, y: box.y + 3 };
    step(root, [
      { kind: 'pointer', ...spot },
      { kind: 'down', ...spot, button: 0 },
      { kind: 'up', ...spot, button: 0 },
    ]);
  }
  return { node, heard, ui };
}

test('bearings read as whole degrees and the sixteen winds; the wind is said from where it blows', () => {
  assert.deepEqual(
    [degreesOf(0), degreesOf(Math.PI / 2), degreesOf(-Math.PI / 2), degreesOf(2 * Math.PI)],
    [0, 90, 270, 0],
  );
  assert.deepEqual(
    [windOf(0), windOf((22.5 * Math.PI) / 180), windOf(Math.PI), windOf((350 * Math.PI) / 180)],
    ['N', 'NNE', 'S', 'N'],
  );
  // A wind blowing toward the west comes from the east.
  assert.deepEqual(bearingWords(Math.PI / 2, { toward: (270 * Math.PI) / 180, speed: 6.4 }), {
    heading: '90° E',
    wind: 'Wind 6 m/s from the E',
  });
  assert.equal(bearingWords(0, { toward: 0, speed: 0.2 }).wind, 'Calm');
  assert.equal(bearingWords(0, null).wind, 'Calm');
});

test('the Oversea view’s presses plan a voyage and stop it; the helm’s and the ship’s are sea level’s', () => {
  const oversea = laid(STATE).node;
  for (const id of ['sea:map', 'sea:voyage', 'sea:view-oversea', 'sea:view-sealevel']) assert.ok(byId(oversea, id), id);
  for (const id of ['sea:sail-on', 'sea:heave-to', 'sea:manage', 'sea:leave'])
    assert.equal(byId(oversea, id), undefined, id);
  assert.equal(byId(oversea, 'sea:view-oversea')?.role, 'primary', 'the view shown lit');
  const sealevel = laid({ ...STATE, level: 'sealevel' }).node;
  for (const id of ['sea:sail-on', 'sea:heave-to', 'sea:manage', 'sea:leave']) assert.ok(byId(sealevel, id), id);
  assert.equal(byId(sealevel, 'sea:map'), undefined);
  const resting = laid({ ...STATE, level: 'sealevel', sailing: false, canLeave: false }).node;
  assert.equal(byId(resting, 'sea:heave-to')?.disabled, true, 'nothing to heave to at rest');
  assert.equal(byId(resting, 'sea:leave')?.disabled, true, 'out of a room, the helm is kept');
  assert.equal(byId(laid({ ...STATE, sailing: false }).node, 'sea:voyage'), undefined, 'no voyage to stop');
});

test('the presses run what the console was handed: the switch, the map, and at sea level the helm', () => {
  assert.deepEqual(laid(STATE, 1280, 'sea:view-sealevel').heard, ['level sealevel']);
  assert.deepEqual(laid(STATE, 1280, 'sea:map').heard, ['map']);
  assert.deepEqual(laid({ ...STATE, level: 'sealevel' }, 1280, 'sea:sail-on').heard, ['sail on']);
  const { heard, ui } = laid({ ...STATE, level: 'sealevel' }, 1280, 'sea:leave');
  assert.deepEqual(heard, ['leave']);
  assert.equal(ui.focused('sea:leave'), false, 'it lets go of the focus, so Space never presses it again');
});

test('the console says the voyage’s pace and speed, where it is bound, how far along, and the ship’s hurts', () => {
  const words = wordsIn(laid({ ...STATE, bound: "Overlook's harbour, to dock" }).node).join(' | ');
  for (const said of [
    'The Gull',
    'Sloop',
    'Under way',
    '2400 m/s',
    'Pace ×200',
    "Bound for Overlook's harbour, to dock",
  ])
    assert.ok(words.includes(said), said);
  for (const said of ['82%', '100%', '50%', 'The Lantern Sea', '90° E']) assert.ok(words.includes(said), said);
  const eased = wordsIn(laid({ ...STATE, paceNow: 1, speed: 12 }).node).join(' | ');
  assert.ok(eased.includes('×1 (×200 set) · true speed while watched'), eased);
  const atRest = wordsIn(laid({ ...STATE, sailing: false, share: null }).node).join(' | ');
  assert.ok(atRest.includes('At anchor') && atRest.includes('Click the sea to sail at ×60; plan on the map for ×200.'));
  const atSeaLevel = wordsIn(laid({ ...STATE, level: 'sealevel', sailing: false, share: null }).node).join(' | ');
  assert.ok(atSeaLevel.includes('W sails on; A and D steer.'), atSeaLevel);
  assert.ok(!atSeaLevel.includes('Click the sea'), 'at sea level a click sets no course');
  const held = wordsIn(laid({ ...STATE, paceNow: 5, held: true, speed: 60 }).node).join(' | ');
  assert.ok(held.includes('Pace ×5 (×200 set)') && !held.includes('watched'), held);
  const bars = nodesOf(laid(STATE).node).filter((each) => each.width === '25%');
  assert.equal(bars.length, 1, 'a quarter of the way sailed');
});

test('a narrow view lays the console’s columns under each other, inside the view', () => {
  const { node, ui } = laid(STATE, 640);
  assert.ok(typeof node.width === 'number' && node.width <= 640 - 40, `${String(node.width)}`);
  const box = ui.boxOf('sea:bar');
  assert.ok(box && box.x >= 0 && box.x + box.width <= 640);
});

/** A sea for the layer to read: at sea over the ship, unless `more` says otherwise. */
const seaWith = (more: object = {}) =>
  ({
    view: { helmView: false },
    aboard: { active: false },
    boarding: { onDeck: false },
    fight: null,
    travelling: null,
    level: 'sealevel',
    heading: 0,
    resumable: false,
    voyageNote: 'Sailing straight on',
    waterWords: null,
    sighted: null,
    passage: { sailing: true, pace: 60, paceNow: 1, way: 1.25, share: null },
    ...more,
  }) as unknown as Sea;

test('the console stands only while the ship is the player’s to sail from it', () => {
  assert.equal(consoleShown(seaWith(), 'sea'), true);
  assert.equal(consoleShown(seaWith(), 'landing'), false, 'over an island its panel stands instead');
  assert.equal(consoleShown(null, 'sea'), false);
  for (const more of [
    { view: { helmView: true } },
    { aboard: { active: true } },
    { boarding: { onDeck: true } },
    { fight: {} },
    { travelling: {} },
  ])
    assert.equal(consoleShown(seaWith(more), 'sea'), false, JSON.stringify(more));
});

test('the console’s state: its speed at the pace sailed now, its name or its class’s, the landing made for', () => {
  const landings = { making: { kind: 'isle', id: 2, words: 'the cove' } } as unknown as SeaLandings;
  const ship = () => ({ name: null, hull: 'Schooner' });
  const state = consoleOf(seaWith(), { landings, ship, kept: () => null }, null);
  assert.deepEqual([state.name, state.speed, state.pace, state.paceNow], ['The Schooner', 15, 60, 1]);
  assert.deepEqual(state.kept, { hull: 1, sail: 1, crew: 1 }, 'whole while the sea keeps no hurts');
  assert.equal(state.bound, 'the cove, to go ashore');
  assert.equal(state.water, 'The Pale Expanse');
  assert.equal(
    consoleOf(
      seaWith({ passage: { sailing: false, pace: 60, paceNow: 60, way: 1, share: null } }),
      { landings, ship, kept: () => null },
      null,
    ).speed,
    0,
  );
  assert.equal(boundWords({ kind: 'dock', port: 'Overlook', harbour: [0, 0] }), "Overlook's harbour, to dock");
  assert.equal(boundWords(null), null);
});

test('held near a hostile ship, the console shows the pace the room sails it at, as its line does', () => {
  const passage = new Passage([], () => maskFromOutlines([], OPEN), [1_000_000, 1_000_000], 0);
  const settled = { ...{ player: 1, x: 1_000_000, y: 1_000_000, heading: 0, pace: 5 }, hull: 0, dress: [], name: [] };
  passage.room = { settledShip: settled, ownShip: settled, course: () => 0, face: () => 0 } as unknown as SeaRoom;
  passage.straightOn();
  const ship = () => ({ name: null, hull: 'Sloop' });
  const landings = { making: null } as SeaLandings;
  const state = consoleOf(seaWith({ passage }), { landings, ship, kept: () => null }, null);
  assert.match(passage.note, /Held to ×5/);
  assert.deepEqual([state.pace, state.paceNow, state.held, state.speed], [60, 5, true, 60]);
});
