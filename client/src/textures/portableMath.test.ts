import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { atan2, cos, exp, hypot, log, pow, sin } from './portableMath.ts';

/** A seeded stream of doubles in [0, 1), fine to the last bit. */
function doubles(seed: number): () => number {
  let state = seed;
  const next = (): number => {
    state = (Math.imul(state, 1103515245) + 12345) >>> 0;
    return state / 4294967296;
  };
  return () => next() + next() / 4294967296;
}

test('known values come out exact', () => {
  assert.equal(sin(0), 0);
  assert.equal(cos(0), 1);
  assert.equal(exp(0), 1);
  assert.equal(exp(1), Math.E);
  assert.equal(log(1), 0);
  assert.equal(pow(2, 10), 1024);
  assert.equal(pow(0.3, 2), 0.3 * 0.3);
  assert.equal(pow(0, 0.35), 0);
  assert.equal(hypot(3, 4), 5);
  assert.equal(hypot(0, 0, 1), 1);
  assert.equal(atan2(1, 1), Math.PI / 4);
  assert.equal(atan2(0, -1), Math.PI);
});

test('each function gives the bits V8 gives, across the ranges the painters reach', () => {
  const next = doubles(7);
  for (let k = 0; k < 20000; k++) {
    const angle = (next() * 2 - 1) * [1, 10, 100, 6e4][k % 4];
    assert.ok(Object.is(sin(angle), Math.sin(angle)), `sin(${angle})`);
    assert.ok(Object.is(cos(angle), Math.cos(angle)), `cos(${angle})`);
    const power = (next() * 2 - 1) * [1, 20][k % 2];
    assert.ok(Object.is(exp(power), Math.exp(power)), `exp(${power})`);
    const value = next() * [1, 1e-6, 100][k % 3];
    assert.ok(Object.is(log(value), Math.log(value)), `log(${value})`);
    const exponent = [0.35, 0.7, 3, 4, 5, 8, 10, 20, next() * 20][k % 9];
    assert.ok(Object.is(pow(value, exponent), Math.pow(value, exponent)), `pow(${value}, ${exponent})`);
    const y = next() * 2 - 1;
    const x = next() * 2 - 1;
    assert.ok(Object.is(atan2(y, x), Math.atan2(y, x)), `atan2(${y}, ${x})`);
    assert.ok(Object.is(hypot(x * 70, y * 70), Math.hypot(x * 70, y * 70)), `hypot(${x * 70}, ${y * 70})`);
    assert.ok(Object.is(hypot(x * 3, y, 1), Math.hypot(x * 3, y, 1)), `hypot(${x * 3}, ${y}, 1)`);
  }
});
