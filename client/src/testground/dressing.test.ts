import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { figureOf, lookOutfit, wardrobeOf } from './dressing.ts';

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
  'sheath_sword',
  'mace_iron',
];
const drawn = Object.fromEntries(LAYERS.map((layer) => [layer, ['idle']]));
const outfit = { armour: {}, garments: [], right: null, left: null, drawn: false, hair: null };

test('a wardrobe sorts a body layers into armour sets, garments and what each hand holds', () => {
  const wardrobe = wardrobeOf('male', drawn);
  assert.deepEqual(wardrobe.sets.cuirass, ['iron']);
  assert.deepEqual(wardrobe.sets.boots, ['iron']);
  assert.deepEqual(wardrobe.garments, ['boots', 'boots_laced', 'casual_cloak', 'shirt_long_v']);
  assert.deepEqual(wardrobe.right, ['mace_iron', 'sword_iron']);
  assert.deepEqual(wardrobe.left, ['shield_kite_iron', 'sword_iron_l']);
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
  };
  assert.deepEqual(lookOutfit(look, outfit), {
    armour: { helm: 'iron', cuirass: 'iron' },
    garments: ['casual_cloak'],
    right: 'sword',
    left: null,
    drawn: true,
    hair: null,
  });
});
