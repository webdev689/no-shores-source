import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GearItem, GearState } from '../network/gearMessages.ts';
import type { Wardrobe } from './dressing.ts';
import { answerText, gearHands, itemName, traitOf } from './gear.ts';

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
  xpMost: 1_000,
  bought: 0,
  chosen: [],
  bucket: 0,
  at: 0,
  attack: 10,
  defense: 0,
  prestige: 0,
  columns: [],
  ...fields,
});

const state = (items: readonly GearItem[]): GearState => ({
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
  social: false,
  answer: 0,
  identified: 0,
  answered: 0,
});

const WARDROBE: Wardrobe = {
  sets: { helm: [], pauldrons: [], cuirass: [], gauntlets: [], greaves: [], boots: [] },
  garments: [],
  right: ['bow_long_iron', 'sword_iron', 'sword_steel', 'sword_ebony', 'warhammer_iron'],
  left: ['shield_kite_steel', 'dagger_iron_l', 'torch_l'],
  hairStyles: [],
};

test('an item is named as the catalogue names it', () => {
  assert.equal(itemName(item({ named: 'harbourwarden', rarity: 3 })), 'Harbourwarden');
  assert.equal(itemName(item({ kind: 2, rarity: 0 })), 'Sword');
  assert.equal(itemName(item({ kind: 8, rarity: 2, name: 1 })), 'Skua');
  assert.equal(traitOf('ebb').name, 'Ebb');
  assert.equal(answerText(0), '');
  assert.equal(answerText(15), 'You do not have enough for it.');
});

test('the hands hold what the gear wears, in its rarity’s metal where the forge draws it', () => {
  const sword = item({ id: 1, kind: 2, rarity: 1, at: 2 });
  const shield = item({ id: 2, kind: 12, at: 3 });
  assert.deepEqual(gearHands(state([sword, shield]), WARDROBE), { right: 'sword_steel', left: 'shield_kite_steel' });
  const atheric = item({ id: 3, kind: 2, rarity: 4, at: 2 });
  assert.deepEqual(gearHands(state([atheric]), WARDROBE), { right: 'sword_ebony', left: null });
  const hammer = item({ id: 4, kind: 6, at: 2 });
  assert.deepEqual(gearHands(state([hammer, shield]), WARDROBE), { right: 'warhammer_iron', left: null });
  const dagger = item({ id: 5, kind: 1, at: 3 });
  assert.deepEqual(gearHands(state([sword, dagger]), WARDROBE), { right: 'sword_steel', left: 'dagger_iron_l' });
  assert.deepEqual(gearHands(state([]), WARDROBE), { right: null, left: null }, 'nothing worn, bare hands');
});
