import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type CloseSource, GameScene } from './scene.ts';

test('a middle-ground sampling that fails forgets only itself, never a newer one asked after the land changed', async () => {
  // The scene's own state, as `setLand` leaves it, without its GPU.
  const scene = Object.create(GameScene.prototype) as GameScene;
  const fields = scene as unknown as { terrain: unknown; middle: unknown };
  fields.terrain = { view: { leftM: 0, topM: 0 }, drawn: { showMiddle() {} } };
  fields.middle = null;
  let fail = () => {};
  const failing = (() =>
    new Promise((unused, reject) => (fail = () => reject(new Error('lost'))))) as unknown as CloseSource;
  scene.keepMiddle([0, 0], failing);
  // The land changes; the new land asks round its own focus.
  fields.terrain = { view: { leftM: 0, topM: 0 }, drawn: { showMiddle() {} } };
  fields.middle = null;
  const waiting = (() => new Promise(() => {})) as unknown as CloseSource;
  scene.keepMiddle([5000, 5000], waiting);
  const newer = fields.middle;
  fail();
  await new Promise((done) => setTimeout(done, 0));
  assert.equal(fields.middle, newer, 'the newer sampling is still on its way');
});
