import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ASKS, type GearItem, type GearState } from '../network/gearMessages.ts';
import { characterOf, itemDetailOf, vendorsOf } from './gearScreen.ts';

const item = (fields: Partial<GearItem>): GearItem => ({
  id: 1,
  kind: 2,
  rarity: 0,
  level: 1,
  named: null,
  name: 0,
  resource: null,
  breach: false,
  xp: 0,
  xpMost: 0,
  bought: 0,
  chosen: [],
  bucket: 0,
  at: 0,
  attack: 0,
  defense: 0,
  prestige: 0,
  columns: [],
  price: 0,
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
  social: false,
  answer: 0,
  answered: 0,
  nodes: [],
  wares: [],
  identified: 0,
  ...fields,
});

/** A Legendary sword with an upgrade column (bought) and a perk column of two, its second chosen-to-be. */
const legendary = item({
  id: 7,
  kind: 2,
  rarity: 3,
  level: 20,
  named: 'harbourwarden',
  at: 2,
  attack: 248,
  xp: 1_500,
  xpMost: 30_000,
  bought: 0b001,
  chosen: [255, 255],
  columns: [
    { kind: 0, traits: [], xp: 1_000, aurem: 0, fragments: 0, essence: 0, resource: 0 },
    { kind: 3, traits: ['light_grip', 'weighted'], xp: 1_500, aurem: 800, fragments: 2, essence: 0, resource: 5 },
  ],
});

test('the level meter is the room’s word: XP to the next below 20, Prestige past it, and the last full', () => {
  const low = characterOf(state({ level: 5, toNext: 0.5, toNextNeeds: 2_500 }));
  assert.equal(low.toNext, 0.5);
  assert.equal(low.toNextWords, '2,500 XP to level 6');
  assert.equal(low.fruitGrown, null);
  const high = characterOf(state({ level: 21, prestige: 22, toNext: 22 / 32, toNextNeeds: 10, fruitGrowing: 0 }));
  assert.equal(high.toNextWords, '10 more Prestige for level 22');
  assert.equal(high.fruitGrown, 0, 'the next Fruit just begun');
  const last = characterOf(state({ level: 30, prestige: 120 }));
  assert.deepEqual([last.toNext, last.toNextWords], [1, 'The highest level']);
});

test('an item’s detail lays out its nodes: bought, to buy once unlocked, and what it may do where it is', () => {
  const detail = itemDetailOf(legendary, state({ items: [legendary], stocks: [0, 0, 0, 0, 2] }));
  assert.equal(detail.kind, 'Legendary Sword');
  assert.deepEqual(detail.numbers, [
    ['Attack', '248'],
    ['Level', '20'],
  ]);
  assert.equal(detail.xp, 0.05);
  const [upgrade, perk] = detail.columns;
  assert.equal(upgrade?.nodes[0]?.chosen, true);
  assert.equal(upgrade?.nodes[0]?.ask, null, 'an upgrade bought asks nothing');
  assert.deepEqual(perk?.nodes[1]?.ask, { kind: ASKS.buy, item: 7, column: 1, node: 1 });
  assert.equal(perk?.nodes[1]?.cost, 'Costs 800 Aurem, 2 fragments.');
  assert.deepEqual(
    detail.presses.map((press) => [press.label, press.role]),
    [
      ['Take off', 'button'],
      ['Hold to feed a Fruit of Dagon', 'button'],
    ],
  );
  const carried = itemDetailOf({ ...legendary, at: 0 }, state({ social: true }));
  assert.deepEqual(
    carried.presses.map((press) => press.label),
    ['Wear', 'Off hand', 'Put in the vault', 'Hold to dismantle'],
  );
  assert.equal(carried.presses.at(-1)?.role, 'warn');
});

test('the Vendors tab shows each vendor’s wares of the day, bought for their price in Aurem', () => {
  const wares = [
    item({ id: 0, kind: 13, rarity: 2, level: 9, price: 2_000 }),
    item({ id: 1, kind: 14, rarity: 1, level: 9, price: 600 }),
    item({ id: 0, kind: 2, rarity: 2, level: 9, price: 2_000, attack: 120 }),
    item({ id: 1, kind: 12, rarity: 1, level: 9, price: 600 }),
  ];
  const [quartermaster, armsmith] = vendorsOf(state({ wares, aurem: 1_000 }));
  assert.equal(quartermaster?.name, 'The Quartermaster');
  assert.deepEqual(
    quartermaster?.wares.map((ware) => [ware.kind, ware.affordable]),
    [
      ['Rare Head', false],
      ['Magic Torso', true],
    ],
  );
  assert.deepEqual(armsmith?.wares[0]?.press.ask, { kind: ASKS.vend, column: 1, node: 0 });
  assert.equal(armsmith?.wares[0]?.press.label, 'Hold to buy · 2,000');
});
