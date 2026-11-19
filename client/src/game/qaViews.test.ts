import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { startMovementRules } from '../rules/movementRules.ts';
import { askedQaViews, qaViewed } from './qaViews.ts';

const MODULE = new URL('../../../target/wasm32-unknown-unknown/release/movement_wasm.wasm', import.meta.url);
const movement = await startMovementRules(await readFile(MODULE));
movement.setCourse([]);
const ring = [
  [0, 0],
  [100, 0],
  [100, 100],
  [0, 100],
] as const;

test('a QA view stands the offline body at its point and bearing', () => {
  const moved = qaViewed(movement, ring, [40, 60, 90, 'third,60']);
  assert.ok(moved);
  assert.equal(moved.body.x, 40);
  assert.equal(moved.body.y, 60);
  assert.equal(moved.yaw, Math.PI / 2);
  assert.equal(moved.view.firstPerson, false);
  assert.equal(moved.view.distance, 60);
  assert.equal(qaViewed(movement, ring, [40, 60, 0, 'first'])?.view.firstPerson, true);
});

test('a QA view outside the loaded node is refused', () => {
  assert.equal(qaViewed(movement, ring, [140, 60, 0, 'first']), null);
});

test('QA views are asked for by the address flag that spawns, and only then', () => {
  assert.equal(askedQaViews('?at=n&spawn=1,2,3'), true);
  assert.equal(askedQaViews('?at=n'), false);
});
