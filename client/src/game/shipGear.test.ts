import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ASKS, type GearItem, type GearOfficer, type GearShip, type GearState } from '../network/gearMessages.ts';
import {
  NO_OFFERS,
  carriedModules,
  fittedOf,
  gearKindName,
  gearName,
  modulePresses,
  moduleNode,
  musterOf,
  officerColumns,
  officerShown,
  answerSaid,
  shipPowerOf,
} from './shipGear.ts';

const item = (fields: Partial<GearItem>): GearItem => ({
  id: 1,
  kind: 24,
  rarity: 1,
  level: 1,
  named: null,
  name: 0,
  resource: null,
  breach: false,
  xp: 0,
  xpMost: 0,
  bought: 0,
  chosen: [],
  bucket: 7,
  at: 0,
  attack: 0,
  defense: 0,
  prestige: 0,
  columns: [],
  price: 0,
  element: 0,
  ...fields,
});

const officer = (fields: Partial<GearOfficer>): GearOfficer => ({
  id: 4,
  post: 1,
  grade: 2,
  given: 0,
  family: 1,
  duty: 0,
  level: 3,
  toNext: 0.4,
  trained: 500,
  trainedMost: 2_000,
  strength: 0.5,
  bought: 0,
  chosen: [255],
  columns: [
    { kind: 3, traits: ['quick_tackle', 'steady_lay'], xp: 400, aurem: 900, fragments: 0, essence: 2, resource: 0 },
  ],
  wage: 0,
  ...fields,
});

const ship = (fields: Partial<GearShip>): GearShip => ({
  xp: 0n,
  level: 4,
  prestige: 6,
  attack: 50,
  defense: 120,
  toNext: 0.3,
  toNextNeeds: 900,
  stocks: [10, 20, 30, 4],
  hands: 18,
  handsMost: 24,
  officers: [],
  offers: [],
  trim: [],
  pledge: 0,
  ...fields,
});

const state = (fields: Partial<GearState>): GearState => ({
  xp: 0n,
  level: 1,
  prestige: 0,
  defense: 0,
  aurem: 0,
  stocks: [0, 0, 0, 0, 0],
  resources: [],
  items: [],
  vestiges: [],
  drops: [],
  spent: [],
  atReader: false,
  answer: 0,
  answered: 0,
  nodes: [],
  wares: [],
  identified: 0,
  ...fields,
});

test('modules are named by their kind and rarity, and the new refusals are said in plain words', () => {
  assert.equal(gearName(item({ kind: 24, rarity: 0 })), 'Guns');
  assert.equal(gearName(item({ kind: 26, rarity: 1, name: 2 })), 'Tanned Sails');
  assert.equal(gearName(item({ kind: 24, rarity: 3, named: 'the_long_nines' })), 'The Long Nines');
  assert.equal(gearKindName(27), 'Rigging');
  assert.equal(gearKindName(2), 'Sword');
  assert.equal(answerSaid(132), 'Officers sign on through the faction you are pledged to.');
  assert.equal(answerSaid(134), 'Two officers are ashore already.');
  assert.equal(answerSaid(15), 'You do not have enough for it.');
});

test('her power shows as a level and a share to the next, never as XP', () => {
  const power = shipPowerOf(ship({ toNext: 1.4 }));
  assert.deepEqual([power.level, power.toNext, power.attack, power.defense, power.prestige], [4, 1, 50, 120, 6]);
  assert.doesNotMatch(power.toNextWords, /\d{3}|XP/);
  assert.equal(shipPowerOf(ship({ level: 30 })).toNextWords, 'Her highest level');
});

test('the four slots show what is fitted, and only carried modules are offered to fit', () => {
  const guns = item({ id: 2, at: 2 + 7 });
  const spare = item({ id: 3, at: 0 });
  const sword = item({ id: 4, kind: 2, bucket: 0, at: 0 });
  const gear = state({ items: [guns, spare, sword] });
  assert.deepEqual(
    fittedOf(gear).map((slot) => [slot.name, slot.item?.id ?? null]),
    [
      ['Guns', 2],
      ['Hull', null],
      ['Sails', null],
      ['Rigging', null],
    ],
  );
  assert.deepEqual(
    carriedModules(gear).map((each) => each.id),
    [3],
  );
});

test("a module's node is priced in her materials: first, second, and Heartwood for Essence", () => {
  const column = { kind: 0, traits: [], xp: 0, aurem: 300, fragments: 5, essence: 1, resource: 3 };
  const rigging = item({ kind: 27, columns: [column] });
  assert.equal(moduleNode(rigging, 0, 0)?.cost, 'Costs 300 Aurem, 5 Canvas, 3 Iron, 1 Heartwood.');
  assert.deepEqual(moduleNode(rigging, 0, 0)?.ask, { kind: ASKS.buy, item: 1, column: 0, node: 0 });
  assert.equal(
    moduleNode(item({ kind: 24, columns: [column] }), 0, 0)?.cost,
    'Costs 300 Aurem, 5 Iron, 3 Timber, 1 Heartwood.',
  );
});

test('a carried module fits in its own slot, is dismantled, and takes in a higher one of its kind at its price', () => {
  const kept = item({ id: 1, kind: 25, level: 2, at: 0 });
  const higher = item({ id: 5, kind: 25, level: 5, at: 0 });
  const lower = item({ id: 6, kind: 25, level: 1, at: 0 });
  const other = item({ id: 7, kind: 26, level: 9, at: 0 });
  const presses = modulePresses(kept, state({ items: [kept, higher, lower, other] }));
  assert.deepEqual(
    presses.map((press) => press.ask),
    [
      { kind: ASKS.wear, item: 1, slot: 8 },
      { kind: ASKS.dismantle, item: 1 },
      { kind: ASKS.infuse, item: 1, count: 5 },
    ],
  );
  assert.match(presses[2]?.label ?? '', /450 Aurem, 6 Timber/);
  const fitted = modulePresses(item({ id: 1, kind: 25, at: 2 + 8 }), state({}));
  assert.deepEqual(
    fitted.map((press) => press.ask),
    [{ kind: ASKS.takeOff, slot: 8 }],
  );
});

test('an officer shows by name, post and grade, with their duties as station asks', () => {
  const shown = officerShown(officer({ duty: 2 }));
  assert.deepEqual(
    [shown.name, shown.post, shown.grade, shown.level, shown.duty],
    ['Ada Brine', 'Gunner', 'Seasoned', 3, 'Ashore'],
  );
  assert.deepEqual(
    shown.duties.map((duty) => [duty.label, duty.ask.slot, duty.chosen]),
    [
      ['At post', 1, false],
      ['Ashore', 2, true],
      ['Aboard', 0, false],
    ],
  );
  assert.ok(shown.duties.every((duty) => duty.ask.kind === ASKS.station && duty.ask.item === 4));
  assert.deepEqual(shown.dismiss, { kind: ASKS.dismiss, item: 4 });
});

test("an officer's nodes train and are chosen by the crew's asks, priced in Aurem and Heartwood", () => {
  const [column] = officerColumns(officer({}));
  assert.deepEqual(column?.nodes[0]?.ask, { kind: ASKS.train, item: 4, column: 0, node: 0 });
  assert.equal(column?.nodes[0]?.cost, 'Costs 900 Aurem, 2 Heartwood.');
  const [bought] = officerColumns(officer({ bought: 0b11, chosen: [0] }));
  assert.deepEqual(bought?.nodes[1]?.ask, { kind: ASKS.chooseOfficer, item: 4, column: 0, node: 1 });
  const [locked] = officerColumns(officer({ trained: 0 }));
  assert.equal(locked?.nodes[0]?.ask, null);
  assert.equal(locked?.nodes[0]?.cost, 'Its ring fills as they serve.');
});

test('the muster offers the officers of the day for their wage, or says why there are none', () => {
  const offered = musterOf(
    state({ aurem: 2_000, ship: ship({ offers: [officer({ id: 0, wage: 1_500 }), officer({ id: 1, wage: 4_000 })] }) }),
    3,
  );
  assert.deepEqual(
    offered.map((offer) => [offer.ask, offer.affordable]),
    [
      [{ kind: ASKS.recruit, column: 3, node: 0 }, true],
      [{ kind: ASKS.recruit, column: 3, node: 1 }, false],
    ],
  );
  assert.deepEqual(musterOf(state({ ship: ship({}) }), 3), []);
  assert.match(NO_OFFERS, /pledged/);
});
