import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FightEvent } from '../network/messages.ts';
import { EVENT, HOW } from './cues.ts';
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

const landed = (striker: number): FightEvent => ({ ...clash(EVENT.hit), striker, amount: 5 });

test("a spell that lands bursts in its caster's Art, never in the weapon drawn", () => {
  const sparks = new Sparks(() => 0.5);
  const spell = { ...landed(STRIKER), how: HOW.spell };
  sparks.struck([spell], where, { player: STRIKER, look: 2 });
  assert.equal(sparks.flying.length, 0, 'no Art known, no burst');
  sparks.struck([spell], where, { player: STRIKER, look: 2, spellLook: () => 1 });
  assert.equal(sparks.flying.length, 12);
  assert.ok(
    sparks.flying.every((spark) => spark.look === 1),
    'in Blaze, though the sword drawn is Volt',
  );
});

test("the player's own landed blow bursts in its element", () => {
  const sparks = new Sparks(() => 0.5);
  sparks.struck([landed(STRIKER)], where, { player: STRIKER, look: 1 });
  assert.equal(sparks.flying.length, 12);
  assert.ok(sparks.flying.every((spark) => spark.look === 1));
  assert.ok(
    sparks.flying.every((spark) => spark.at[2] > 1 && spark.at[0] > 0 && spark.at[0] < 2),
    'at the clash',
  );
});

test("another's blow and a plain weapon burst nothing", () => {
  const sparks = new Sparks(() => 0.5);
  sparks.struck([landed(DEFENDER)], where, { player: STRIKER, look: 1 });
  sparks.struck([landed(STRIKER)], where, { player: STRIKER, look: 0 });
  sparks.struck([{ ...landed(STRIKER), amount: 0 }], where, { player: STRIKER, look: 2 });
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
