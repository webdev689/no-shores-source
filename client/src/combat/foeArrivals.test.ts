import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ARRIVING } from '../player/cardLooks.ts';
import { RoomTicks, arrivalLook } from './foeArrivals.ts';

const SHIP = { kind: 1, from: 4, drops: 600, lands: 660 };

test('a foe let down from an airship is hidden until it drops, built from the feet up, then whole', () => {
  assert.deepEqual(arrivalLook(SHIP, 1, 599), { hidden: true });
  const half = arrivalLook(SHIP, 1, 630);
  assert.ok(!half.hidden && Math.abs((half.share ?? 0) - 0.5) < 1e-9 && half.look === ARRIVING.tithe);
  assert.deepEqual(arrivalLook(SHIP, 1, 660), { hidden: false });
  assert.deepEqual(arrivalLook(null, 1, 630), { hidden: false });
});

test('a Lattice foe forms under its crown from the head down, and so does one of its own called', () => {
  const crown = arrivalLook({ kind: 2, from: 3, drops: 100, lands: 178 }, 3, 120);
  assert.ok(!crown.hidden && crown.look === ARRIVING.lattice);
  const called = arrivalLook({ kind: 3, from: 0, drops: 100, lands: 136 }, 3, 110);
  assert.ok(!called.hidden && called.look === ARRIVING.lattice);
  const tithe = arrivalLook({ kind: 3, from: 0, drops: 100, lands: 136 }, 1, 110);
  assert.ok(!tithe.hidden && tithe.look === ARRIVING.tithe);
});

test('the room’s ticks run on between snapshots by the page’s clock, and hold once a room stalls', () => {
  const ticks = new RoomTicks();
  assert.equal(ticks.now(100, 5), 100);
  assert.ok(Math.abs(ticks.now(100, 5.05) - 103) < 1e-9);
  assert.equal(ticks.now(100, 9), 112, 'held after a fifth of a second');
  assert.equal(ticks.now(104, 9.01), 104, 'a new snapshot takes over');
});
