import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BLEED_WAIT,
  Bleeding,
  type BodySeen,
  POOL_SIZE,
  POOL_SPREAD,
  bleedDrops,
  bleedShare,
  poolSizeAt,
} from './bleeding.ts';

const body = (health: number, more: Partial<BodySeen> = {}): BodySeen => ({
  key: 'foe',
  feet: [0, 0, 0],
  health,
  healthMax: 100,
  dead: false,
  ...more,
});

test('a body bleeds below half its health, ramping to all at one percent', () => {
  assert.equal(bleedShare(50, 100), 0);
  assert.equal(bleedShare(1, 100), 1);
  assert.ok(Math.abs(bleedShare(25.5, 100) - 0.5) < 1e-9);
  assert.equal(bleedDrops(0), 0);
  assert.equal(bleedDrops(0.01), 1);
  assert.equal(bleedDrops(1), 6);
});

test('a wounded body drips every two to five seconds', () => {
  const ledger = new Bleeding(() => 0);
  const drips = (seconds: number) => {
    let count = 0;
    for (let t = 0; t < seconds; t += 0.1)
      count += ledger.tick(0.1, [body(10)]).filter((done) => done.kind === 'drip').length;
    return count;
  };
  assert.equal(drips(BLEED_WAIT.min - 0.15), 0);
  assert.equal(drips(0.2), 1);
});

test('a walking body leaves a step every stride, and a teleport is no walk', () => {
  const ledger = new Bleeding(() => 0.5);
  ledger.tick(0.1, [body(100)]);
  const steps = ledger.tick(0.1, [body(100, { feet: [1.5, 0, 0] })]).filter((done) => done.kind === 'step');
  assert.equal(steps.length, 2);
  const jumped = ledger.tick(0.1, [body(100, { feet: [100, 0, 0] })]).filter((done) => done.kind === 'step');
  assert.equal(jumped.length, 0);
});

test('a body seen dying pools once; one first seen dead never does', () => {
  const ledger = new Bleeding(() => 0.5);
  ledger.tick(0.1, [body(10)]);
  const pools = (key: string) =>
    ledger.tick(0.1, [body(0, { key, dead: true })]).filter((done) => done.kind === 'pool').length;
  assert.equal(pools('foe'), 1);
  assert.equal(pools('foe'), 0);
  assert.equal(pools('long dead'), 0);
});

test("a corpse's pool spreads from a body's width to a metre and a half in eight steps", () => {
  assert.equal(poolSizeAt(0), POOL_SIZE.start);
  assert.equal(poolSizeAt(POOL_SPREAD / 8 - 0.01), POOL_SIZE.start);
  assert.ok(poolSizeAt(POOL_SPREAD / 8) > POOL_SIZE.start);
  assert.equal(poolSizeAt(POOL_SPREAD), POOL_SIZE.end);
  assert.equal(poolSizeAt(POOL_SPREAD * 3), POOL_SIZE.end);
});
