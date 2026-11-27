import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import course from '../content/testground/course.json' with { type: 'json' };
// The browser's side of the messages, so this run sends the room exactly the bytes a browser sends.
import { inputBytes, readFromRoom } from '../client/src/network/messages.ts';
import { SnapshotKeeper } from '../client/src/network/snapshots.ts';
import { startRoomDoor } from './roomDoor.ts';
import { intentOf } from './intentForTests.ts';
import { pinned } from './pinnedForTests.ts';

const compiled = new WebAssembly.Module(
  await readFile(new URL('../target/wasm32-unknown-unknown/release/room_wasm.wasm', import.meta.url)).catch(() => {
    throw new Error('room_wasm.wasm is not built: run `npm run wasm` first');
  }),
);

/** The room door's agreement test holds the same course, script and fingerprint
 *  (crates/room-wasm/src/climb_door_tests.rs). */
const CLIMB_HASH = pinned('climb.run');
/** Ticks east, then north into the ledge and up it, then facing south; the tick the player asks for a swordsman, how
 *  often they swing at it after, and the run's length. */
const EAST = 40;
const NORTH = 230;
const ASK_AT = 300;
const SWING_EVERY = 30;
const RUN_TICKS = 1200;
const SWORDSMAN = 2;

test('a foe climbs after a player to the same fingerprint through WebAssembly as the room natively', () => {
  const room = startRoomDoor(compiled);
  assert.equal(room.open(course.start, course.blocks), true);
  const player = room.join();
  const kept = new SnapshotKeeper();
  let hash = 0x811c_9dc5;
  let highest = 0;
  for (let tick = 1; tick <= RUN_TICKS; tick++) {
    const [forward, yaw] = tick <= EAST ? [1, Math.PI / 2] : tick <= NORTH ? [1, 0] : [0, Math.PI];
    const swing = tick > ASK_AT && tick % SWING_EVERY === 0 ? 1 : 0;
    const intent = intentOf({ forward, yaw }, swing);
    const look = { anim: '', frame: 0, facing: 0 };
    const spawn = tick === ASK_AT ? { type: SWORDSMAN, rank: 2 } : undefined;
    const parts = { intent, look, arms: 0, seen: BigInt(tick - 1), ...(spawn === undefined ? {} : { spawn }) };
    assert.equal(room.input(player, inputBytes(tick, parts)), 'taken');
    room.tick();
    const bytes = room.snapshot(player);
    for (const byte of bytes) hash = Math.imul(hash ^ byte, 0x0100_0193) >>> 0;
    const read = readFromRoom(bytes);
    // Kept whole as a page keeps it: a foe that changed comes as its numbers that changed.
    const message = read?.kind === 'snapshot' ? kept.whole(read) : null;
    if (!message) continue;
    for (const foe of message.foes) highest = Math.max(highest, foe.glance[2] ?? 0);
  }
  assert.equal(highest, 2.3, 'the foe stood on the ledge');
  assert.equal(hash.toString(16).padStart(8, '0'), CLIMB_HASH);
});
