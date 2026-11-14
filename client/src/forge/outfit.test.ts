import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { type Outfit, outfitLayers, wornWeapon } from './outfit.ts';

const LAYERS = [
  'face_iron',
  'face_hooded',
  'helm_iron',
  'cuirass_iron',
  'greaves_iron',
  'boots_iron',
  'pauldrons_iron',
  'under_iron',
  'shirt_long_v',
  'long_skirt',
  'long_skirt_drape',
  'casual_cloak_hooded_drape',
  'casual_cloak_hooded_plated',
  'casual_cloak_plated',
  'casual_cloak_drape',
  'hair_long',
  'hair_long_plated',
  'hair_long_cloaked',
  'hair_long_plated_cloaked',
  'hair_crop',
  'sword_iron',
  'sheath_sword',
  'scabbard_sword',
  'shield_kite_iron',
  'slung_shield_kite_iron',
  'bow_long_iron',
  'sheath_bow_long_iron',
  'quiver',
];
const drawn = Object.fromEntries(LAYERS.map((layer) => [layer, ['idle']]));
const bare: Outfit = { armour: {}, garments: [], right: null, left: null, drawn: false, hair: null };

test('a helm shades the face, lays a hood down and hides the hair', () => {
  const outfit = {
    ...bare,
    armour: { helm: 'iron' },
    garments: ['casual_cloak_hooded'],
    hair: { style: 'long', colour: 'red' },
  };
  const { gear, hair } = outfitLayers(outfit, drawn);
  assert.deepEqual(gear, ['face_iron', 'helm_iron', 'casual_cloak_drape']);
  assert.equal(hair, null);
});

test('a raised hood shades the face; over plate the cloak hangs clear of it', () => {
  const outfit = { ...bare, armour: { cuirass: 'iron' }, garments: ['shirt_long_v', 'casual_cloak_hooded'] };
  assert.deepEqual(outfitLayers(outfit, drawn).gear, [
    'cuirass_iron',
    'shirt_long_v',
    'face_hooded',
    'casual_cloak_hooded_plated',
  ]);
});

test('armour with nothing on the chest has its padding; a skirt to the ankles hides the greaves', () => {
  assert.deepEqual(outfitLayers({ ...bare, armour: { cuirass: 'iron', greaves: 'iron' } }, drawn).gear, [
    'cuirass_iron',
    'greaves_iron',
    'under_iron',
  ]);
  const skirted = { ...bare, armour: { greaves: 'iron', boots: 'iron' }, garments: ['long_skirt'] };
  assert.deepEqual(outfitLayers(skirted, drawn).gear, ['boots_iron', 'long_skirt', 'long_skirt_drape']);
});

test('hair hangs clear of plate and over a cloak; a crop is always itself', () => {
  const plated = {
    ...bare,
    armour: { cuirass: 'iron' },
    garments: ['shirt_long_v'],
    hair: { style: 'long', colour: 'red' },
  };
  assert.deepEqual(outfitLayers(plated, drawn).hair, { layer: 'hair_long_plated', colour: 'red' });
  const cloaked = { ...plated, garments: ['casual_cloak'] };
  assert.deepEqual(outfitLayers(cloaked, drawn).hair, { layer: 'hair_long_plated_cloaked', colour: 'red' });
  assert.deepEqual(outfitLayers({ ...bare, hair: { style: 'crop', colour: 'black' } }, drawn).hair, {
    layer: 'hair_crop',
    colour: 'black',
  });
});

test('weapons put away are worn on the body; drawn, they are in hand last, over everything', () => {
  const armed = { ...bare, right: 'sword_iron', left: 'shield_kite_iron' };
  assert.deepEqual(outfitLayers(armed, drawn).gear, ['sheath_sword', 'slung_shield_kite_iron']);
  assert.deepEqual(outfitLayers({ ...armed, drawn: true }, drawn).gear, [
    'scabbard_sword',
    'sword_iron',
    'shield_kite_iron',
  ]);
  assert.deepEqual(wornWeapon('bow_long_iron', false), ['sheath_bow_long_iron', 'quiver']);
  assert.deepEqual(wornWeapon('mace_iron', false), []);
  assert.deepEqual(wornWeapon('dagger_iron_l', true), ['scabbard_dagger_iron_l']);
});
