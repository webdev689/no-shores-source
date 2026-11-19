import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { startMovementRules } from '../rules/movementRules.ts';
import { newPlayer } from '../player/player.ts';
import { installQaViews, qaViewed } from './qaViews.ts';

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

test('a high view looks down by the degrees asked, and a camera not understood is refused', () => {
  const high = qaViewed(movement, ring, [40, 60, 0, 'third,60,45']);
  assert.equal(high?.view.distance, 60);
  assert.equal(high?.pitch, Math.PI / 4);
  assert.equal(qaViewed(movement, ring, [40, 60, 0, 'third,60,x']), null);
  assert.equal(qaViewed(movement, ring, [40, 60, 0, 'sideways']), null);
});

test('the hook is installed offline with a spawn in the address, and never online or without one', () => {
  const installed = (search: string, offline: boolean) => {
    const target: { __qaView?: unknown } = {};
    installQaViews(target, search, offline, movement, { player: newPlayer(movement, 0, 0) }, () => ring);
    return target.__qaView !== undefined;
  };
  assert.equal(installed('?at=n&spawn=1,2,3', true), true);
  assert.equal(installed('?at=n&spawn=1,2,3', false), false);
  assert.equal(installed('?at=n', true), false);
});

test('an installed hook places the player only inside the node it stands in', () => {
  const walker = { player: newPlayer(movement, 0, 0) };
  const target: { __qaView?: (view: readonly [number, number, number, string]) => boolean } = {};
  installQaViews(target, '?spawn=1,2', true, movement, walker, () => ring);
  assert.equal(target.__qaView?.([40, 60, 0, 'first']), true);
  assert.equal(walker.player.body.x, 40);
  assert.equal(target.__qaView?.([400, 60, 0, 'first']), false);
  assert.equal(walker.player.body.x, 40);
});
