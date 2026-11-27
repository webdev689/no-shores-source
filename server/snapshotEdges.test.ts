// Two edges of the snapshots sent as changes, against the real room through the server's door: a snapshot taken
// before the room's first tick, and an event the room tells between its ticks.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import course from '../content/testground/course.json' with { type: 'json' };
import { inputBytes, readFromRoom } from '../client/src/network/messages.ts';
import { SnapshotKeeper } from '../client/src/network/snapshots.ts';
import { startRoomDoor } from './roomDoor.ts';
import { intentOf } from './intentForTests.ts';

const compiled = new WebAssembly.Module(
  await readFile(new URL('../target/wasm32-unknown-unknown/release/room_wasm.wasm', import.meta.url)),
);
const still = intentOf();
const look = { anim: '', frame: 0, facing: 0 };

test('a snapshot taken before the first tick is never the base a later one is built on', () => {
  const door = startRoomDoor(compiled);
  door.open(course.start, course.blocks);
  const first = door.join();
  door.join();
  door.snapshot(first);
  door.tick();
  const next = readFromRoom(door.snapshot(first));
  assert.ok(next?.kind === 'snapshot');
  assert.notEqual(new SnapshotKeeper().whole(next), null, 'a page that never saw tick 0 makes it whole');
});

test('an event the room tells between its ticks reaches a page that is up to date', () => {
  const door = startRoomDoor(compiled);
  door.open(course.start, course.blocks);
  const player = door.join();
  const kept = new SnapshotKeeper();
  let seen = 0n;
  const handed: number[] = [];
  for (let tick = 1; tick <= 5; tick++) {
    door.input(player, inputBytes(tick, { intent: still, look, arms: 0, seen }));
    door.tick();
    door.snapshotPrepare();
    const whole = kept.whole(readFromRoom(door.snapshotFor(player)) as never);
    if (whole) {
      seen = whole.tick;
      handed.push(...whole.events.map((event) => event.kind));
    }
    // Between ticks 2 and 3, as a scene stands its foes.
    if (tick === 2) door.standFoe(13, 1, 2, 1, 0.5, 2);
  }
  assert.ok(handed.includes(11), `the foe's standing (kind 11) was handed: [${handed}]`);
});
