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
  const held = [5.1, 5.2, 5.5, 9].map((clock) => ticks.now(100, clock));
  assert.ok(
    held.every((tick) => tick <= 112 + 6),
    `a stalled room holds the drawn tick near it: ${held}`,
  );
  assert.ok(
    held.every((tick, nth) => nth === 0 || tick >= (held[nth - 1] ?? 0)),
    'never stepped back',
  );
});

test('the drawn tick never steps back as snapshots come late and early, and keeps up with the room', () => {
  const ticks = new RoomTicks();
  let [clock, drawn] = [0, ticks.now(0, 0)];
  // Snapshots every 50 ms on average, each late or early by up to 30 ms: the room's tick runs at 60 a second.
  for (let frame = 1; frame <= 600; frame++) {
    clock = frame / 60;
    const jitter = ((frame * 7919) % 61) / 1000 - 0.03;
    const roomTick = Math.floor(Math.max(0, clock - 0.05 + jitter) * 20) * 3;
    const tick = ticks.now(roomTick, clock);
    assert.ok(tick >= drawn, `frame ${frame}: ${tick} after ${drawn}`);
    assert.ok(Math.abs(tick - clock * 60) < 12, `frame ${frame}: ${tick} keeps up with ${clock * 60}`);
    drawn = tick;
  }
});

test('a room joined anew is taken at once, its ticks from its own start', () => {
  const ticks = new RoomTicks();
  ticks.now(50_000, 1);
  assert.ok(ticks.now(50_000, 1.5) > 50_000);
  assert.equal(ticks.now(30, 1.52), 30);
});
