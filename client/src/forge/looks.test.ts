import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { hipTwin, mirroredGear } from './looks.ts';

const drawn = {
  shirt_long_v: ['walk', 'idle'],
  sheath_sword: ['walk', 'idle'],
  sheath_sword_l: ['walk'],
  scabbard_dagger_iron: ['walk'],
  scabbard_dagger_iron_l: ['walk'],
  quiver: ['walk'],
};

test('a hip piece’s twin hangs at the other hip, and back', () => {
  assert.equal(hipTwin('sheath_sword'), 'sheath_sword_l');
  assert.equal(hipTwin('scabbard_dagger_iron_l'), 'scabbard_dagger_iron');
  assert.equal(hipTwin('sheath_staff_iron'), null);
});

test('a mirrored view wears each hip piece at the other hip, so the mirror lays it back at its own', () => {
  assert.deepEqual(mirroredGear(['shirt_long_v', 'sheath_sword', 'scabbard_dagger_iron'], 'walk', drawn, false), [
    'shirt_long_v',
    'sheath_sword_l',
    'scabbard_dagger_iron_l',
  ]);
});

test('no twin where something is in hand, a piece has none, or the twin is not drawn in the move', () => {
  assert.equal(mirroredGear(['sheath_sword'], 'walk', drawn, true), null);
  assert.equal(mirroredGear(['sheath_sword', 'quiver'], 'walk', drawn, false), null);
  assert.equal(mirroredGear(['sheath_sword'], 'idle', drawn, false), null);
  assert.equal(mirroredGear(['shirt_long_v'], 'walk', drawn, false), null);
});
