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

test('each spell is kept as the room last sent it, and goes when the room drops it', () => {
  const effects = new SpellEffects();
  effects.take([orb(1, 0)]);
  effects.take([orb(1, 2), orb(3, 5)]);
  assert.deepEqual(effects.spells.get(1)?.at, [2, 0, 1]);
  effects.take([orb(3, 6)]);
  assert.deepEqual([...effects.spells.keys()], [3]);
  assert.equal(effects.arts.get(2), 1, 'its caster keeps the Art it last cast in');
});
