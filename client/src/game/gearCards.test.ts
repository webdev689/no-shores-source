import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ASKS, type GearItem, type GearState } from '../network/gearMessages.ts';
import { cardOf, flyoutOf, inventoryPageOf, vaultOf, wearIn } from './gearCards.ts';

const item = (fields: Partial<GearItem>): GearItem => ({
  id: 1,
  kind: 2,
  rarity: 0,
  level: 1,
  named: null,
  name: 0,
  resource: null,
  breach: false,
  hard: false,
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
  identified: 0,
  nodes: [],
  wares: [],
  ...fields,
});

const perk = { kind: 3, traits: ['light_grip', 'weighted'], xp: 1, aurem: 0, fragments: 0, essence: 0, resource: 0 };

test('a card names the item and its kind, its main number, its chosen traits, and what it changes over the worn', () => {
  const worn = item({ id: 7, named: 'harbourwarden', rarity: 3, at: 2, attack: 248, level: 20 });
  const carried = item({ id: 8, rarity: 2, attack: 260, level: 20, columns: [perk], chosen: [1], xpMost: 9_000 });
  const card = cardOf(carried, worn);
  assert.equal(card.kind, 'Rare Sword');
  assert.deepEqual(card.big, { label: 'Attack', value: 260 });
  assert.deepEqual(
    card.rows,
    [
      ['Level', '20'],
      ['From', 'The world'],
    ],
    'its growth is the icon’s gauge, not XP',
  );
  const abyss = cardOf(item({ id: 9, rarity: 2, level: 20, source: 4 }));
  assert.deepEqual(abyss.rows.at(-1), ['From', 'An Abyss Dungeon'], 'where it was earned, which its look says');
  const faction = cardOf(item({ id: 10, rarity: 3, level: 20, named: 'veiled_cape', source: 1 }));
  assert.deepEqual(faction.rows.at(-1), ['From', 'The Veiled'], 'a faction’s piece names its faction');
  const helm = cardOf(item({ id: 11, kind: 13, rarity: 3, level: 20, named: 'stormcallers_helm', source: 1 }));
  assert.deepEqual(helm.rows.at(-1), ['From', 'The Stormcallers'], 'its faction named whole, with its article');
  const module = cardOf(item({ id: 12, kind: 25, rarity: 2, level: 20, bucket: 8, source: 4 }));
  assert.ok(!module.rows.some(([label]) => label === 'From'), 'a ship’s module keeps no look of a content');
  assert.equal(card.traits.length, 1, 'its chosen trait');
  assert.deepEqual(card.compare, { replaces: 'Harbourwarden', rows: [{ label: 'Attack', from: 248, to: 260 }] });
  assert.equal(cardOf(worn, worn).compare, null, 'no comparing a piece with itself');
});

test('a slot’s flyout holds its nine places, and a carried loadout is worn in the slot it is shown under', () => {
  const brace = item({ id: 3, kind: 23, at: 0, bucket: 1 });
  const gear = state({ items: [item({ id: 1, at: 3, kind: 8 }), brace, item({ id: 4, at: 0, bucket: 0 })] });
  const ranged = flyoutOf(gear, 1);
  assert.equal(ranged.worn?.id, 1);
  assert.equal(ranged.cells.length, 9);
  assert.deepEqual(
    ranged.cells.map((each) => each?.id ?? null),
    [3, null, null, null, null, null, null, null, null],
  );
  assert.deepEqual(wearIn(brace)?.ask, { kind: ASKS.wear, item: 3, slot: 1 }, 'a double pistolet, Ranged');
  assert.equal(cardOf(brace).kind, 'Normal Double Pistolet');
  assert.equal(cardOf(item({ kind: 12 })).kind, 'Normal Sword & Shield');
});

test('the inventory: Aurem its one currency, stacks shown only while held, and Vestiges open only in a social space', () => {
  const vestige = { id: 9, rarity: 3, slot: 3, level: 20, vaulted: false, source: 0 };
  const resources = [0, 3, 0, 0, 0, 0, 0, 0, 0];
  const away = inventoryPageOf(state({ aurem: 900, stocks: [4, 0, 6, 7, 2], resources, vestiges: [vestige] }));
  assert.deepEqual(
    away.currencies.map((each) => [each.name, each.count]),
    [['Aurem', 900]],
  );
  const tab = (page: typeof away, id: string) => page.tabs.find((each) => each.id === id)?.cells ?? [];
  assert.equal(tab(away, 'consumables')[0]?.count, 2, 'the Fruit of Dagon');
  assert.deepEqual(
    tab(away, 'materials').map((each) => [each.glyph, each.count]),
    [
      ['weapon-fragments', 4],
      ['weapon-essence', 6],
      ['armor-essence', 7],
      ['resource', 3],
    ],
    'the stocks then the resources, as stacks; none of what is not held',
  );
  const none = inventoryPageOf(state({ stocks: [0, 0, 0, 0, 0] }));
  assert.deepEqual([tab(none, 'consumables'), tab(none, 'materials')], [[], []], 'nothing held, nothing shown');
  const vestiges = away.vestiges;
  assert.equal(vestiges.cells.length, 10, 'ten places');
  assert.deepEqual([vestiges.held, vestiges.most], [1, 10]);
  assert.equal(vestiges.cells[0]?.press, null, 'not identified away from a social space');
  assert.match(vestiges.cells[0]?.words ?? '', /^For the .+, level 20, from the world\. /, 'where it was earned');
  const abyssVestige = inventoryPageOf(state({ vestiges: [{ ...vestige, source: 4 }] })).vestiges.cells[0];
  assert.match(abyssVestige?.words ?? '', /, from an Abyss Dungeon\./);
  assert.deepEqual(
    away.tabs.map((each) => each.id),
    ['consumables', 'materials'],
    'the Vestiges stand above the shelves, not on one',
  );
  const social = inventoryPageOf(
    state({ atMage: true, vestiges: [vestige, { ...vestige, id: 8, vaulted: true, source: 0 }] }),
  );
  assert.deepEqual(social.vestiges.cells[0]?.press?.ask, { kind: ASKS.identify, item: 9 });
  assert.equal(social.vestiges.cells[1]?.glyph, 'empty', 'a vaulted Vestige is not carried');
  assert.equal(social.vestiges.held, 1);
});

test('the Ammo crate stands on the Consumables shelf with its count, held to fill the ammunition when it can', () => {
  const crateOf = (fields: Partial<GearState>) =>
    inventoryPageOf(state(fields))
      .tabs.find((each) => each.id === 'consumables')
      ?.cells.find((each) => each.glyph === 'ammo-crate');
  const crate = crateOf({ crates: 3, ammoShare: 0.5 });
  assert.deepEqual([crate?.name, crate?.glyph, crate?.count], ['Ammo crate', 'ammo-crate', 3]);
  assert.deepEqual(crate?.press, {
    label: 'Hold to fill your ammo',
    ask: { kind: ASKS.useCrate },
    role: 'button',
    held: true,
    burst: 'pulse',
  });
  assert.equal(crateOf({ crates: 3, ammoShare: 1 })?.press, null, 'full, nothing to fill');
  assert.equal(crateOf({ crates: 0, ammoShare: 0 }), undefined, 'none held, not shown');
});

test('the vault keeps weapons, armour and Vestiges, twenty of each, a click from what is carried', () => {
  const vault = vaultOf(
    state({
      atMage: true,
      items: [
        item({ id: 5, at: 1 }),
        item({ id: 6, at: 1, kind: 14 }),
        item({ id: 7, at: 0 }),
        item({ id: 8, at: 2 }),
        // A module carried stands on the ship's tab; one already vaulted shows, to be taken out.
        item({ id: 10, at: 0, kind: 25, bucket: 8 }),
        item({ id: 11, at: 2 + 7, kind: 24, bucket: 7 }),
        item({ id: 12, at: 1, kind: 27, bucket: 10 }),
      ],
      vestiges: [{ id: 9, rarity: 3, slot: 3, level: 20, vaulted: true, source: 0 }],
    }),
  );
  assert.deepEqual(
    vault.kept.map((shelf) => [shelf.name, shelf.held, shelf.most]),
    [
      ['Weapons', 1, 20],
      ['Armour', 2, 20],
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
  // What is carried has no cap of its own but the Vestiges' ten: each slot's flyout caps the rest.
  assert.deepEqual(
    vault.carried.map((shelf) => shelf.most),
    [0, 0, 10],
  );
});

test("a vault over its limit (a leaver's chest Vestige kept past it) shows every Vestige and how far over it is", () => {
  const vestiges = Array.from({ length: 23 }, (_unused, id) => ({
    id: id + 1,
    rarity: 2,
    slot: 3,
    level: 6,
    vaulted: true,
    source: 0,
  }));
  const [, , shelf] = vaultOf(state({ atMage: true, vestiges })).kept;
  assert.deepEqual([shelf?.held, shelf?.most, shelf?.cells.length], [23, 20, 23]);
});
