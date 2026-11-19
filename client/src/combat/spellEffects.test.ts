import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SeenSpell } from '../network/artMessages.ts';
import { SpellEffects } from './spellEffects.ts';

const orb = (id: number, x: number): SeenSpell => ({
  id,
  kind: 1,
  caster: 2,
  art: 1,
  at: [x, 0, 1],
  heads: null,
  seeks: 9,
  age: 10,
  life: 240,
  radius: 30,
});

test('each spell is kept with where it was the snapshot before, glides between the two, and goes when the room drops it', () => {
  const effects = new SpellEffects();
  effects.take([orb(1, 0)], 1);
  assert.equal(effects.spells.get(1)?.before, null, 'new: nowhere before');
  effects.take([orb(1, 2), orb(3, 5)], 2);
  const kept = effects.spells.get(1);
  assert.ok(kept);
  assert.deepEqual([kept.before, kept.ticks], [[0, 0, 1], 2]);
  assert.deepEqual(SpellEffects.glided(kept, 0.5), [1, 0, 1]);
  effects.take([orb(3, 6)], 1);
  assert.deepEqual([...effects.spells.keys()], [3]);
});
