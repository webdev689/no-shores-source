import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FollowCamera, fallPlayed, followable, nextFollowed } from './followCamera.ts';
import { FIGHT_TICKS } from './fightMoves.ts';
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

test("fallen, the camera follows anyone living in a run, at the gate its holding company's, and no one elsewhere", () => {
  const gate = (holders: readonly number[]) => ({ gate: true, holders });
  assert.deepEqual(followable([ada, ben], { run: true, seen: null, player: 7 }), [ada, ben]);
  assert.deepEqual(followable([ada, ben], { run: false, seen: gate([7, 9]), player: 7 }), [ben]);
  assert.equal(followable([ada, ben], { run: false, seen: gate([4, 9]), player: 7 }), null, "another company's");
  assert.equal(followable([ada, ben], { run: false, seen: null, player: 7 }), null, 'no Breach');
});

test("the camera leaves the player's body only once their own fall has played, by the edge or by a blow", () => {
  const inside = { kind: 'inside' } as const;
  const dead = (elapsed: number) => ({ kind: 'dead', elapsed });
  assert.equal(fallPlayed(inside, dead(0)), false, 'struck down this moment');
  assert.equal(fallPlayed(inside, dead(FIGHT_TICKS.death - 1)), false, 'still falling');
  assert.equal(fallPlayed(inside, dead(FIGHT_TICKS.death)), true);
  assert.equal(fallPlayed({ kind: 'dead', told: false }, undefined), false, 'over the edge, still tumbling');
  assert.equal(fallPlayed({ kind: 'dead', told: true }, undefined), true);
  assert.equal(fallPlayed(inside, { kind: 'idle' }), false, 'standing');
});
