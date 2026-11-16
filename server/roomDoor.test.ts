import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import course from '../content/testground/course.json' with { type: 'json' };
// The browser's side of the messages, so these tests send the room exactly the bytes a browser sends.
import { type Look, inputBytes, readFromRoom } from '../client/src/network/messages.ts';
import { startRoomDoor } from './roomDoor.ts';

const MODULE = new URL('../target/wasm32-unknown-unknown/release/room_wasm.wasm', import.meta.url);
const compiled = new WebAssembly.Module(
  await readFile(MODULE).catch(() => {
    throw new Error('room_wasm.wasm is not built: run `npm run wasm` first');
  }),
);
/** Forward at a walk, looking north, no fight's buttons. */
const walk = new Float64Array([1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
const walking = { anim: 'walk', frame: 2, facing: 0 };
/** An input as a browser writes it, holding nothing and seeing the start of the room. */
const asking = (sequence: number, intent: Float64Array, look: Look, dress?: string) =>
  inputBytes(sequence, { intent, look, arms: 0, seen: 0n, spawn: 0, ...(dress === undefined ? {} : { dress }) });

test('a room welcomes players, takes the inputs a browser writes in order, and its snapshots read back in the browser', () => {
  const room = startRoomDoor(compiled);
  assert.equal(room.tickSeconds, 1 / 60);
  assert.equal(room.open(course.start, course.blocks), true);
  const [first, second] = [room.join(), room.join()];
  assert.deepEqual(readFromRoom(room.joined(first)), { kind: 'joined', player: first, dressed: [] });
  assert.equal(room.input(first, asking(1, walk, walking, '{"body":"male"}')), 'taken');
  for (let sequence = 2; sequence <= 30; sequence++)
    assert.equal(room.input(first, asking(sequence, walk, walking)), 'taken');
  assert.equal(room.input(first, asking(40, walk, walking)), 'out of order');
  assert.equal(room.input(second, asking(1, walk, { ...walking, anim: 'Not A Move' })), 'not an input');
  assert.equal(room.input(second, new Uint8Array([1, 2, 3])), 'not an input');
  for (let tick = 0; tick < 30; tick++) room.tick();
  const snapshot = readFromRoom(room.snapshot());
  assert.equal(snapshot?.kind, 'snapshot');
  if (snapshot?.kind !== 'snapshot') return;
  const [walker, stander] = snapshot.players;
  assert.equal(walker?.acknowledged, 30);
  assert.ok(Math.abs((walker?.body.y ?? 0) - (course.start.y - 4.43 / 2)) < 0.01, `walked half a second north`);
  assert.deepEqual([stander?.player, stander?.acknowledged, stander?.body.y], [second, 0, course.start.y]);
  // The walker's look came with its last input, and its dress once, to everyone and to whoever joins after.
  assert.deepEqual([walker?.anim, walker?.frame], ['walk', 2]);
  assert.deepEqual(snapshot.dressed, [{ player: first, dress: '{"body":"male"}' }]);
  room.tick();
  assert.deepEqual((readFromRoom(room.snapshot()) as { dressed: unknown }).dressed, []);
  const third = room.join();
  assert.deepEqual(readFromRoom(room.joined(third)), {
    kind: 'joined',
    player: third,
    dressed: [{ player: first, dress: '{"body":"male"}' }],
  });
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
