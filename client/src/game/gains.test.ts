import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ARTS } from './artsCards.ts';
import type { GearItem, GearShip, GearState } from '../network/gearMessages.ts';
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
  hard: false,
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
  source: 0,
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
  const vestige = { id: 2, rarity: 2, slot: 0, level: 5, vaulted: false, source: 0 };
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

test('a chest opened shows its tier in four pips, the XP it gave and the reputation', () => {
  const chest = {
    id: 9,
    rarity: 0,
    slot: 0,
    at: [0, 0, 0] as const,
    kind: 3,
    from: [0, 0, 0] as const,
    flying: 0,
    tier: 3,
    poured: false,
  };
  const before = state({
    xp: 1_000n,
    drops: [chest],
    standing: { pledge: 2, reputation: [0, 400, 0], packages: [], artLevels: [], artXp: [], artOwned: [] },
  });
  const after = state({
    xp: 4_200n,
    drops: [],
    standing: { pledge: 2, reputation: [0, 3_600, 0], packages: [], artLevels: [], artXp: [], artOwned: [] },
  });
  const shown = gainsOf(before, after).map((gain) => [gain.name, gain.count, gain.pips ?? null]);
  assert.deepEqual(shown, [
    ['Heroic chest', 1, 3],
    ['XP', 3_200, null],
    ['Lamplighters reputation', 3_200, null],
  ]);
});

test('letters newly in the mail are told as sent there, counted together; those already waiting are not', () => {
  const letter = (id: number) => ({ id, from: 0, crowded: false, vestige: null, item: null });
  const before = state({ mail: [letter(1)] });
  const after = state({ mail: [letter(1), letter(5), letter(6)] });
  const sent = gainsOf(before, after).filter((gained) => gained.key === 'mail');
  assert.deepEqual(
    sent.map((gained) => gained.count),
    [2],
  );
  assert.ok(sent[0]?.icon, 'under the Postmaster’s mark');
  assert.deepEqual(gainsOf(after, state({ mail: [letter(6)] })), [], 'a letter taken is no gain');
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
    ship: { xp: 50n, stocks: [1, 1, 1, 1], fleet: [], dresses: [] } as unknown as GearState['ship'],
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
    ship: { xp: 80n, stocks: [3, 1, 1, 1], fleet: [], dresses: [] } as unknown as GearState['ship'],
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

test('a ship handed over or bought and a ship’s dress bought are gains; a ship sailed again is not', () => {
  const ship = (fields: Partial<GearShip>): GearShip => ({
    xp: 0n,
    level: 1,
    prestige: 0,
    attack: 0,
    defense: 0,
    toNext: 0,
    toNextNeeds: 0,
    stocks: [],
    hands: 10,
    handsMost: 10,
    officers: [],
    offers: [],
    trim: [],
    pledge: 0,
    fleet: [],
    sailed: 0,
    dresses: [],
    ...fields,
  });
  const sloop = { hull: 0, name: [255, 255], named: false, dress: [] };
  const brig = { ...sloop, hull: 2 };
  const handed = gainsOf(state({ ship: ship({}) }), state({ ship: ship({ fleet: [sloop] }) }));
  assert.deepEqual(
    handed.map((each) => [each.key, each.name, each.glyph]),
    [['hull-0', 'Sloop', 'hull']],
  );
  const bought = gainsOf(
    state({ ship: ship({ fleet: [sloop], dresses: [0] }) }),
    state({ ship: ship({ fleet: [sloop, brig], sailed: 2, dresses: [0, 1] }) }),
  );
  assert.deepEqual(
    bought.map((each) => [each.key, each.name]),
    [
      ['hull-2', 'Brig'],
      ['dress-1', 'Tar Black'],
    ],
  );
  assert.ok(bought[1]?.icon?.startsWith('<svg'));
  const sailed = gainsOf(
    state({ ship: ship({ fleet: [sloop, brig], sailed: 2 }) }),
    state({ ship: ship({ fleet: [sloop, brig], sailed: 0 }) }),
  );
  assert.deepEqual(sailed, [], 'sailing another kept ship gains nothing');
  assert.deepEqual(gainsOf(state({}), state({ ship: ship({ fleet: [sloop] }) })), [], 'nor the first word on the ship');
});

test('a chest opened or a container searched is named, with no count, over the Aurem it gave', () => {
  const chest = { number: 7, at: [0, 0, 0] as const, facing: 0 };
  const wardrobe = { number: 9, box: [0, 0, 1, 1] as const, foot: 0, top: 1.8, model: 41003 };
  const before = state({ aurem: 100, chests: [chest], searchables: [wardrobe] });
  const opened = gainsOf(before, state({ aurem: 130, chests: [], searchables: [wardrobe], opened: 7 }));
  assert.deepEqual(
    opened.map((each) => [each.name, each.bare ?? false]),
    [
      ['Chest', true],
      ['Aurem', false],
    ],
  );
  assert.ok(opened[0]?.icon?.startsWith('<svg'), 'its mark beside it');
  const searched = gainsOf(before, state({ aurem: 108, chests: [chest], searchables: [], opened: 9 }));
  assert.equal(searched[0]?.name, 'Searched the wardrobe');
  const moved = gainsOf(before, state({ aurem: 100, chests: [{ ...chest, number: 8 }], searchables: [wardrobe] }));
  assert.deepEqual(moved, [], 'a chest that moved on gave nothing');
});

test('a chest that moved on while a kill paid Aurem is no gain: only the room naming it opened makes one', () => {
  const chest = { number: 7, at: [0, 0, 0] as const, facing: 0 };
  const before = state({ aurem: 100, chests: [chest], searchables: [] });
  const moved = state({ aurem: 110, chests: [{ ...chest, number: 8 }], searchables: [] });
  assert.deepEqual(
    gainsOf(before, moved).map((each) => each.name),
    ['Aurem'],
    "the kill's Aurem, no chest",
  );
});
