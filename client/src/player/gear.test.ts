import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GearItem, GearState } from '../network/gearMessages.ts';
import type { Wardrobe } from './dressing.ts';
import { WORN, answerText, fullyUpgraded, gearHands, heldElement, itemName, traitOf, upgraded } from './gear.ts';

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
  price: 0,
  element: 0,
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
  atReader: false,
  answer: 0,
  identified: 0,
  answered: 0,
  nodes: [],
  wares: [],
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
  for (let code = 1; code <= 21; code++)
    assert.ok(!answerText(code).startsWith('Refused'), `the gear crate's refusal ${code} has words`);
  for (let code = 110; code <= 113; code++)
    assert.ok(!answerText(code).startsWith('Refused'), `the Arts' refusal ${code} has words`);
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

test('the gauge counts the nodes bought, and an item is fully upgraded once every node is bought', () => {
  const column = (traits: string[]) => ({ kind: 3, traits, xp: 500, aurem: 0, fragments: 0, essence: 0, resource: 0 });
  const columns = [column([]), column(['light_grip', 'weighted'])];
  assert.equal(upgraded(item({ columns, bought: 0b001, xp: 4_000, xpMost: 1_000 })), 1 / 3, 'nodes, not XP');
  assert.equal(upgraded(item({ columns, bought: 0b101 })), 2 / 3);
  assert.equal(upgraded(item({ columns: [] })), null, 'a piece with nothing to buy');
  assert.equal(fullyUpgraded(item({ columns, bought: 0b011 })), false, 'one perk still to buy');
  assert.equal(fullyUpgraded(item({ columns, bought: 0b111 })), true);
  assert.equal(fullyUpgraded(item({ columns: [] })), false, 'nothing to upgrade');
});

test('a hand glows in the element of the weapon worn in it, and nothing else glows', () => {
  const volt = item({ kind: 2, element: 2, at: WORN });
  const armour = item({ id: 2, kind: 14, element: 3, at: WORN + 3 });
  assert.equal(heldElement(state([volt, armour]), 0), 2);
  assert.equal(heldElement(state([volt, armour]), 1), 0, 'nothing in the off hand');
  assert.equal(heldElement(state([{ ...armour, at: WORN + 1 }]), 1), 0, 'no weapon in the off hand');
  assert.equal(heldElement(state([{ ...volt, at: 0 }]), 0), 0, 'carried, not worn');
  assert.equal(heldElement(null, 0), 0);
});
