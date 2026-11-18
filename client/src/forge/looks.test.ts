import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { hipTwin, mirroredGear } from './looks.ts';

/** As the forge draws them: a sword and a dagger in the left fist through the run but not the walk, no left shield. */
const drawn = {
  shirt_long_v: ['walk', 'idle', 'run'],
  sheath_sword: ['walk', 'idle', 'run'],
  sheath_sword_l: ['walk', 'run'],
  scabbard_dagger_iron: ['walk'],
  scabbard_dagger_iron_l: ['walk'],
  quiver: ['walk', 'run'],
  sword_iron: ['walk', 'run'],
  sword_iron_l: ['run'],
  dagger_iron: ['run'],
  dagger_iron_l: ['run'],
  shield_round_iron: ['run'],
};
const NOTHING_HELD = [null, null];

test('a hip piece’s twin hangs at the other hip, and back', () => {
  assert.equal(hipTwin('sheath_sword'), 'sheath_sword_l');
  assert.equal(hipTwin('scabbard_dagger_iron_l'), 'scabbard_dagger_iron');
  assert.equal(hipTwin('sheath_staff_iron'), null);
});

test('a mirrored view wears each hip piece at the other hip, so the mirror lays it back at its own', () => {
  assert.deepEqual(
    mirroredGear(['shirt_long_v', 'sheath_sword', 'scabbard_dagger_iron'], 'walk', drawn, NOTHING_HELD),
    ['shirt_long_v', 'sheath_sword_l', 'scabbard_dagger_iron_l'],
  );
});

test('a weapon drawn in the other fist in the move is held there, so the mirror lays it back in its own', () => {
  assert.deepEqual(mirroredGear(['sheath_sword', 'sword_iron'], 'run', drawn, ['sword_iron', null]), [
    'sheath_sword_l',
    'sword_iron_l',
  ]);
  // A pair swaps fists together: each blade in the other's.
  assert.deepEqual(mirroredGear(['sword_iron', 'dagger_iron_l'], 'run', drawn, ['sword_iron', 'dagger_iron_l']), [
    'sword_iron_l',
    'dagger_iron',
  ]);
});

test("a fist's piece whose twin is not drawn leaves both fists to the mirror, and the hips keep theirs", () => {
  // The walk draws no sword in the left fist: the sheath stays at its hip, the sword goes to the mirror.
  assert.deepEqual(mirroredGear(['sheath_sword', 'sword_iron'], 'walk', drawn, ['sword_iron', null]), [
    'sheath_sword_l',
    'sword_iron',
  ]);
  // No shield is drawn in the right fist, so the sword stays beside it rather than share its fist.
  assert.deepEqual(
    mirroredGear(['sword_iron', 'shield_round_iron'], 'run', drawn, ['sword_iron', 'shield_round_iron']),
    ['sword_iron', 'shield_round_iron'],
  );
});

test('a hip piece with no twin, or a twin not drawn in the move, leaves every hip to the mirror', () => {
  assert.deepEqual(mirroredGear(['sheath_sword', 'quiver'], 'walk', drawn, NOTHING_HELD), ['sheath_sword', 'quiver']);
  assert.deepEqual(mirroredGear(['sheath_sword'], 'idle', drawn, NOTHING_HELD), ['sheath_sword']);
  // The quiver holds the hips, never the fists.
  assert.deepEqual(mirroredGear(['quiver', 'sheath_sword', 'sword_iron'], 'run', drawn, ['sword_iron', null]), [
    'quiver',
    'sheath_sword',
    'sword_iron_l',
  ]);
});
