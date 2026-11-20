import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Outfit } from '../forge/outfit.ts';
import type { GearItem, GearState } from '../network/gearMessages.ts';
import type { Wardrobe } from './dressing.ts';
import { MELEE, RANGED_SLOT } from './gear.ts';
import { gearOutfit, spareOutfit } from './gearLooks.ts';

const item = (fields: Partial<GearItem>): GearItem => ({
  id: 1,
  kind: 14,
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
const state = (items: GearItem[]): GearState => ({
  xp: 0n,
  level: 1,
  prestige: 0,
  defense: 0,
  aurem: 0,
  stocks: [],
  resources: [],
  items,
  vestiges: [],
  drops: [],
  spent: [],
  atMage: false,
  answer: 0,
  answered: 0,
  nodes: [],
  wares: [],
  identified: 0,
});
const sets = ['chain', 'steel', 'iron', 'leather', 'knights'];
const wardrobe: Wardrobe = {
  sets: { helm: sets, pauldrons: sets, cuirass: sets, gauntlets: sets, greaves: sets, boots: sets },
  garments: [
    'shirt_long_v',
    'shirt_long_round',
    'short_tunic',
    'vest',
    'breeches',
    'shoes',
    'tall_boots',
    'casual_cloak',
    'formal_cloak',
  ],
  right: ['sword_iron', 'sword_steel'],
  left: ['shield_iron'],
  hairStyles: ['crop'],
};
const plain: Outfit = {
  armour: { cuirass: 'iron' },
  garments: ['shirt_long_v'],
  dyes: {},
  right: null,
  left: null,
  drawn: false,
  hair: { style: 'crop', colour: 'brown' },
};

test('the starting kit dresses the figure in plain clothes; its head and arms show nothing', () => {
  const kit = state([
    item({ id: 1, kind: 2, at: 2 }),
    item({ id: 2, kind: 13, at: 4 }),
    item({ id: 3, kind: 14, at: 5 }),
    item({ id: 4, kind: 15, at: 6 }),
    item({ id: 5, kind: 16, at: 7 }),
  ]);
  const outfit = gearOutfit(kit, wardrobe, plain);
  assert.deepEqual(outfit.armour, {}, 'no armour: the armour it had is the gear’s to say');
  assert.deepEqual(outfit.garments, ['shirt_long_v', 'breeches', 'shoes']);
  assert.deepEqual(outfit.dyes, { shirt_long_v: 'White', breeches: 'White', shoes: 'White' });
  assert.equal(outfit.right, 'sword_iron');
  assert.deepEqual(outfit.hair, plain.hair, 'the hair is the player’s own');
});

test("the spare outfit holds the other loadout's weapon, or is none with no weapon worn there", () => {
  const kit = state([item({ id: 1, kind: 2, at: 2 })]);
  assert.equal(spareOutfit(kit, wardrobe, plain, RANGED_SLOT)?.right, 'sword_iron', 'the Ranged drawn: the sword');
  assert.equal(spareOutfit(kit, wardrobe, plain, MELEE), null, 'the sword drawn: no Ranged worn');
});

test('a Rare or finer piece is an armour set, the rarer the finer; Magic is tunic, leather and boots', () => {
  const dressed = gearOutfit(
    state([
      item({ id: 1, kind: 14, rarity: 2, at: 5, name: 1 }),
      item({ id: 2, kind: 16, rarity: 3, at: 7, named: 'tidebreaker_greaves' }),
      item({ id: 3, kind: 13, rarity: 1, at: 4 }),
      item({ id: 4, kind: 15, rarity: 1, at: 6 }),
      item({ id: 5, kind: 17, rarity: 3, at: 8 }),
    ]),
    wardrobe,
    plain,
  );
  assert.deepEqual(dressed.armour, {
    cuirass: 'steel',
    pauldrons: 'steel',
    greaves: 'knights',
    boots: 'knights',
    helm: 'leather',
    gauntlets: 'leather',
  });
  assert.deepEqual(dressed.garments, ['formal_cloak']);
  assert.equal(dressed.dyes['formal_cloak'], 'Red');
  const magic = gearOutfit(state([item({ kind: 14, rarity: 1, at: 5, name: 1 })]), wardrobe, plain);
  assert.deepEqual(magic.garments, ['shirt_long_v', 'vest']);
  assert.equal(magic.dyes['vest'], 'Aquamarine', 'each item keeps its own look by its name');
});
