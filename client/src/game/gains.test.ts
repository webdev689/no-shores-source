import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ARTS } from './artsCards.ts';
import type { GearItem, GearState } from '../network/gearMessages.ts';
import { gainsOf } from './gains.ts';

const item = (id: number, rarity: number, place = 0): GearItem => ({
  id,
  kind: 2,
  rarity,
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
  at: place,
  attack: 0,
  defense: 0,
  prestige: 0,
  columns: [],
  price: 0,
  element: 0,
});

const state = (fields: Partial<GearState>): GearState => ({
  xp: 0n,
  level: 1,
  prestige: 0,
  defense: 0,
  aurem: 100,
  stocks: [0, 0, 0, 0, 0],
  resources: [0, 0, 0],
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

test('a dismantle gains its Aurem, fragments and essence, and the piece gone is no gain', () => {
  const before = state({ items: [item(4, 3)] });
  const after = state({ aurem: 300, stocks: [3, 0, 2, 0, 0] });
  assert.deepEqual(
    gainsOf(before, after).map((each) => [each.key, each.name, each.count]),
    [
      ['aurem', 'Aurem', 200],
      ['stock-0', 'Weapon Fragments', 3],
      ['stock-2', 'Weapon Essence', 2],
    ],
  );
});

test('a new item, a Vestige and a resource are gains; a piece moved or a count spent is not', () => {
  const vestige = { id: 2, rarity: 2, slot: 0, level: 5, vaulted: false };
  const before = state({ items: [item(4, 1)], resources: [5, 0, 0], stocks: [4, 0, 0, 0, 1] });
  const after = state({
    aurem: 40,
    items: [item(4, 1, 1), item(9, 4)],
    vestiges: [vestige],
    resources: [5, 2, 0],
    stocks: [1, 0, 0, 0, 1],
  });
  const gains = gainsOf(before, after);
  assert.deepEqual(
    gains.map((each) => [each.key, each.count, each.rarity]),
    [
      ['resource-1', 2, null],
      ['item-9', 1, 4],
      ['vestige-2', 1, 2],
    ],
  );
  assert.equal(gains[1]?.item?.id, 9, 'the item itself, for its picture');
  assert.equal(gains[2]?.name, 'Rare Vestige');
});

test('an emblem newly kept is a gain', () => {
  const gains = gainsOf(state({ emblems: [0] }), state({ emblems: [0, 3] }));
  assert.deepEqual(
    gains.map((each) => [each.key, each.emblem]),
    [['emblem-3', 3]],
  );
});

test('an Ammo box taken gains its shots and a crate gained shows; a crate used gains nothing', () => {
  const before = state({ ammo: 6, ammoMost: 24, ammoShare: 0.25, crates: 1 });
  const boxed = state({ ammo: 12, ammoMost: 24, ammoShare: 0.5, crates: 1 });
  assert.deepEqual(
    gainsOf(before, boxed).map((each) => [each.key, each.name, each.count, each.glyph]),
    [['ammo', 'Ammo', 6, 'ammo-box']],
  );
  const filled = state({ ammo: 24, ammoMost: 24, ammoShare: 1, crates: 0 });
  assert.deepEqual(gainsOf(before, filled), [], 'the crate was spent: its ammunition is no gain');
  const dropped = state({ ammo: 6, ammoMost: 24, ammoShare: 0.25, crates: 3 });
  assert.deepEqual(
    gainsOf(before, dropped).map((each) => [each.key, each.name, each.count, each.glyph]),
    [['ammo-crate', 'Ammo crate', 2, 'ammo-crate']],
  );
});

test('Shapes gained and a cosmetic newly kept are gains, each with a picture of its own', () => {
  const gains = gainsOf(state({ shapes: 2, cosmetics: [0] }), state({ shapes: 6, cosmetics: [0, 1, 25] }));
  assert.deepEqual(
    gains.map((each) => [each.key, each.name, each.count]),
    [
      ['shapes', 'Shapes', 4],
      ['cosmetic-1', 'Harbour Blue', 1],
      ['cosmetic-25', 'Wraith Mist', 1],
    ],
  );
  assert.ok(gains.every((each) => each.icon?.startsWith('<svg')));
  assert.deepEqual(gainsOf(state({ shapes: 6 }), state({ shapes: 1 })), [], 'Shapes spent are no gain');
});

test('XP, reputation and an Art’s progress are short lines; a level, a fragment and the ship’s materials are rows', () => {
  const before = state({
    xp: 1000n,
    standing: {
      pledge: 1,
      reputation: [10, 0, 0],
      packages: [0, 0, 0],
      artLevels: [1, 1, 1],
      artXp: [5, 0, 0],
      artOwned: [0, 0, 0],
    },
    ship: { xp: 50n, stocks: [1, 1, 1, 1] } as unknown as GearState['ship'],
  });
  const after = state({
    xp: 1250n,
    standing: {
      pledge: 1,
      reputation: [35, 0, 0],
      packages: [0, 0, 0],
      artLevels: [1, 2, 1],
      artXp: [45, 0, 0],
      artOwned: [0, 0, 1],
    },
    ship: { xp: 80n, stocks: [3, 1, 1, 1] } as unknown as GearState['ship'],
  });
  const shown = gainsOf(before, after).map((gain) => [gain.name, gain.count, gain.compact]);
  assert.deepEqual(shown, [
    ['XP', 250, true],
    ['Stormcallers reputation', 25, true],
    ['Storm XP', 40, true],
    ['Divine level 2', 1, false],
    [ARTS[2]?.core[0]?.name, 1, false],
    ['Timber', 2, false],
    ['Ship XP', 30, true],
  ]);
});
