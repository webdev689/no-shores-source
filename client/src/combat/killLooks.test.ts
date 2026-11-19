import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GlowLook } from '../elementGlow.ts';
import type { FightEvent } from '../network/messages.ts';
import { Bits } from './bits.ts';
import { EVENT } from './cues.ts';
import { KNOCK } from './flashes.ts';
import { BLAZE, CHIP_THROW, COSMIC, KillLooks, VOLT, chainOf, restingAt } from './killLooks.ts';

const FRAME = 1 / 60;
const EYE = [0, 6, 1.8] as const;
const kill = (defender = 1): FightEvent => ({
  tick: 0n,
  kind: EVENT.killed,
  how: 1,
  striker: 40,
  defender,
  amount: 0,
  stroke: 0,
});
const where = (id: number) => (id === 40 ? ([0, 2, 0] as const) : id === 1 ? ([0, 0, 0] as const) : null);

/** A kill in `look`, with the dissolves it asked for. */
function killed(look: GlowLook, foes: readonly (readonly [number, number, number])[] = []) {
  const bits = new Bits(() => 0.5);
  const looks = new KillLooks(bits);
  const dissolved: [number, GlowLook][] = [];
  const told = {
    where,
    lookOf: () => look,
    foesBut: () => foes,
    dissolve: (id: number, shown: GlowLook) => dissolved.push([id, shown]),
  };
  looks.update([kill()], 0, told);
  const step = (frames: number) => looks.update([], frames * FRAME, told);
  const laid = () => {
    const out: number[] = [];
    looks.lay(out, EYE);
    return out;
  };
  return { bits, looks, dissolved, step, laid };
}

test('a body slain comes to rest slid along the blow, as its figure is drawn', () => {
  const rest = restingAt([0, 0, 0], [0, 2, 0]);
  assert.ok(Math.abs(rest[1] + KNOCK.killed) < 1e-9 && rest[0] === 0);
  assert.deepEqual(restingAt([1, 1, 0], null), [1, 1, 0]);
});

test("Volt's chain leaps to the nearest foe within its reach, then on from there, each once", () => {
  const foes = [
    [5, 0, 0],
    [2, 0, 0],
    [20, 0, 0],
  ] as const;
  assert.deepEqual(chainOf([0, 0, 0], foes), [
    [2, 0, 0],
    [5, 0, 0],
  ]);
  assert.deepEqual(chainOf([0, 0, 0], [[VOLT.reach + 1, 0, 0]]), [], 'none past its reach');
});

test('every kill throws chips and a dust ring; a plain one asks no dissolve, leaving its own to the figure', () => {
  const { bits, dissolved, laid, step } = killed(0);
  assert.equal(bits.flying.length, CHIP_THROW.count);
  assert.ok(laid().length > 0, 'the dust ring');
  assert.deepEqual(dissolved, []);
  step(20);
  assert.equal(laid().length, 0, 'gone');
});

test('Blaze dissolves its body at once, sheds embers as it heats, bursts, and leaves ash that smoulders 10 s', () => {
  const { bits, dissolved, laid, step } = killed(1);
  assert.deepEqual(dissolved, [[1, 1]]);
  const chips = bits.flying.length;
  step(BLAZE.ignite - 1);
  assert.ok(bits.flying.length > chips, 'embers off the body');
  step(1);
  assert.ok(bits.flying.length >= BLAZE.embers, 'the burst');
  step(5 / FRAME);
  bits.flying.length = 0;
  assert.ok(laid().length > 0, 'ash at 5 s');
  step(6 / FRAME);
  assert.equal(laid().length, 0, 'gone after 10 s');
});

test("Volt's bolts leap the chain, each throwing sparks where it lands", () => {
  const { bits, dissolved, step } = killed(2, [[3, 0, 0]]);
  assert.deepEqual(dissolved, [[1, 2]]);
  assert.equal(bits.flying.length, CHIP_THROW.count + 2 * VOLT.sparks, 'at the body and its first leap');
  step(1);
});

test('Cosmic draws a ring in over its frames, then pops in stars and leaves a swirl', () => {
  const { bits, dissolved, laid, step } = killed(3);
  assert.deepEqual(dissolved, [[1, 3]]);
  step(COSMIC.frames - 1);
  const before = bits.flying.length;
  step(1);
  assert.equal(bits.flying.length - before, COSMIC.stars);
  step(1 / FRAME);
  bits.flying.length = 0;
  assert.ok(laid().length > 0, 'its swirl at a second');
});
