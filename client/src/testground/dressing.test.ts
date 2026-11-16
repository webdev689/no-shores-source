import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { dressFrom, figureOf, lookOutfit, rampsOf, wardrobeOf } from './dressing.ts';

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
