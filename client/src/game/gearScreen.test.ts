import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ASKS, type GearItem, type GearState } from '../network/gearMessages.ts';
import { readFile } from 'node:fs/promises';
import { STOCK, WARES, characterOf, itemDetailOf, vendorsOf } from './gearScreen.ts';

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
  element: 0,
  source: 0,
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
  atMage: false,
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
    ['From', 'The world'],
  ]);
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
  const module = itemDetailOf({ ...legendary, kind: 25, bucket: 8, source: 4 }, state({}));
  assert.ok(!module.numbers.some(([label]) => label === 'From'), 'a ship’s module keeps no look of a content');
  const carried = itemDetailOf({ ...legendary, at: 0 }, state({ atMage: true }));
  assert.deepEqual(
    carried.presses.map((press) => press.label),
    ['Equip', 'Hold to dismantle'],
  );
  assert.equal(carried.presses.at(-1)?.role, 'warn');
  // At the vault's counter, it may be put in; a vaulted one, taken out.
  const atVault = itemDetailOf({ ...legendary, at: 0 }, state({ atMage: true }), true);
  assert.ok(atVault.presses.some((press) => press.label === 'Put in the vault'));
  const vaulted = itemDetailOf({ ...legendary, at: 1 }, state({ atMage: true }), true);
  assert.deepEqual(vaulted.presses[0]?.ask, { kind: ASKS.withdraw, item: legendary.id });
});

test('each vendor’s stall shows its six wares of the day and its starter stock, bought for their price in Aurem, the Shipwright’s last', () => {
  const six = (first: Partial<GearItem>, second: Partial<GearItem>) => [
    item({ id: 40, level: 9, price: 2_000, ...first }),
    item({ id: 40, level: 9, price: 600, ...second }),
    ...[2, 3, 4, 5].map(() => item({ id: 40, ...first })),
  ];
  const plain = (kinds: number[]) => kinds.map((kind, place) => item({ id: 6 + place, kind, rarity: 0, price: 50 }));
  const wares = [
    ...six({ kind: 13, rarity: 2 }, { kind: 14, rarity: 1 }),
    ...plain([13, 14, 15, 16]),
    ...six({ kind: 2, rarity: 2, attack: 120 }, { kind: 12, rarity: 1 }),
    ...plain([12, 8]),
    ...six({ kind: 25, rarity: 1, bucket: 8, defense: 40 }, { kind: 24, rarity: 0, bucket: 7 }),
  ];
  const [armorsmith, weaponsmith, shipwright] = vendorsOf(state({ wares, aurem: 1_000, day: 20_400 }));
  assert.equal(armorsmith?.name, 'The Armorsmith');
  assert.deepEqual(
    armorsmith?.wares.slice(0, 2).map((ware) => [ware.kind, ware.affordable]),
    [
      ['Rare Head', false],
      ['Magic Torso', true],
    ],
  );
  assert.equal(armorsmith?.wares.length, 10, 'the day’s six, then four to start');
  assert.deepEqual(
    armorsmith?.wares.slice(6).map((ware) => [ware.starter, ware.price, ware.press.ask.node]),
    [6, 7, 8, 9].map((node) => [true, 50, node]),
  );
  assert.equal(weaponsmith?.wares.length, 8);
  // Asked by its place, not the number it takes once bought, and by the day it was shown, so the room refuses it once
  // the day has turned.
  assert.deepEqual(weaponsmith?.wares[0]?.press.ask, { kind: ASKS.vend, column: 1, node: 0, item: 20_400 });
  assert.equal(weaponsmith?.wares[0]?.press.label, 'Hold to buy · 2,000');
  assert.equal(shipwright?.name, 'The Shipwright');
  assert.deepEqual(
    shipwright?.wares.slice(0, 2).map((ware) => [ware.tile.name, ware.kind, ware.press.ask]),
    [
      ['Tarred Hull', 'Magic Hull', { kind: ASKS.vend, column: 2, node: 0, item: 20_400 }],
      ['Guns', 'Normal Guns', { kind: ASKS.vend, column: 2, node: 1, item: 20_400 }],
    ],
  );
});

test("a module's page fits it in its own slot, never feeds it, and prices its nodes in the ship's materials", () => {
  const column = { kind: 0, traits: [], xp: 0, aurem: 200, fragments: 4, essence: 0, resource: 2 };
  const sails = item({ id: 9, kind: 26, rarity: 1, bucket: 9, at: 0, xpMost: 100, columns: [column] });
  const detail = itemDetailOf(sails, state({ stocks: [0, 0, 0, 0, 3] }));
  assert.equal(detail.kind, 'Magic Sails');
  assert.deepEqual(
    detail.presses.map((press) => press.ask),
    [
      { kind: ASKS.wear, item: 9, slot: 9 },
      { kind: ASKS.dismantle, item: 9 },
    ],
    'no Fruit of Dagon for a module',
  );
  assert.equal(detail.columns[0]?.nodes[0]?.cost, 'Costs 200 Aurem, 4 Canvas, 2 Timber.');
});

test("each vendor's stock is the rules' own: the day's wares, then its starter pieces", async () => {
  const vendor = await readFile(new URL('../../../crates/gear/src/vendor.rs', import.meta.url), 'utf8');
  const starter = vendor.slice(vendor.indexOf('fn starter_kinds'));
  const pieces = ['Armorsmith', 'Weaponsmith', 'Shipwright'].map(
    (name) =>
      (new RegExp(`Vendor::${name} => &\\[([^\\]]*)\\]`).exec(starter)?.[1] ?? '').match(/Kind::/g)?.length ?? 0,
  );
  assert.deepEqual(
    STOCK,
    pieces.map((count) => WARES + count),
  );
  assert.equal(Number(/pub const WARES: usize = (\d+);/.exec(vendor)?.[1]), WARES);
});
