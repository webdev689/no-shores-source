import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GearItem, GearState } from '../network/gearMessages.ts';
import type { Wardrobe } from './dressing.ts';
import {
  WORN,
  answerText,
  fullyUpgraded,
  gearHands,
  heldElements,
  itemName,
  slotOf,
  traitOf,
  upgraded,
  wearAsks,
} from './gear.ts';

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
  atMage: false,
  answer: 0,
  identified: 0,
  answered: 0,
  nodes: [],
  wares: [],
});

const WARDROBE: Wardrobe = {
  sets: { helm: [], pauldrons: [], cuirass: [], gauntlets: [], greaves: [], boots: [] },
  garments: [],
  right: [
    'bow_long_iron',
    'dagger_iron',
    'pistolet_iron',
    'sword_iron',
    'sword_steel',
    'sword_ebony',
    'warhammer_iron',
  ],
  left: ['shield_kite_steel', 'dagger_iron_l', 'pistolet_iron_l', 'torch_l'],
  hairStyles: [],
};

test('an item is named as the catalogue names it', () => {
  assert.equal(itemName(item({ named: 'harbourwarden', rarity: 3 })), 'Harbourwarden');
  assert.equal(itemName(item({ kind: 2, rarity: 0 })), 'Sword');
  assert.equal(itemName(item({ kind: 8, rarity: 2, name: 1 })), 'Skua');
  assert.equal(traitOf('ebb').name, 'Ebb');
  assert.equal(answerText(0), '');
  assert.equal(answerText(15), 'You do not have enough for it.');
  for (let code = 1; code <= 24; code++)
    assert.ok(!answerText(code).startsWith('Refused'), `the gear crate's refusal ${code} has words`);
  assert.equal(answerText(120), 'Wear a Ranged weapon first.', 'a crate used with no Ranged weapon worn');
  assert.ok(!answerText(103).startsWith('Refused'), 'a puzzle used again too soon has words');
  for (let code = 110; code <= 115; code++)
    assert.ok(!answerText(code).startsWith('Refused'), `the Arts' refusal ${code} has words`);
  // A keeper the asks name, nothing to say, and no fragment choice waiting: the gear crate's 135 to 137, sent plus one.
  for (let code = 136; code <= 138; code++)
    assert.ok(!answerText(code).startsWith('Refused'), `the roads' refusal ${code} has words`);
});

test('the hands hold the drawn loadout, in its rarity’s metal where the forge draws it', () => {
  const hands = (right: string | null, left: string | null, grip: 'hilt' | null = null) => ({ right, left, grip });
  const shielded = item({ id: 1, kind: 12, rarity: 1, at: 2 });
  const brace = item({ id: 2, kind: 23, at: 3 });
  const worn = state([shielded, brace]);
  assert.deepEqual(gearHands(worn, WARDROBE), hands('sword_steel', 'shield_kite_steel'), 'Melee, drawn by default');
  assert.deepEqual(gearHands(worn, WARDROBE, 1), hands('pistolet_iron', 'pistolet_iron_l'), 'Ranged, a pistolet each');
  const atheric = item({ id: 3, kind: 2, rarity: 4, at: 2 });
  assert.deepEqual(gearHands(state([atheric]), WARDROBE), hands('sword_ebony', null), 'a sword alone');
  const pair = item({ id: 5, kind: 1, at: 2 });
  assert.deepEqual(gearHands(state([pair]), WARDROBE), hands('dagger_iron', 'dagger_iron_l'), 'a pair');
  const greatsword = item({ id: 6, kind: 22, at: 2 });
  assert.deepEqual(gearHands(state([greatsword]), WARDROBE), hands('sword_iron', null, 'hilt'), 'on its hilt');
  assert.deepEqual(gearHands(state([brace]), WARDROBE), hands(null, null), 'no Melee worn, bare hands');
});

test('each kind is worn in its loadout or its own slot, and put on with one press', () => {
  assert.deepEqual(
    [slotOf(12), slotOf(22), slotOf(1), slotOf(23), slotOf(11), slotOf(13), slotOf(17)],
    [0, 0, 0, 1, 1, 2, 6],
  );
  assert.deepEqual(
    wearAsks(item({ id: 4, kind: 9 })).map((each) => [each.label, each.ask.slot]),
    [['Equip', 1]],
    'a crossbow, Ranged',
  );
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

test('the drawn loadout glows in its element: both hands for a pair, the right alone otherwise', () => {
  const sword = item({ kind: 2, element: 2, at: WORN });
  const pair = item({ id: 3, kind: 19, element: 3, at: WORN });
  const shielded = item({ id: 4, kind: 12, element: 1, at: WORN });
  const bow = item({ id: 5, kind: 8, element: 1, at: WORN + 1 });
  const armour = item({ id: 2, kind: 14, element: 3, at: WORN + 3 });
  assert.deepEqual(heldElements(state([sword, armour]), 0), [2, 0]);
  assert.deepEqual(heldElements(state([pair]), 0), [3, 3], 'a pair glows in both hands');
  assert.deepEqual(heldElements(state([shielded]), 0), [1, 0], 'a shield is no weapon');
  assert.deepEqual(heldElements(state([sword, bow]), 1), [1, 0], 'the Ranged loadout drawn');
  assert.deepEqual(heldElements(state([{ ...sword, at: 0 }]), 0), [0, 0], 'carried, not worn');
  assert.deepEqual(heldElements(null, 0), [0, 0]);
});
