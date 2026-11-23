import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import type { Outfit } from '../forge/outfit.ts';
import type { GearItem, GearState } from '../network/gearMessages.ts';
import type { Wardrobe } from './dressing.ts';
import { readFromRoom } from '../network/messages.ts';
import { KINDS, MELEE, RANGED_SLOT, WORN, weaponLook } from './gear.ts';
import { gearOutfit, spareOutfit } from './gearLooks.ts';
import { COSMETICS } from '../forge/cosmetics.ts';

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
  source: 0,
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
/** A wardrobe that draws every set of the ladder for every piece, but chain's pauldrons, as the forge does. */
const finest = [
  'leather',
  'thieves',
  'chain',
  'iron',
  'steel',
  'knights',
  'silver',
  'elven',
  'dwarven',
  'orcish',
].concat(['mithril', 'adamantium', 'ebony', 'daedric']);
const every: Wardrobe = {
  ...wardrobe,
  sets: {
    helm: finest,
    pauldrons: finest.filter((set) => set !== 'chain'),
    cuirass: finest,
    gauntlets: finest,
    greaves: finest,
    boots: finest,
  },
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

test('a Rare or finer piece is an armour set; a Magic one light armour or clothes by its number', () => {
  const dressed = gearOutfit(
    state([
      item({ id: 1, kind: 14, rarity: 2, at: 5, name: 1 }),
      item({ id: 2, kind: 16, rarity: 3, at: 7, named: 'tithebreaker_greaves', level: 20, source: 5 }),
      item({ id: 2, kind: 13, rarity: 1, at: 4 }),
      item({ id: 4, kind: 15, rarity: 1, at: 6 }),
      item({ id: 5, kind: 17, rarity: 3, at: 8 }),
    ]),
    wardrobe,
    plain,
  );
  assert.deepEqual(dressed.armour, {
    cuirass: 'iron',
    pauldrons: 'iron',
    greaves: 'knights',
    boots: 'knights',
    helm: 'leather',
    gauntlets: 'leather',
  });
  assert.deepEqual(dressed.garments, ['formal_cloak']);
  assert.equal(dressed.dyes['formal_cloak'], 'Red');
  const magic = gearOutfit(state([item({ id: 3, kind: 14, rarity: 1, at: 5, name: 1 })]), wardrobe, plain);
  assert.deepEqual(magic.garments, ['shirt_long_v', 'vest'], 'a Magic torso numbered for clothes');
  assert.equal(magic.dyes['vest'], 'Aquamarine', 'each item keeps its own look by its name');
  const light = gearOutfit(state([item({ id: 4, kind: 14, rarity: 1, at: 5 })]), wardrobe, plain);
  assert.deepEqual([light.armour.cuirass, light.garments], ['leather', []], 'one numbered for leather');
});

test("a rolled Rare piece climbs the world's sets with its level, and any other content's spreads by its name", () => {
  const worn = (fields: Partial<GearItem>) =>
    gearOutfit(state([item({ kind: 14, rarity: 2, at: 5, ...fields })]), every, plain).armour;
  const cuirasses = (source: number, level: number) =>
    [0, 1, 2].map((name) => worn({ name, level, source }).cuirass).join(' ');
  assert.deepEqual([cuirasses(0, 1), cuirasses(0, 20)], ['chain iron chain', 'steel steel steel'], 'the world');
  // Every look of a content past the world is seen at every level it drops: the Abyss Dungeons' all drop at 20.
  assert.deepEqual([cuirasses(2, 1), cuirasses(2, 20)], ['knights silver knights', 'knights silver knights']);
  assert.deepEqual([cuirasses(3, 20), cuirasses(4, 20)], ['orcish mithril orcish', 'adamantium ebony adamantium']);
  assert.deepEqual([cuirasses(5, 20), cuirasses(6, 1)], ['elven dwarven elven', 'daedric daedric daedric']);
  const magic = (source: number) => gearOutfit(state([item({ kind: 13, rarity: 1, at: 4, source })]), every, plain);
  assert.deepEqual([magic(0).armour.helm, magic(3).armour.helm], ['thieves', 'orcish'], "a Magic helm, its content's");
  assert.deepEqual(worn({ name: 0 }), { cuirass: 'chain' }, 'chain has no pauldrons: its cuirass alone');
  assert.deepEqual(worn({ id: 7 }), worn({ id: 8 }), 'its number does not move it');
  const named = gearOutfit(state([item({ kind: 16, rarity: 3, at: 7, named: 'tithebreaker_greaves' })]), every, plain);
  assert.deepEqual([named.armour.greaves, named.armour.boots], ['dwarven', 'dwarven'], 'its own look, dwarven');
});

test('the dye, coat and barding worn ride the outfit; the start pieces are none', () => {
  const number = (id: string) => COSMETICS.findIndex((each) => each.id === id);
  const kit = { ...state([]), worn: { dye: number('coral'), coat: number('grey'), barding: number('dawnfire') } };
  const dressed = gearOutfit(kit, wardrobe, plain);
  assert.deepEqual([dressed.dye, dressed.coat, dressed.barding], ['coral', 'grey', 'dawnfire']);
  const start = { ...state([]), worn: { dye: number('own_colours'), coat: number('bay'), barding: number('bare') } };
  const own = gearOutfit(start, wardrobe, { ...plain, dye: 'coral' });
  assert.deepEqual([own.dye, own.coat, own.barding], [null, null, null]);
});

test("a faction's cape is the formal cloak in its faction's dye, whatever its rarity", () => {
  const cape = (named: string, rarity: number) =>
    gearOutfit(state([item({ kind: 17, rarity, at: 8, named })]), wardrobe, plain);
  for (const [named, dye] of [
    ['stormcallers_cape', 'stormcaller_blue'],
    ['lamplighters_cape', 'lamplighter_gold'],
    ['veiled_cape', 'veiled_dusk'],
  ] as const) {
    assert.deepEqual(cape(named, 2).garments, ['formal_cloak'], named);
    assert.equal(cape(named, 2).dyes['formal_cloak'], dye, named);
    assert.equal(cape(named, 4).dyes['formal_cloak'], dye, named);
  }
});

/** A wardrobe that also draws the guilds' sets and the metals the factions' weapons are drawn in. */
const guilds: Wardrobe = {
  ...wardrobe,
  sets: Object.fromEntries(
    Object.entries(wardrobe.sets).map(([piece, drawn]) => [piece, [...drawn, 'fighters', 'mages', 'brotherhood']]),
  ) as unknown as Wardrobe['sets'],
  right: [...wardrobe.right, 'bow_long_iron', 'bow_long_elven', 'staff_iron', 'staff_silver'],
  left: ['shield_iron', 'shield_kite_iron', 'shield_kite_elven'],
};

test("a faction's armour is its faction's own set, each of its layers named for its faction's colour", () => {
  const dressed = gearOutfit(
    state([
      item({ id: 1, kind: 14, rarity: 3, at: 5, named: 'lamplighters_vestments' }),
      item({ id: 2, kind: 13, rarity: 3, at: 4, named: 'tithebreaker_helm', source: 5 }),
    ]),
    guilds,
    plain,
  );
  assert.deepEqual([dressed.armour.cuirass, dressed.armour.pauldrons], ['mages', 'mages']);
  assert.deepEqual([dressed.dyes['cuirass_mages'], dressed.dyes['pauldrons_mages']], ['lamplighters', 'lamplighters']);
  assert.equal(dressed.dyes['under_mages'], 'lamplighters', 'the padding under the cuirass too');
  assert.equal(dressed.armour.helm, 'knights', 'a piece of no faction keeps its own set, or the nearest drawn');
  assert.equal(Object.values(dressed.dyes).filter((dye) => dye === 'lamplighters').length, 3, 'the helm takes none');
});

test("a faction's piece on a body that lacks its set is drawn in its rarity's set, still in its faction's colour", () => {
  const vestments = state([item({ id: 1, kind: 14, rarity: 3, at: 5, named: 'lamplighters_vestments' })]);
  const dressed = gearOutfit(vestments, wardrobe, plain);
  const set = dressed.armour.cuirass ?? '';
  assert.ok(set && set !== 'mages', `drawn in ${set}`);
  for (const layer of [`cuirass_${set}`, `pauldrons_${set}`, `under_${set}`])
    assert.equal(dressed.dyes[layer], 'lamplighters', layer);
});

test("a faction's weapon is drawn in its faction's metal, its shield too, and each wears its colour", () => {
  const bow = state([item({ id: 1, kind: 8, rarity: 3, at: 3, named: 'thunderstring' })]);
  const ranged = gearOutfit(bow, guilds, plain, RANGED_SLOT);
  assert.deepEqual([ranged.right, ranged.dyes['bow_long_elven']], ['bow_long_elven', 'stormcallers']);
  const plainBow = gearOutfit(state([item({ id: 1, kind: 8, rarity: 3, at: 3 })]), guilds, plain, RANGED_SLOT);
  assert.equal(plainBow.dyes['bow_long_iron'], undefined, 'a bow of no faction wears no colour of one');
  const squall = gearOutfit(state([item({ id: 1, kind: 12, rarity: 3, at: 2, named: 'squallbreak' })]), guilds, plain);
  assert.deepEqual([squall.left, squall.dyes['shield_kite_elven']], ['shield_kite_elven', 'stormcallers']);
});

test("a smith's ware is drawn as the piece it becomes once bought: its set or clothes, its metal and its make", async () => {
  // gear_wire_tests.rs writes the player's gear at the stall, then again after each of the Armorsmith's and the
  // Weaponsmith's six wares is bought in turn, each message its length in four bytes and then itself.
  const bytes = await readFile(new URL('../../../target/protocol/gear_vended.bin', import.meta.url)).catch(() => {
    throw new Error('gear_vended.bin is not written: run `cargo test -p protocol`');
  });
  const sent: GearState[] = [];
  for (let start = 0; start < bytes.length;) {
    const length = bytes.readUInt32LE(start);
    const read = readFromRoom(new Uint8Array(bytes.subarray(start + 4, start + 4 + length)));
    if (read?.kind === 'gear') sent.push(read);
    start += 4 + length;
  }
  assert.equal(sent.length, 13, 'before any is bought, and after each of twelve');
  const looks = (piece: GearItem) => {
    const slot = piece.bucket;
    const wearing = state([{ ...piece, at: WORN + slot }]);
    return { hands: weaponLook(piece), outfit: gearOutfit(wearing, every, plain, slot <= RANGED_SLOT ? slot : MELEE) };
  };
  for (const [place, before] of sent.slice(0, -1).entries()) {
    const ware = before.wares[place];
    const bought = sent[place + 1]?.items.find((each) => !before.items.some((held) => held.id === each.id));
    assert.ok(ware && bought, `ware ${place} bought`);
    assert.deepEqual(looks(ware), looks(bought), `ware ${place}, a ${KINDS[ware.kind]}`);
  }
});
