import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DecalRing,
  RATE_MAX,
  RATE_NEAR_LETHAL,
  bloodRate,
  burstCount,
  isOverkill,
  ladderRate,
  sprayCount,
  sprayPattern,
} from './spray.ts';

const FLOOR = [0, 0, 1] as const;
const held = () => 0.5;

test('the ring hands back its oldest mark once it is full', () => {
  const ring = new DecalRing(3, held);
  const first = ring.place([0, 0, 0], FLOOR, { size: 1 });
  ring.place([1, 0, 0], FLOOR, { size: 1 });
  ring.place([2, 0, 0], FLOOR, { size: 1 });
  const fourth = ring.place([3, 0, 0], FLOOR, { size: 1 });
  assert.equal(fourth?.slot, first?.slot);
  assert.equal(ring.count, 3);
  assert.equal(ring.decalAt(0)?.position[0], 3);
});

test('a wrapped ring draws its oldest marks first', () => {
  const ring = new DecalRing(3, held);
  for (let i = 0; i < 4; i++) ring.place([i, 0, 0], FLOOR, { size: 1 });
  assert.deepEqual(ring.ranges(), [
    [1, 3],
    [0, 1],
  ]);
});

test('an unwrapped ring draws only the slots it has filled', () => {
  const ring = new DecalRing(5, held);
  ring.place([0, 0, 0], FLOOR, { size: 1 });
  ring.place([1, 0, 0], FLOOR, { size: 1 });
  assert.deepEqual(ring.ranges(), [[0, 2]]);
});

test('a mark lies lifted off its surface along its normal', () => {
  const ring = new DecalRing(1, held);
  const mark = ring.place([0, 0, 0], FLOOR, { size: 1 });
  assert.ok(Math.abs((mark?.position[2] ?? 0) - 0.02) < 1e-9);
});

test('the rate ladder steps by damage over max health, each rung inclusive at its top', () => {
  assert.equal(ladderRate(10), 30);
  assert.equal(ladderRate(25), 30);
  assert.equal(ladderRate(25.01), 50);
  assert.equal(ladderRate(50), 50);
  assert.equal(ladderRate(100), 70);
  assert.equal(ladderRate(101), RATE_NEAR_LETHAL);
  assert.equal(ladderRate(175), RATE_MAX);
  assert.equal(bloodRate(30, 100), 50);
});

test('turning the blood down never turns a hit into nothing', () => {
  assert.equal(bloodRate(1, 100, 0), 1);
  assert.equal(bloodRate(1, 100, 0.5), 15);
});

test('a blow for 175 percent of a body is an overkill, and the heavy burst throws more drops', () => {
  assert.equal(isOverkill(174, 100), false);
  assert.equal(isOverkill(175, 100), true);
  assert.equal(isOverkill(10, 0), false);
  assert.ok(burstCount(true) > burstCount(false));
});

test('a spray lands about an eighth of its rate, never more than its ceiling', () => {
  assert.equal(sprayCount(30), 4);
  assert.equal(sprayCount(RATE_MAX), 24);
  assert.equal(sprayCount(0), 1);
});

test("a spray's first drop is the body's own spot, and the rest fall inside its reach", () => {
  const pattern = sprayPattern(12, 1, null, held);
  assert.deepEqual(pattern[0], { offsetX: 0, offsetY: 0, scale: 1 });
  for (const drop of pattern.slice(1)) assert.ok(Math.hypot(drop.offsetX, drop.offsetY) <= 1.35 + 1e-9);
});
