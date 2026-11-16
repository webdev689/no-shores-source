import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import course from '../content/testground/course.json' with { type: 'json' };
// The browser's side of the messages, so these tests send the room exactly the bytes a browser sends.
import { inputBytes, readFromRoom } from '../client/src/network/messages.ts';
import { startRoomDoor } from './roomDoor.ts';

const MODULE = new URL('../target/wasm32-unknown-unknown/release/room_wasm.wasm', import.meta.url);
const compiled = new WebAssembly.Module(
  await readFile(MODULE).catch(() => {
    throw new Error('room_wasm.wasm is not built: run `npm run wasm` first');
  }),
);
const walk = { forward: 1, sideways: 0, yaw: 0, run: false, jump: false, crouch: false, mounted: false };

test('a room welcomes players, takes the inputs a browser writes in order, and its snapshots read back in the browser', () => {
  const room = startRoomDoor(compiled);
  assert.equal(room.tickSeconds, 1 / 60);
  assert.equal(room.open(course.start, course.blocks), true);
  const [first, second] = [room.join(), room.join()];
  assert.deepEqual(readFromRoom(room.joined(first)), { kind: 'joined', player: first });
  for (let sequence = 1; sequence <= 30; sequence++)
    assert.equal(room.input(first, inputBytes(sequence, walk)), 'taken');
  assert.equal(room.input(first, inputBytes(40, walk)), 'out of order');
  assert.equal(room.input(second, new Uint8Array([1, 2, 3])), 'not an input');
  for (let tick = 0; tick < 30; tick++) room.tick();
  const snapshot = readFromRoom(room.snapshot());
  assert.equal(snapshot?.kind, 'snapshot');
  if (snapshot?.kind !== 'snapshot') return;
  const [walker, stander] = snapshot.players;
  assert.equal(walker?.acknowledged, 30);
  assert.ok(Math.abs((walker?.body.y ?? 0) - (course.start.y - 4.43 / 2)) < 0.01, `walked half a second north`);
  assert.deepEqual([stander?.player, stander?.acknowledged, stander?.body.y], [second, 0, course.start.y]);
});

test('a player who leaves is no longer seen, and each room is a room of its own', () => {
  const room = startRoomDoor(compiled);
  room.open(course.start, course.blocks);
  const player = room.join();
  room.leave(player);
  room.tick();
  const snapshot = readFromRoom(room.snapshot());
  assert.deepEqual(snapshot?.kind === 'snapshot' ? snapshot.players : null, []);
  const another = startRoomDoor(compiled);
  another.open(course.start, course.blocks);
  assert.equal(another.join(), 1);
});
