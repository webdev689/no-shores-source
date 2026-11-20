import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SeenPirate } from '../network/messages.ts';
import { Chase, CHASE_EVERY_S, interceptPoint, meetingPoint } from './seaChase.ts';

const near = (point: readonly number[], expected: readonly number[]) =>
  assert.ok(Math.hypot((point[0] ?? 0) - (expected[0] ?? 0), (point[1] ?? 0) - (expected[1] ?? 0)) < 1e-6, `${point}`);

test('the chase heads where she will be: lead pursuit, or where she is if she cannot be reached', () => {
  // She is 1 km north sailing east at 3 m/s; a chaser at 5 m/s meets her 750 m east of there.
  near(interceptPoint([0, 0], 5, [0, -1_000], [3, 0]), [750, -1_000]);
  near(interceptPoint([0, 0], 5, [0, -1_000], [0, 0]), [0, -1_000]);
  near(interceptPoint([0, 0], 2, [0, -1_000], [0, -12]), [0, -1_000]);
  const pirate: SeenPirate = { id: 3, x: 0, y: -12_000, heading: Math.PI / 2, faction: 1, rank: 2, way: 2.4 };
  const meeting = meetingPoint([0, 0], pirate);
  assert.ok(meeting[0] > 2_000 && Math.abs(meeting[1] + 12_000) < 1e-6, `ahead of her, east: ${meeting}`);
  near(meetingPoint([0, 0], { ...pirate, way: undefined }), [0, -12_000]);
});

test('a chase plans again each half second while she is sighted, says whom, and ends once she is lost', () => {
  const chase = new Chase();
  const pirate: SeenPirate = { id: 3, x: 0, y: -8_000, heading: 0, faction: 1, rank: 4, hull: 2, sight: 25_920 };
  assert.deepEqual(chase.begin('hostile-3', [pirate], [0, 0]), meetingPoint([0, 0], pirate));
  assert.equal(chase.begin('hostile-9', [pirate], [0, 0]), null, 'no such ship sighted');
  assert.equal(chase.words, 'Chasing the Tithe Brig.');
  assert.equal(chase.chasing, 3);
  assert.equal(chase.step(CHASE_EVERY_S / 2, [pirate], [0, 0]), null, 'not yet half a second');
  assert.ok(chase.step(CHASE_EVERY_S / 2, [pirate], [0, 0]), 'planned again');
  assert.equal(chase.step(CHASE_EVERY_S, [{ ...pirate, y: -30_000 }], [0, 0]), null, 'out of her sight');
  assert.deepEqual([chase.words, chase.chasing], [null, null], 'lost: the chase is over');
  chase.begin('hostile-3', [pirate], [0, 0]);
  chase.step(CHASE_EVERY_S, [pirate], [0, -7_300]);
  assert.equal(chase.chasing, null, 'within 750 m of her: met');
  chase.begin('hostile-3', [pirate], [0, 0]);
  chase.stop();
  assert.equal(chase.words, null, 'another course set');
});

test('the room is told whom the ship chases, and told none when another course is set or she is lost', () => {
  const told: (number | null)[] = [];
  const chase = new Chase((ship) => told.push(ship));
  const pirate: SeenPirate = { id: 4, x: 0, y: -8_000, heading: 0, faction: 2, rank: 1, sight: 25_920, way: 2.16 };
  chase.begin('hostile-4', [pirate], [0, 0]);
  chase.stop();
  chase.stop();
  chase.begin('hostile-4', [pirate], [0, 0]);
  chase.step(CHASE_EVERY_S, [], [0, 0]);
  assert.deepEqual(told, [4, null, 4, null], 'lost: let go');
  chase.begin('hostile-4', [pirate], [0, 0]);
  chase.step(CHASE_EVERY_S, [{ ...pirate, y: -500 }], [0, 0]);
  assert.deepEqual(told, [4, null, 4, null, 4], 'met: the room meets her, untold');
});
