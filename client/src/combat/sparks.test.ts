import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SPARKS_LONGEST_S, Sparks } from './sparks.ts';

test('sparks fall as they fly and are gone once their life is over', () => {
  const sparks = new Sparks(() => 0.5);
  sparks.burst([0, 0, 1], [1, 0], 8);
  const rising = sparks.flying[0]?.velocity[2] ?? 0;
  sparks.update(0.1);
  assert.ok((sparks.flying[0]?.velocity[2] ?? 0) < rising, 'gravity pulls them down');
  sparks.update(SPARKS_LONGEST_S);
  assert.equal(sparks.flying.length, 0);
});

test('embers rise and motes hang', () => {
  const still = [0, 0, 0] as const;
  const sparks = new Sparks(() => 0.5);
  sparks.flying = [
    { at: still, velocity: still, age: 0, life: 1 },
    { at: still, velocity: still, age: 0, life: 1, look: 1 },
    { at: still, velocity: still, age: 0, life: 1, look: 3 },
  ];
  sparks.update(0.1);
  const [plain, ember, mote] = sparks.flying;
  assert.ok((ember?.velocity[2] ?? 0) > (plain?.velocity[2] ?? 0), 'an ember is held up');
  assert.equal(mote?.at[2], 0, 'a cosmic mote hangs');
});

test('a shot in an element trails motes of it, about thirty a second', () => {
  const sparks = new Sparks(() => 0.5);
  sparks.trail([0, 0, 1], 2, 1);
  assert.equal(sparks.flying.length, 30);
  assert.ok(sparks.flying.every((spark) => spark.look === 2 && Math.hypot(...spark.velocity) < 1));
});
