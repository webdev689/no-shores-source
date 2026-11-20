import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { dressFrom, figureOf, lookOutfit, rampsOf, wardrobeOf } from './dressing.ts';
import factions from '../../../content/gear/factions.json' with { type: 'json' };
import { COSMETICS, cosmeticRamp, factionRamp } from '../forge/cosmetics.ts';

const LAYERS = [
  'body',
  'body_khajiit',
  'hair_crop',
  'hair_shoulder',
  'cuirass_iron',
  'helm_iron',
  'boots_iron',
  'boots',
  'boots_laced',
  'face_iron',
  'under_iron',
  'casual_cloak_drape',
  'casual_cloak_plated',
  'shirt_long_v',
  'sword_iron',
  'sword_iron_l',
  'shield_kite_iron',
  'torch_l',
  'sheath_sword',
  'mace_iron',
  'torch_l',
  'horse',
  'horse_warhorse',
];
const drawn = Object.fromEntries(LAYERS.map((layer) => [layer, ['idle']]));
const outfit = { armour: {}, garments: [], dyes: {}, right: null, left: null, drawn: false, hair: null };

test('a wardrobe sorts a body layers into armour sets, garments and what each hand holds', () => {
  const wardrobe = wardrobeOf('male', drawn);
  assert.deepEqual(wardrobe.sets.cuirass, ['iron']);
  assert.deepEqual(wardrobe.sets.boots, ['iron']);
  assert.deepEqual(wardrobe.garments, ['boots', 'boots_laced', 'casual_cloak', 'shirt_long_v']);
  assert.deepEqual(wardrobe.right, ['mace_iron', 'sword_iron']);
  assert.deepEqual(wardrobe.left, ['shield_kite_iron', 'sword_iron_l', 'torch_l', 'lantern']);
  assert.deepEqual(wardrobe.hairStyles, ['crop', 'shoulder']);
});

test('a Felid wears its own body; a Human keeps its tone', () => {
  assert.deepEqual(figureOf({ body: 'male', race: 'felid', tone: 0.4, outfit }, drawn), {
    body: 'male',
    race: 'khajiit',
    tone: null,
    hair: null,
    gear: [],
  });
  assert.equal(figureOf({ body: 'male', race: 'human', tone: 0.4, outfit }, drawn).tone, 0.4);
});

test('a dressed look becomes an outfit: armour by piece, garments without their hangs, its weapon drawn', () => {
  const look = {
    body: 'male',
    gear: ['face_iron', 'helm_iron', 'cuirass_iron', 'casual_cloak_plated', 'under_iron'],
    weapon: 'sword',
    dyes: { casual_cloak_plated: 2 },
  };
  assert.deepEqual(lookOutfit(look, outfit), {
    armour: { helm: 'iron', cuirass: 'iron' },
    garments: ['casual_cloak'],
    dyes: { casual_cloak: 'Red' },
    right: 'sword',
    left: null,
    drawn: true,
    hair: null,
  });
});

test('metal layers take their set metal; garments their dye, plain until one is chosen', () => {
  const ramp = (light: number) => [[light, light, light] as const];
  const table = {
    palette: [],
    clothing: { Red: ramp(1), LightBrown: ramp(2) },
    armour: { Iron: ramp(3), Steel: ramp(4) },
  };
  const looks = {
    bodies: {},
    dye: ['cuirass_iron', 'under_leather', 'shirt_long_v', 'casual_cloak_plated'],
    metal: ['cuirass_iron', 'under_leather'],
  };
  const gear = ['cuirass_iron', 'under_leather', 'shirt_long_v', 'casual_cloak_plated', 'sword_iron'];
  const dressed = { ...outfit, dyes: { casual_cloak: 'Red' } };
  assert.deepEqual(rampsOf(gear, dressed, looks, table), {
    cuirass_iron: ramp(3),
    under_leather: ramp(4),
    shirt_long_v: ramp(2),
    casual_cloak_plated: ramp(1),
  });
});

test('another player’s dress is taken only when it has a dress’s shape', () => {
  const dress = { body: 'male', race: 'human', tone: 0.3, outfit: { ...outfit, right: 'sword_iron', drawn: true } };
  assert.deepEqual(dressFrom(JSON.stringify(dress)), dress);
  for (const broken of [
    'not json',
    JSON.stringify({ ...dress, race: 'toString' }),
    JSON.stringify({ ...dress, tone: '0.3' }),
    JSON.stringify({ ...dress, outfit: { ...outfit, garments: 'shirt' } }),
    JSON.stringify({ ...dress, outfit: { ...outfit, armour: { tail: 'iron' } } }),
    JSON.stringify({ ...dress, outfit: { ...outfit, right: 'x'.repeat(65) } }),
    JSON.stringify({ ...dress, outfit: { ...outfit, hair: { style: 'crop' } } }),
  ])
    assert.equal(dressFrom(broken), null, broken.slice(0, 60));
});

test('a dye worn takes every armour piece and garment, never a weapon, a shield, the cloak or the hair', () => {
  const ramp = (light: number) => [[light, light, light] as const];
  const table = { palette: [], clothing: { LightBrown: ramp(2), Red: ramp(1) }, armour: { Iron: ramp(3) } };
  const looks = {
    bodies: {},
    dye: ['cuirass_iron', 'helm_iron', 'shirt_long_v', 'casual_cloak_plated', 'shield_kite_iron', 'pauldrons_chain'],
    metal: ['cuirass_iron', 'helm_iron', 'shield_kite_iron', 'sheath_bow_long_iron', 'under_iron'],
  };
  const gear = [
    'cuirass_iron',
    'under_iron',
    'helm_iron',
    'pauldrons_chain',
    'shirt_long_v',
    'casual_cloak_plated',
    'shield_kite_iron',
    'sheath_bow_long_iron',
    'sword_iron',
    'hair_long',
  ];
  const armour = { cuirass: 'iron', helm: 'iron', pauldrons: 'chain' } as const;
  const dyed = rampsOf(gear, { ...outfit, armour, dyes: { casual_cloak: 'Red' }, dye: 'coral' }, looks, table);
  const coral = dyed['cuirass_iron'];
  assert.equal(coral?.length, 16, 'the dye is a ramp of 16');
  for (const layer of ['helm_iron', 'pauldrons_chain', 'shirt_long_v', 'under_iron'])
    assert.equal(dyed[layer], coral, layer);
  assert.deepEqual(dyed['casual_cloak_plated'], ramp(1), 'the cloak keeps its own dye');
  assert.deepEqual(dyed['shield_kite_iron'], ramp(3), 'the shield keeps its metal');
  for (const layer of ['sword_iron', 'hair_long']) assert.equal(dyed[layer], undefined, layer);
  // Own Colours keeps every set's own metal.
  assert.deepEqual(rampsOf(gear, { ...outfit, armour, dye: null }, looks, table)['cuirass_iron'], ramp(3));
});

test("a coat is the ridden horse's ramp, and a cape's cosmetic dye is its cloak's", () => {
  const table = { palette: [], clothing: {}, armour: {} };
  const looks = { bodies: {}, dye: ['formal_cloak_drape'], metal: [] };
  const coated = rampsOf(
    ['formal_cloak_drape'],
    { ...outfit, coat: 'grey', dyes: { formal_cloak: 'stormcaller_blue' } },
    looks,
    table,
  );
  assert.equal(coated['horse']?.length, 16);
  assert.deepEqual(coated['horse'], cosmeticRamp('grey', table.palette), 'the coat ramp');
  assert.deepEqual(
    coated['formal_cloak_drape'],
    cosmeticRamp('stormcaller_blue', table.palette),
    "the Stormcallers' blue",
  );
  assert.equal(rampsOf([], { ...outfit, coat: null }, looks, table)['horse'], undefined, 'Bay keeps its own');
});

test('a barding worn is stacked over the horse', () => {
  const figure = figureOf(
    { body: 'male', race: 'human', tone: 0.4, outfit: { ...outfit, barding: 'ember_plate' } },
    drawn,
  );
  assert.equal(figure.barding, 'horse_warhorse');
  assert.equal(figureOf({ body: 'male', race: 'human', tone: 0.4, outfit }, drawn).barding, undefined);
});

test('a barding is in the figure only for a move that draws the horse', () => {
  const dress = { body: 'male', race: 'human', tone: 0.4, outfit: { ...outfit, barding: 'ember_plate' } } as const;
  const ridden = { ...drawn, horse: ['horseidle'] };
  assert.equal(figureOf(dress, ridden, 'horseidle').barding, 'horse_warhorse');
  assert.equal(figureOf(dress, ridden, 'idle').barding, undefined, 'standing, the rider has no horse under them');
});

test('a dress is read back with its dye, coat and barding; a cosmetic of the wrong kind or none such is refused', () => {
  const dress = {
    body: 'male',
    race: 'human',
    tone: 0.3,
    outfit: { ...outfit, dye: 'coral', coat: 'grey', barding: 'dawnfire' },
  };
  assert.deepEqual(dressFrom(JSON.stringify(dress)), dress);
  const bare = { ...dress, outfit: { ...outfit, dye: null, coat: null, barding: null } };
  assert.deepEqual(dressFrom(JSON.stringify(bare)), bare);
  for (const broken of [
    { dye: 'grey' },
    { coat: 'coral' },
    { barding: 'horse_warhorse' },
    { dye: 'nonsense' },
    { coat: 7 },
    { barding: { id: 'dawnfire' } },
  ])
    assert.equal(
      dressFrom(JSON.stringify({ ...dress, outfit: { ...outfit, ...broken } })),
      null,
      JSON.stringify(broken),
    );
});

test("a faction's piece wears its faction's own colour over any dye worn, and put away still wears it", () => {
  const ramp = (light: number) => [[light, light, light] as const];
  const table = { palette: [], clothing: {}, armour: { Iron: ramp(3), Mages: ramp(5), Elven: ramp(6) } };
  const layers = ['cuirass_mages', 'under_mages', 'helm_iron', 'sheath_bow_long_elven'];
  const looks = { bodies: {}, dye: layers, metal: layers };
  const dyes = { cuirass_mages: 'lamplighters', under_mages: 'lamplighters', bow_long_elven: 'stormcallers' };
  const armour = { cuirass: 'mages', helm: 'iron' } as const;
  const dyed = rampsOf(layers, { ...outfit, armour, dyes, dye: 'coral' }, looks, table);
  assert.deepEqual(dyed['cuirass_mages'], factionRamp('lamplighters', table.palette));
  assert.deepEqual(dyed['under_mages'], factionRamp('lamplighters', table.palette), 'the padding under it too');
  assert.deepEqual(
    dyed['sheath_bow_long_elven'],
    factionRamp('stormcallers', table.palette),
    'on the back, as in hand',
  );
  assert.deepEqual(dyed['helm_iron'], cosmeticRamp('coral', table.palette), 'the rest take the dye worn');
});

test("each faction's own colour is one no dye sells, and no other faction's", () => {
  const looks = factions.factions.map((faction) => faction.gear.look.join());
  assert.equal(new Set(looks).size, factions.factions.length);
  for (const cosmetic of COSMETICS) assert.ok(!looks.includes(cosmetic.look.join()), cosmetic.id);
});
