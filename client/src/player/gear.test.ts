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
  weaponLook,
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
    'pistolet',
    'pistolet_gilded',
    'sword_iron',
    'sword_steel',
    'sword_ebony',
    'warhammer_iron',
  ],
  left: ['shield_kite_steel', 'dagger_iron_l', 'pistolet_l', 'pistolet_gilded_l', 'torch_l'],
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
  for (let code = 110; code <= 113; code++)
    assert.ok(!answerText(code).startsWith('Refused'), `the Arts' refusal ${code} has words`);
});

test('the hands hold the drawn loadout in its look, or the nearest metal the forge draws', () => {
  const hands = (right: string | null, left: string | null, grip: 'hilt' | null = null) => ({ right, left, grip });
  const shielded = item({ id: 1, kind: 12, rarity: 1, at: 2 });
  const brace = item({ id: 2, kind: 23, at: 3 });
  const worn = state([shielded, brace]);
  assert.deepEqual(gearHands(worn, WARDROBE), hands('sword_steel', 'shield_kite_steel'), 'Melee, drawn by default');
  assert.deepEqual(gearHands(worn, WARDROBE, 1), hands('pistolet', 'pistolet_l'), 'Ranged, a plain pistolet each');
  const atheric = item({ id: 3, kind: 2, rarity: 4, at: 2 });
  assert.deepEqual(gearHands(state([atheric]), WARDROBE), hands('sword_ebony', null), 'daedric undrawn: ebony');
  const gilded = item({ id: 4, kind: 23, rarity: 3, at: 3 });
  assert.deepEqual(gearHands(state([gilded]), WARDROBE, 1), hands('pistolet_gilded', 'pistolet_gilded_l'), 'gilded');
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

test("a weapon's look: a named piece's as written, a rolled one's by its rarity and name", () => {
  const look = (fields: Partial<GearItem>) => weaponLook(item({ kind: 2, ...fields }));
  assert.deepEqual(look({ named: 'seawall', kind: 12, rarity: 3 }), {
    metal: 'dwarven',
    shield: 'dwarven',
    make: 'tower',
  });
  assert.deepEqual(look({ named: 'crosscurrent', kind: 19, rarity: 3 }).make, 'short');
  const faction = { named: 'thunderstring', kind: 8, rarity: 3 };
  assert.deepEqual(
    weaponLook(item(faction), 'elven'),
    { metal: 'elven', shield: 'elven', make: 'long' },
    'its faction',
  );
  assert.deepEqual(
    [0, 1, 2].map((rarity) => look({ rarity }).metal),
    ['iron', 'steel', 'silver'],
  );
  assert.deepEqual(
    [0, 1, 2, 3].map((name) => look({ rarity: 2, name }).metal),
    ['silver', 'elven', 'dwarven', 'silver'],
  );
  assert.deepEqual(look({ kind: 12 }), { metal: 'iron', shield: 'plain', make: 'kite' }, 'a Normal shield plain');
  assert.deepEqual(
    [0, 1].map((name) => look({ kind: 18, rarity: 1, name }).make),
    ['buckler', 'round'],
  );
  assert.deepEqual(
    [0, 1].map((name) => look({ kind: 21, rarity: 1, name }).make),
    ['round', 'kite'],
  );
  assert.deepEqual(
    [0, 1].map((name) => look({ kind: 8, rarity: 1, name }).make),
    ['long', 'short'],
  );
  assert.deepEqual(
    [2, 3].map((rarity) => look({ kind: 11, rarity }).metal),
    ['plain', 'gilded'],
    'a thunderlock',
  );
  assert.equal(look({ named: 'signal_pair', kind: 23, rarity: 3 }).metal, 'plain', 'unless it names its own');
});
