import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FollowCamera, nextFollowed } from './followCamera.ts';
import type { Player } from './player.ts';

const ada = { id: 4, at: [10, 0, 50] as const };
const ben = { id: 9, at: [20, 5, 50] as const };
const own = {
  body: { x: 1, y: 2, z: 3 },
  previous: { x: 1, y: 2, z: 3 },
  blend: 0.5,
  view: { firstPerson: true, distance: 4.5, shown: 4.5 },
  yaw: 0.3,
} as unknown as Player;

test('Follow goes to the next member by number, wrapping, and to the first from none', () => {
  assert.equal(nextFollowed([ben, ada], null)?.id, 4);
  assert.equal(nextFollowed([ben, ada], 4)?.id, 9);
  assert.equal(nextFollowed([ben, ada], 9)?.id, 4, 'wraps');
  assert.equal(nextFollowed([], 4), null);
});

test('fallen, the camera stands over a living member in third person; standing again, it is the own', () => {
  const camera = new FollowCamera();
  camera.frame(false, [ada, ben], false);
  assert.equal(camera.viewed(own), own, 'standing: the own');
  camera.frame(true, [ada, ben], false);
  assert.equal(camera.following, 4);
  const seen = camera.viewed(own);
  assert.deepEqual([seen.body.x, seen.body.y, seen.body.z, seen.previous.x], [10, 0, 50, 10]);
  assert.deepEqual([seen.view.firstPerson, seen.yaw], [false, 0.3], 'turned as the player turns it');
  camera.frame(true, [ada, ben], true);
  assert.equal(camera.following, 9, 'Follow takes the next');
  camera.frame(true, [ada], false);
  assert.equal(camera.following, 4, 'one who fell is left for the next living');
  camera.frame(true, [], false);
  assert.equal(camera.viewed(own), own, 'with no one living, the own');
  camera.frame(false, [ada], false);
  assert.equal(camera.following, null);
});
