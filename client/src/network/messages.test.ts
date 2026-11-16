import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import * as flatbuffers from 'flatbuffers';
import { Input } from '../../../generated/messages/ts/overlook/wire.ts';
import { floatsOf, startMovementRules } from '../rules/movementRules.ts';
import { inputBytes, readFromRoom } from './messages.ts';

const target = (path: string) => new URL(`../../../target/${path}`, import.meta.url);
const built = (path: string, how: string) =>
  readFile(target(path)).catch(() => {
    throw new Error(`${path} is not built: ${how}`);
  });

test('a welcome and a snapshot the server wrote read back to the bit', async () => {
  // protocol_tests.rs writes these two messages; its players are one standing and one after half a second's walk.
  const joined = readFromRoom(new Uint8Array(await built('protocol/joined.bin', 'run `cargo test -p protocol`')));
  assert.deepEqual(joined, { kind: 'joined', player: 7 });
  const snapshot = readFromRoom(new Uint8Array(await built('protocol/snapshot.bin', 'run `cargo test -p protocol`')));
  assert.equal(snapshot?.kind, 'snapshot');
  if (snapshot?.kind !== 'snapshot') return;
  const rules = await startMovementRules(
    await built('wasm32-unknown-unknown/release/movement_wasm.wasm', 'run `npm run wasm`'),
  );
  rules.setCourse([]);
  let walked = rules.standing(1.5, -2.25);
  const walk = { forward: 1, sideways: 0, yaw: 0.3, run: false, jump: false, crouch: false, mounted: false };
  for (let tick = 0; tick < 30; tick++) walked = rules.step(walked, walk);
  assert.equal(snapshot.tick, 1234n);
  assert.deepEqual(
    snapshot.players.map(({ player, acknowledged, body }) => [player, acknowledged, floatsOf(body)]),
    [
      [7, 0, floatsOf(rules.standing(1.5, -2.25))],
      [9, 30, floatsOf(walked)],
    ],
  );
});

test('an input is its number and its seven controls, in the movement crate’s order', () => {
  const controls = { forward: 1, sideways: -0.5, yaw: 0.3, run: true, jump: false, crouch: true, mounted: false };
  const input = Input.getRootAsInput(new flatbuffers.ByteBuffer(inputBytes(42, controls)));
  assert.equal(input.sequence(), 42);
  assert.deepEqual(Array.from(input.controlsArray() ?? []), [1, -0.5, 0.3, 1, 0, 1, 0]);
});

test('bytes that hold no message read as nothing', () => {
  assert.equal(readFromRoom(new Uint8Array()), null);
  assert.equal(readFromRoom(new Uint8Array([1, 2, 3])), null);
});
