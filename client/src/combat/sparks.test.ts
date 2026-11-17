import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FightEvent } from '../network/messages.ts';
import { EVENT } from './cues.ts';
import { SPARKS_LONGEST_S, Sparks } from './sparks.ts';

const STRIKER = 40;
const DEFENDER = 1;
const clash = (kind: number): FightEvent => ({
  tick: 0n,
  kind,
  how: 1,
  striker: STRIKER,
  defender: DEFENDER,
  amount: 0,
  stroke: 0,
});
const where = (id: number) => (id === STRIKER ? ([2, 0, 0] as const) : id === DEFENDER ? ([0, 0, 0] as const) : null);

test('a parry and a block throw sparks between the two, toward the striker; a hit and a dodge throw none', () => {
  const sparks = new Sparks(() => 0.5);
  sparks.struck([clash(EVENT.hit), clash(EVENT.dodged)], where);
  assert.equal(sparks.flying.length, 0);
  sparks.struck([clash(EVENT.parried), clash(EVENT.blocked)], where);
  assert.ok(sparks.flying.length > 0);
  for (const spark of sparks.flying) {
    assert.ok(spark.at[0] > 0 && spark.at[0] < 2, 'between the defender and the striker');
    assert.ok(spark.at[2] > 1, "at a guard's height");
    assert.ok(spark.velocity[0] > 0, 'thrown toward the striker');
  }
});

test('sparks fall as they fly and are gone once their life is over', () => {
  const sparks = new Sparks(() => 0.5);
  sparks.struck([clash(EVENT.parried)], where);
  const rising = sparks.flying[0]?.velocity[2] ?? 0;
  sparks.update(0.1);
  assert.ok((sparks.flying[0]?.velocity[2] ?? 0) < rising, 'gravity pulls them down');
  sparks.update(SPARKS_LONGEST_S);
  assert.equal(sparks.flying.length, 0);
});

test('a clash between fighters the page does not know throws nothing', () => {
  const sparks = new Sparks(() => 0.5);
  sparks.struck([{ ...clash(EVENT.parried), striker: 99 }], where);
  assert.equal(sparks.flying.length, 0);
});
