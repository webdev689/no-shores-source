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
  const pirate: SeenPirate = { id: 3, x: 0, y: -12_000, heading: Math.PI / 2, faction: 1, rank: 2 };
  const meeting = meetingPoint([0, 0], pirate);
  assert.ok(meeting[0] > 2_000 && Math.abs(meeting[1] + 12_000) < 1e-6, `ahead of her, east: ${meeting}`);
});

test('a chase plans again each half second while she is sighted, says whom, and ends once she is lost', () => {
  const chase = new Chase();
  const pirate: SeenPirate = { id: 3, x: 0, y: -8_000, heading: 0, faction: 1, rank: 4, hull: 2, sight: 25_920 };
  assert.deepEqual(chase.start(pirate, [0, 0]), meetingPoint([0, 0], pirate));
  assert.equal(chase.words, 'Chasing the Tithe Brig.');
  assert.equal(chase.chasing, 3);
  assert.equal(chase.step(CHASE_EVERY_S / 2, [pirate], [0, 0]), null, 'not yet half a second');
  assert.ok(chase.step(CHASE_EVERY_S / 2, [pirate], [0, 0]), 'planned again');
  assert.equal(chase.step(CHASE_EVERY_S, [{ ...pirate, y: -30_000 }], [0, 0]), null, 'out of her sight');
  assert.deepEqual([chase.words, chase.chasing], [null, null], 'lost: the chase is over');
  chase.start(pirate, [0, 0]);
  chase.stop();
  assert.equal(chase.words, null, 'another course set');
});
