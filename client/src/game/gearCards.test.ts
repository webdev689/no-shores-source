import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ASKS, type GearItem, type GearState } from '../network/gearMessages.ts';
import { cardOf, chosenTraits, flyoutOf, inventoryPageOf, vaultOf, wearIn } from './gearCards.ts';

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
  identified: 0,
  nodes: [],
  wares: [],
  ...fields,
});

const perk = { kind: 3, traits: ['light_grip', 'weighted'], xp: 1, aurem: 0, fragments: 0, essence: 0, resource: 0 };

test('a card names the item and its kind, its main number, its chosen traits, and what it changes over the worn', () => {
  const worn = item({ id: 7, named: 'harbourwarden', rarity: 3, at: 2, attack: 248, level: 20 });
  const carried = item({ id: 8, rarity: 2, attack: 260, level: 20, columns: [perk], chosen: [1], xpMost: 9_000 });
  assert.deepEqual(chosenTraits(carried), ['weighted']);
  const card = cardOf(carried, worn);
  assert.equal(card.kind, 'Rare Sword');
  assert.deepEqual(card.big, { label: 'Attack', value: 260 });
  assert.deepEqual(card.rows, [['Level', '20']], 'its growth is the icon’s gauge, not a count of XP');
  assert.equal(card.traits.length, 1, 'its chosen trait');
  assert.deepEqual(card.compare, { replaces: 'Harbourwarden', rows: [{ label: 'Attack', from: 248, to: 260 }] });
  assert.equal(cardOf(worn, worn).compare, null, 'no comparing a piece with itself');
});

test('a slot’s flyout holds its nine places, and a carried blade is worn in the slot it is shown under', () => {
  const blade = item({ id: 3, kind: 1, at: 0, bucket: 1 });
  const gear = state({ items: [item({ id: 1, at: 3, kind: 12 }), blade, item({ id: 4, at: 0, bucket: 0 })] });
  const off = flyoutOf(gear, 1);
  assert.equal(off.worn?.id, 1);
  assert.equal(off.cells.length, 9);
  assert.deepEqual(
    off.cells.map((each) => each?.id ?? null),
    [3, null, null, null, null, null, null, null, null],
  );
  assert.deepEqual(wearIn(blade, 1)?.ask, { kind: ASKS.wear, item: 3, slot: 1 });
});

test('the inventory shows its currencies, and Vestiges open only in a social space; it has no vault', () => {
  const vestige = { id: 9, rarity: 3, slot: 3, level: 20, vaulted: false };
  const away = inventoryPageOf(state({ aurem: 900, stocks: [4, 5, 6, 7, 2], vestiges: [vestige] }));
  assert.deepEqual(
    away.currencies.map((each) => [each.name, each.count]),
    [
      ['Aurem', 900],
      ['Weapon Fragments', 4],
      ['Armor Fragments', 5],
      ['Weapon Essence', 6],
      ['Armor Essence', 7],
    ],
  );
  const tab = (page: typeof away, id: string) => page.tabs.find((each) => each.id === id)?.cells ?? [];
  assert.equal(tab(away, 'consumables')[0]?.count, 2, 'the Fruit of Dagon');
  assert.equal(tab(away, 'materials').length, 9, 'every island’s resource');
  const vestiges = tab(away, 'vestiges');
  assert.equal(vestiges.length, 10, 'ten places');
  assert.equal(vestiges[0]?.press, null, 'not identified away from a social space');
  assert.deepEqual(
    away.tabs.map((each) => each.id),
    ['consumables', 'materials', 'vestiges'],
  );
  const social = inventoryPageOf(state({ atReader: true, vestiges: [vestige, { ...vestige, id: 8, vaulted: true }] }));
  assert.deepEqual(tab(social, 'vestiges')[0]?.press?.ask, { kind: ASKS.identify, item: 9 });
  assert.equal(tab(social, 'vestiges')[1]?.glyph, 'empty', 'a vaulted Vestige is not carried');
});

test('the vault keeps weapons, armour and Vestiges, twenty of each, a click from what is carried', () => {
  const vault = vaultOf(
    state({
      atReader: true,
      items: [item({ id: 5, at: 1 }), item({ id: 6, at: 1, kind: 14 }), item({ id: 7, at: 0 }), item({ id: 8, at: 2 })],
      vestiges: [{ id: 9, rarity: 3, slot: 3, level: 20, vaulted: true }],
    }),
  );
  assert.deepEqual(
    vault.kept.map((shelf) => [shelf.name, shelf.held, shelf.most]),
    [
      ['Weapons', 1, 20],
      ['Armour', 1, 20],
      ['Vestiges', 1, 20],
    ],
  );
  assert.deepEqual(vault.kept[0]?.cells[0]?.press?.ask, { kind: ASKS.withdraw, item: 5 });
  assert.deepEqual(vault.kept[2]?.cells[0]?.press?.ask, { kind: ASKS.withdrawVestige, item: 9 });
  // What is carried goes in with a click; what is worn is not offered.
  assert.deepEqual(
    vault.carried[0]?.cells.map((each) => each.press?.ask),
    [{ kind: ASKS.store, item: 7 }],
  );
  assert.equal(vault.carried[1]?.held, 0);
});
