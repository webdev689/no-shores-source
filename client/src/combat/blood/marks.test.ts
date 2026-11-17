import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DRY_TICK, DRY_TIME, DRY_STAGES } from './art.ts';
import { BloodMarks, bloodOn, type Surfaces } from './marks.ts';

/** Flat ground at height zero, and nothing else. */
const ground: Surfaces = (from, direction, reach) => {
  if (direction[2] >= 0) return null;
  const distance = from[2] / -direction[2];
  return distance >= 0 && distance <= reach ? { distance, normal: [0, 0, 1] } : null;
};
const chest = [0, 0, 1.125] as const;
const marks = (enabled = true) => new BloodMarks({ surfaces: ground, random: () => 0.5, enabled, flight: false });

test('a blow marks the ground under the body; the drop that looks up finds no ceiling', () => {
  const blood = marks();
  const pool = blood.place(chest, { damage: 10, healthMax: 100, heavy: false, thrown: [0, 0] });
  assert.ok(pool);
  assert.ok(Math.abs(pool.position[2] - 0.02) < 1e-9);
  assert.equal(blood.count, 3);
});

test('blood switched off makes nothing', () => {
  const blood = marks(false);
  assert.equal(blood.place(chest, { damage: 500, healthMax: 100, heavy: true, thrown: [0, 0] }), null);
  assert.equal(blood.spreadPool([0, 0, 0]), null);
  assert.equal(blood.drip([0, 0, 0], 4), null);
  assert.equal(blood.count, 0);
  assert.equal(blood.gibs.length, 0);
  assert.equal(bloodOn('?blood=off'), false);
  assert.equal(bloodOn(''), true);
});

test("only a player's warhammer overkill throws chunks", () => {
  const blood = marks();
  blood.place(chest, { damage: 175, healthMax: 100, heavy: false, thrown: [0, 0] });
  assert.equal(blood.gibs.length, 0);
  blood.place(chest, { damage: 175, healthMax: 100, heavy: true, thrown: [0, 0] });
  assert.equal(blood.gibs.length, 10);
});

test('marks dry on the drying tick, rewriting their slots', () => {
  const blood = marks();
  blood.place(chest, { damage: 10, healthMax: 100, heavy: false, thrown: [0, 0] });
  blood.takeRuns();
  for (let t = 0; t < DRY_TIME / DRY_STAGES + DRY_TICK; t += 0.5) blood.tick(0.5);
  assert.ok(blood.takeRuns().length > 0);
  assert.equal(blood.ring.decalAt(0)?.stage, 1);
});

test("a corpse's pool grows as it spreads", () => {
  const blood = marks();
  const pool = blood.spreadPool([0, 0, 0]);
  assert.ok(pool);
  const start = pool.size;
  for (let t = 0; t < 13; t += 0.5) blood.tick(0.5);
  assert.ok(pool.size > start * 3);
});

test('a drop that flies lands where its arc ends', () => {
  const blood = new BloodMarks({ surfaces: ground, random: () => 0.7, flight: true });
  blood.place(chest, { damage: 50, healthMax: 100, heavy: false, thrown: [0, 0] });
  const flying = blood.flying.length;
  assert.ok(flying > 0);
  const before = blood.count;
  for (let t = 0; t < 2; t += 1 / 60) blood.tick(1 / 60);
  assert.equal(blood.flying.length, 0);
  assert.equal(blood.count, before + flying);
});
