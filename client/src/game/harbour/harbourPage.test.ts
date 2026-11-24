import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GearShip, GearState } from '../../network/gearMessages.ts';
import { SHIP_DRESSES } from '../../ships/fleetDress.ts';
import { drawn } from '../drawnForTests.ts';
import type { HullBuild } from '../shipPanel.ts';
import { harbourPage } from './harbourPage.ts';
import { NO_WORD, SHIPYARD, calledOf, dressRows, hullOffers, namingPrice } from './harbourModel.ts';
import { hullNumbers } from './shipyardPart.ts';

const number = (id: string) => SHIP_DRESSES.findIndex((entry) => entry.id === id);

/** The start dresses every ship is built in, by their numbers in the parts' order. */
const BUILT = ['bare_timber', 'unbanded', 'plain_canvas', 'overlook_flag'].map(number);

const ship = (fields: Partial<GearShip> = {}): GearShip => ({
  xp: 0n,
  level: 8,
  prestige: 0,
  attack: 10,
  defense: 10,
  toNext: 0,
  toNextNeeds: 0,
  stocks: [200, 200, 200, 4],
  hands: 10,
  handsMost: 10,
  officers: [],
  offers: [],
  trim: [],
  pledge: 0,
  fleet: [{ hull: 0, name: [NO_WORD, NO_WORD], named: false, dress: BUILT }],
  sailed: 0,
  dresses: BUILT,
  ...fields,
});

const gear = (fields: Partial<GearState> = {}, shipFields: Partial<GearShip> = {}): GearState =>
  ({ aurem: 9_000, items: [], wares: [], ship: ship(shipFields), ...fields }) as GearState;

const build = (name: string, hull: number, fields: Partial<HullBuild> = {}): HullBuild => ({
  name,
  hull,
  sail: hull / 2,
  crew: 10,
  guns: { port: 3, starboard: 3 },
  loads: ['round'],
  lasts: 1,
  rig_lasts: 1,
  broadside: 1,
  reload_s: 5.6,
  way: 1,
  turn: 1,
  boarders: 2,
  ...fields,
});
const BUILDS = [
  build('Sloop', 240),
  build('Schooner', 300, { reload_s: 4.9, way: 1.15, turn: 1.1 }),
  build('Brig', 475, { broadside: 1.25, way: 0.95, turn: 0.85, boarders: 3 }),
  build('Frigate', 580, { broadside: 1.5, reload_s: 7, way: 0.9, turn: 0.72, boarders: 4 }),
];

test('the shipyard offers every hull: the one sailed, the Sloop given, one to buy and those sold later', () => {
  const offers = hullOffers(gear());
  assert.deepEqual(
    offers.map((offer) => [offer.name, offer.state]),
    [
      ['Sloop', 'sailing'],
      ['Schooner', 'buy'],
      ['Brig', 'locked'],
      ['Frigate', 'locked'],
    ],
  );
  assert.deepEqual(offers[1]?.ask, { kind: 81, column: 1 });
  assert.equal(offers[2]?.ask, null, 'none asked of one sold from a higher level');
  const poor = hullOffers(gear({ aurem: 100 }))[1];
  assert.equal(poor?.state, 'short');
  assert.equal(poor?.short.aurem, true);
  const fleet = [
    { hull: 0, name: [NO_WORD, NO_WORD], named: false, dress: BUILT },
    { hull: 1, name: [0, 0], named: true, dress: BUILT },
  ];
  const kept = hullOffers(gear({}, { fleet, sailed: 1 }));
  assert.deepEqual([kept[0]?.state, kept[0]?.ask], ['kept', { kind: 82, column: 0 }], 'one kept is sailed again');
  assert.equal(kept[1]?.called, `the ${SHIPYARD.first[0]} ${SHIPYARD.second[0]}`);
  const shipless = hullOffers(gear({}, { fleet: [] }));
  assert.deepEqual(
    shipless.map((offer) => offer.state),
    ['given', 'shipless', 'shipless', 'shipless'],
    'before the welcome hands over the Sloop',
  );
  const pledged = hullOffers(gear({}, { fleet: [], pledge: 2 }));
  assert.deepEqual(
    [pledged[0]?.state, pledged[0]?.ask],
    ['take', { kind: 81, column: 0 }],
    'pledged before the welcome',
  );
  const taking = drawn(gear({}, { fleet: [], pledge: 2 }), (context) =>
    harbourPage(context, BUILDS, ['shipyard', null], () => undefined),
  );
  taking.click('hull-0');
  assert.deepEqual(taking.asked, [{ kind: 81, column: 0 }], 'taken with a click: it costs nothing');
});

test("a hull's numbers stand against the most any hull has, a reload against the quickest", () => {
  const frigate = new Map(hullNumbers(BUILDS[3] as HullBuild, BUILDS).map((row) => [row.said, row]));
  assert.equal(frigate.get('Hull')?.share, 1);
  assert.equal(frigate.get('Hull')?.value, '580');
  assert.equal(frigate.get('Broadside')?.value, '×1.50');
  assert.ok(Math.abs((frigate.get('Reload')?.share ?? 0) - 4.9 / 7) < 1e-9);
  assert.ok(Math.abs((frigate.get('Speed')?.share ?? 0) - 0.9 / 1.15) < 1e-9);
  assert.equal(frigate.get('Boarders')?.value, '4');
});

test('the shipyard is held to buy, a ship kept is clicked to sail, and nothing else is asked', () => {
  const page = drawn(gear(), (context) => harbourPage(context, BUILDS, ['shipyard', null], () => undefined));
  assert.match(page.shows(), /SLOOP \| SAILING .*The ship you sail/);
  assert.match(page.shows(), /Sold from ship level 13/);
  page.click('hull-1');
  assert.deepEqual(page.asked, [], 'a click buys nothing');
  page.hold('hull-1', 900);
  assert.deepEqual(page.asked, [{ kind: 81, column: 1 }]);
  const fleet = [
    { hull: 0, name: [NO_WORD, NO_WORD], named: false, dress: BUILT },
    { hull: 1, name: [NO_WORD, NO_WORD], named: false, dress: BUILT },
  ];
  const sailing = drawn(gear({}, { fleet, sailed: 1 }), (context) =>
    harbourPage(context, BUILDS, ['shipyard', null], () => undefined),
  );
  sailing.click('hull-0');
  assert.deepEqual(sailing.asked, [{ kind: 82, column: 0 }]);
});

test('a dress kept is clicked to lay it, one sold is held to buy, and the worn one is marked', () => {
  const rows = dressRows(gear({}, { dresses: [...BUILT, number('harbour_blue')] }), 0);
  assert.deepEqual(
    rows.map((row) => row.part),
    ['paint', 'stripe', 'canvas', 'flag'],
  );
  const paint = new Map(rows[0]?.tiles.map((tile) => [tile.entry.id, tile]));
  assert.equal(paint.get('bare_timber')?.state, 'worn');
  assert.deepEqual(paint.get('harbour_blue')?.ask, { kind: 84, column: 0, item: number('harbour_blue') });
  assert.deepEqual(paint.get('tar_black')?.ask, { kind: 83, item: number('tar_black') });
  assert.equal(paint.get('bone')?.state, 'buy', 'from ship level 5');
  assert.equal(paint.get('lacquer_crimson')?.state, 'locked', 'from ship level 20');
  const flags = new Map(rows[3]?.tiles.map((tile) => [tile.entry.id, tile]));
  assert.equal(flags.get('storm_flag')?.state, 'faction');
  assert.deepEqual(dressRows(gear(), 3), [], 'a ship not kept has no dress to lay');
  const page = drawn(gear({}, { dresses: [...BUILT, number('harbour_blue')] }), (context) =>
    harbourPage(context, BUILDS, ['paint', null], () => undefined),
  );
  page.click(`dress-${number('harbour_blue')}`);
  assert.deepEqual(page.asked, [{ kind: 84, column: 0, item: number('harbour_blue') }]);
  page.click(`dress-${number('tar_black')}`);
  assert.equal(page.asked.length, 1, 'one not kept is never laid with a click');
  page.hold(`dress-${number('tar_black')}`, 900);
  assert.deepEqual(page.asked.at(-1), { kind: 83, item: number('tar_black') });
  assert.match(page.shows(), /HULL PAINT .*STRIPE .*CANVAS .*FLAG/);
});

test('a ship is named free the first time and for the yard’s price after, from words chosen on the page', () => {
  assert.equal(namingPrice({ named: false }), 0);
  assert.equal(namingPrice({ named: true }), SHIPYARD.renaming);
  assert.equal(calledOf({ name: [NO_WORD, 0] }), `the ${SHIPYARD.second[0]}`);
  assert.equal(calledOf({ name: [NO_WORD, NO_WORD] }), null);
  const page = drawn(gear(), (context) => harbourPage(context, BUILDS, ['name', null], () => undefined));
  page.click('first-1');
  page.click('second-2');
  page.click('name-ship');
  assert.deepEqual(page.asked, [{ kind: 85, column: 0, node: 1, slot: 2, count: 0 }], 'the first, free name');
  const named = [{ hull: 0, name: [1, 2], named: true, dress: BUILT }];
  const renaming = drawn(gear({}, { fleet: named }), (context) =>
    harbourPage(context, BUILDS, ['name', null], () => undefined),
  );
  renaming.click('second-3');
  renaming.click('name-ship');
  assert.deepEqual(renaming.asked, [], 'a new name is held for, not clicked');
  renaming.hold('name-ship', 900);
  assert.deepEqual(renaming.asked, [{ kind: 85, column: 0, node: 1, slot: 3, count: 1 }], 'a renaming, paid');
});

test('with no ship kept yet the counter says so, and the shipyard offers the Sloop as given', () => {
  const shipless = gear({}, { fleet: [] });
  const paint = drawn(shipless, (context) => harbourPage(context, BUILDS, ['paint', null], () => undefined));
  assert.match(paint.shows(), /Keep a ship first/);
  const yard = drawn(shipless, (context) => harbourPage(context, BUILDS, ['shipyard', null], () => undefined));
  assert.match(yard.shows(), /hands it over in the welcome/);
  assert.match(yard.shows(), /Take your first ship from the Harbourmaster/);
});
