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
  hard: false,
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
  source: 0,
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

test('every rolled piece is named by the set it is drawn in, and its kind', () => {
  const [sword, bow, head, torso, legs] = [2, 8, 13, 14, 16];
  assert.equal(itemName(item({ kind: sword, rarity: 0 })), 'Homespun Sword', 'a Normal weapon is plain');
  assert.equal(itemName(item({ kind: torso, rarity: 0, level: 20 })), 'Homespun Hauberk', 'Normal armour is clothes');
  // The world's Rare armour climbs chain to steel; its weapons iron to steel.
  assert.equal(itemName(item({ kind: head, rarity: 2, level: 1, name: 0 })), 'Shoreguard Helm');
  assert.equal(itemName(item({ kind: head, rarity: 2, level: 20, name: 0 })), 'Wayfarer Helm');
  assert.equal(itemName(item({ kind: sword, rarity: 2, level: 1, name: 0 })), 'Portwatch Sword');
  // Each other content's Legendary in its own sets, by its look roll.
  const legendary = (kind: number, source: number, name: number) =>
    itemName(item({ kind, rarity: 3, level: 20, source, name }));
  assert.equal(legendary(sword, 3, 0), 'Wreckborn Sword');
  assert.equal(legendary(sword, 3, 1), 'Brightwater Sword');
  assert.equal(legendary(head, 4, 0), 'Deepwarden Helm');
  assert.equal(legendary(legs, 4, 1), 'Blackwater Greaves');
  assert.equal(legendary(bow, 5, 1), 'Brassbound Bow');
  assert.equal(legendary(head, 2, 0), 'Barrowknight Helm');
  assert.equal(legendary(sword, 2, 2), 'Gravewarden Sword');
  assert.equal(legendary(torso, 6, 0), 'Lattice Hauberk');
  // A Breach's weapons come in two sets, Normal's and Hard's, the Hard one Forged; its armour is named as any.
  const breach = (kind: number, hard: boolean) =>
    itemName({ ...item({ kind, rarity: 3, level: 20, source: 6, name: 0 }), breach: true, hard });
  assert.equal(breach(sword, false), 'Lattice Sword', 'won at Normal');
  assert.equal(breach(sword, true), 'Lattice Sword (Forged)', 'won at Hard');
  assert.equal(breach(bow, true), 'Lattice Bow (Forged)');
  assert.equal(breach(torso, true), 'Lattice Hauberk', 'armour is never Forged');
  // A Magic torso rolled for clothes is Homespun; one in its content's lightest set is that set's, bought or not.
  assert.equal(itemName(item({ kind: torso, rarity: 1, name: 0 })), 'Homespun Hauberk');
  assert.equal(itemName(item({ kind: torso, rarity: 1, name: 6 })), 'Deckhand Hauberk');
  assert.equal(itemName(item({ kind: torso, rarity: 1, name: 6, id: 0 })), 'Deckhand Hauberk', 'as a ware');
  // A faction's piece is its faction's set, whatever metal it is drawn in.
  assert.equal(itemName(item({ kind: 12, rarity: 3, named: 'squallbreak' })), 'Stormcaller Sword and Shield');
  assert.equal(itemName(item({ kind: bow, rarity: 3, named: 'nightpin' })), 'Veiled Bow');
});

test('an item is named as the catalogue names it', () => {
  assert.equal(
    itemName(item({ named: 'harbourwarden', rarity: 3 })),
    'Harbourwarden',
    'a named Legendary keeps its own',
  );
  assert.equal(itemName(item({ named: 'the_drowned_oath', rarity: 4, source: 4 })), 'The Drowned Oath');
  assert.equal(traitOf('ebb').name, 'Ebb');
  assert.equal(answerText(0), '');
  assert.equal(answerText(15), 'You do not have enough for it.');
  for (let code = 1; code <= 24; code++)
    assert.ok(!answerText(code).startsWith('Refused'), `the gear crate's refusal ${code} has words`);
  assert.equal(answerText(120), 'Wear a Ranged weapon first.', 'a crate used with no Ranged weapon worn');
  assert.ok(!answerText(103).startsWith('Refused'), 'a puzzle used again too soon has words');
  for (let code = 110; code <= 115; code++)
    assert.ok(!answerText(code).startsWith('Refused'), `the Arts' refusal ${code} has words`);
  for (let code = 81; code <= 85; code++)
    assert.ok(!answerText(code).startsWith('Refused'), `the board's refusal ${code} has words`);
  assert.equal(answerText(82), 'That bounty is no longer on the board.');
  // A keeper the asks name, nothing to say, and no fragment choice waiting: the gear crate's 135 to 137, sent plus one.
  for (let code = 136; code <= 138; code++)
    assert.ok(!answerText(code).startsWith('Refused'), `the roads' refusal ${code} has words`);
  // The guilds' and outposts' refusals, the gear crate's 150 to 165, sent plus one.
  for (let code = 151; code <= 166; code++)
    assert.ok(!answerText(code).startsWith('Refused'), `the guilds' refusal ${code} has words`);
  assert.equal(answerText(163), 'Wait for your last ask.');
  assert.equal(answerText(164), 'Only the founder or an admin sounds the War Horn.');
  assert.equal(answerText(165), 'No War Horn stands here yet.');
  assert.equal(answerText(166), 'Too many asks. Wait a while.', 'past the limit, the accounts own words');
});

test('the hands hold the drawn loadout in its look, or the nearest metal the forge draws', () => {
  const hands = (right: string | null, left: string | null, grip: 'hilt' | null = null) => ({ right, left, grip });
  const shielded = item({ id: 3, kind: 12, rarity: 1, at: 2 });
  const brace = item({ id: 2, kind: 23, at: 3 });
  const worn = state([shielded, brace]);
  assert.deepEqual(gearHands(worn, WARDROBE), hands('sword_iron', 'shield_kite_steel'), 'Melee, drawn by default');
  assert.deepEqual(gearHands(worn, WARDROBE, 1), hands('pistolet', 'pistolet_l'), 'Ranged, a plain pistolet each');
  const abyss = item({ id: 3, kind: 2, rarity: 2, level: 1, at: 2, source: 4 });
  assert.deepEqual(gearHands(state([abyss]), WARDROBE), hands('sword_ebony', null), 'adamantium undrawn: ebony');
  const gilded = item({ id: 4, kind: 23, rarity: 3, at: 3 });
  assert.deepEqual(gearHands(state([gilded]), WARDROBE, 1), hands('pistolet_gilded', 'pistolet_gilded_l'), 'gilded');
  const pair = item({ id: 5, kind: 1, at: 2 });
  assert.deepEqual(gearHands(state([pair]), WARDROBE), hands('dagger_iron', 'dagger_iron_l'), 'a pair');
  const greatsword = item({ id: 6, kind: 22, at: 2 });
  assert.deepEqual(gearHands(state([greatsword]), WARDROBE), hands('sword_iron', null, 'hilt'), 'on its hilt');
  assert.deepEqual(gearHands(state([brace]), WARDROBE), hands(null, null), 'no Melee worn, bare hands');
  // The forge draws no orcish crossbow: an Elite Dungeon's falls to its own content's mithril before dwarven, as near.
  const crossbows: Wardrobe = { ...WARDROBE, right: ['crossbow_dwarven', 'crossbow_silver', 'crossbow_mithril'] };
  const elite = item({ id: 7, kind: 9, rarity: 2, level: 1, at: 3, source: 3 });
  assert.deepEqual(gearHands(state([elite]), crossbows, 1).right, 'crossbow_mithril', 'its own content first');
  const world = item({ id: 7, kind: 9, rarity: 2, level: 20, at: 3, source: 0 });
  assert.deepEqual(gearHands(state([world]), crossbows, 1).right, 'crossbow_silver', 'steel undrawn: the nearest');
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

test("a weapon's look: a named piece's as written; a rolled one climbs with its level, its make by its number", () => {
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
  const metals = (rarity: number, level: number) =>
    [0, 1, 2].map((name) => look({ rarity, level, name }).metal).join(' ');
  assert.deepEqual(
    [metals(0, 1), metals(0, 10), metals(0, 11)],
    ['iron iron iron', 'iron iron iron', 'steel steel steel'],
  );
  // A finer one is made in its content's metals: the world's climbing with its level, one more by its name where one
  // is left; any other content's by its name alone, so each of its metals is seen at every level it drops.
  const from = (source: number, rarity: number, level: number) =>
    [0, 1, 2].map((name) => look({ rarity, level, name, source }).metal).join(' ');
  assert.deepEqual([from(0, 1, 1), from(0, 1, 20)], ['iron steel iron', 'steel steel steel'], 'the world');
  assert.deepEqual([from(3, 2, 1), from(3, 2, 20)], ['orcish mithril orcish', 'orcish mithril orcish'], 'Elite');
  assert.deepEqual(from(4, 2, 20), 'adamantium ebony adamantium', 'an Abyss Dungeon, whose drops are all at 20');
  assert.deepEqual(
    [from(2, 2, 1), from(5, 1, 1), from(6, 2, 20)],
    ['silver silver silver', 'elven dwarven elven', 'daedric daedric daedric'],
  );
  // Its make by its look roll's sixths, apart from the remainder its metal climbs by.
  const makes = (kind: number) => [6, 12, 18].map((name) => look({ kind, rarity: 1, name }).make).join(' ');
  assert.deepEqual(
    [makes(12), makes(18), makes(21), makes(8)],
    ['round tower kite', 'round kite buckler', 'kite tower round', 'short long short'],
  );
  assert.deepEqual(
    [18, 19, 24].map((name) => look({ kind: 12, name }).make),
    ['kite', 'kite', 'round'],
    'not by the remainder its metal climbs by',
  );
  assert.equal(look({ kind: 12, id: 0, name: 6 }).make, look({ kind: 12, id: 9, name: 6 }).make, 'bought as shown');
  const shields = [6, 12].map((name) => look({ kind: 12, name }).shield);
  assert.deepEqual([...shields, look({ kind: 12, level: 11 }).shield], ['iron', 'plain', 'steel'], 'a Normal shield');
  assert.deepEqual(
    [2, 3].map((rarity) => look({ kind: 11, rarity }).metal),
    ['plain', 'gilded'],
    'a thunderlock',
  );
  assert.equal(look({ named: 'signal_pair', kind: 23, rarity: 3 }).metal, 'plain', 'unless it names its own');
});

test('the prologue’s own armour is named for its steel’s set; its sword and shield and its bow as any piece', () => {
  const story = { named: null, rarity: 0, name: 0, story: true, id: 1, level: 1, source: 0 };
  assert.deepEqual(
    [14, 15, 16].map((kind) => itemName({ ...story, kind })),
    ['Wayfarer Hauberk', 'Wayfarer Gauntlets', 'Wayfarer Greaves'],
  );
  assert.equal(itemName({ ...story, kind: 12 }), itemName({ ...story, kind: 12, story: false }));
  assert.equal(itemName({ ...story, kind: 14, story: false }), 'Homespun Hauberk', 'a plain piece its own');
});
