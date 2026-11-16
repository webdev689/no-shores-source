import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import * as flatbuffers from 'flatbuffers';
import { Input } from '../../../generated/messages/ts/overlook/wire.ts';
import { fighterView, glanceView } from '../combat/fighter.ts';
import { floatsOf, startMovementRules } from '../rules/movementRules.ts';
import { inputBytes, readFromRoom } from './messages.ts';

const target = (path: string) => new URL(`../../../target/${path}`, import.meta.url);
const built = (path: string, how: string) =>
  readFile(target(path)).catch(() => {
    throw new Error(`${path} is not built: ${how}`);
  });

test('a welcome and a snapshot the server wrote read back to the bit', async () => {
  // protocol_tests.rs writes these two messages: one player standing, one after half a second's walk, swinging, and
  // the first's dress.
  const dressed = [{ player: 7, dress: '{"body":"male"}' }];
  const joined = readFromRoom(new Uint8Array(await built('protocol/joined.bin', 'run `cargo test -p protocol`')));
  assert.deepEqual(joined, { kind: 'joined', player: 7, dressed });
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
    snapshot.players.map(({ player, acknowledged, body, anim, frame, facing }) => [
      player,
      acknowledged,
      floatsOf(body),
      anim,
      frame,
      facing,
    ]),
    [
      [7, 0, floatsOf(rules.standing(1.5, -2.25)), '', 0, 0],
      [9, 30, floatsOf(walked), 'attack_sword', 4, 0.75],
    ],
  );
  assert.deepEqual(snapshot.dressed, dressed);
  // The second player's fighter: a sword drawn, its lock on foe 12, stamina spent.
  const fighting = fighterView(snapshot.players[1]?.fighter ?? []);
  assert.deepEqual([fighting.target, fighting.stamina, fighting.health, fighting.side], [12, 88, 100, 'players']);
  assert.equal(fighting.x, walked.x);
  // The brute, staggered by a parry, 40 of its 130 health gone, its lock on the player.
  const [foe] = snapshot.foes;
  const brute = glanceView(foe?.glance ?? []);
  assert.deepEqual(
    [foe?.id, foe?.kind, brute.health, brute.healthMax, brute.target, brute.side],
    [12, 3, 90, 130, 9, 'foes'],
  );
  assert.deepEqual(brute.action, { kind: 'staggered', left: 30, cause: 'parried' });
  assert.deepEqual(
    snapshot.events.map((event) => [event.tick, event.kind, event.how, event.striker, event.defender, event.amount]),
    [
      [1233n, 3, 1, 12, 9, 0],
      [1234n, 1, 2, 9, 12, 35],
    ],
  );
  const [arrow] = snapshot.shots;
  assert.deepEqual([arrow?.owner, arrow?.ranged], [12, 1]);
  const flat = Math.cos(0.1);
  const along = [Math.sin(0.5) * flat, -Math.cos(0.5) * flat, Math.sin(0.1)];
  arrow?.at.forEach((value, axis) =>
    assert.ok(Math.abs(value - ([3, -6, 1.1][axis] ?? 0) - (along[axis] ?? 0) * 0.4) < 1e-12),
  );
});

test('an input is its number, its controls and fight buttons in the combat crate’s order, its look, its arms, the tick seen, a foe asked for, and a dress if given', () => {
  const intent = new Float64Array([1, -0.5, 0.3, 1, 0, 1, 0, 6, 1, 0, 1, -0.2]);
  const look = { anim: 'ride_gallop', frame: 3, facing: -1.5 };
  const parts = { intent, look, arms: 0x10002, seen: 977n, spawn: 3 };
  const input = Input.getRootAsInput(
    new flatbuffers.ByteBuffer(inputBytes(42, { ...parts, dress: '{"body":"female"}' })),
  );
  assert.equal(input.sequence(), 42);
  assert.deepEqual(Array.from(input.controlsArray() ?? []), [1, -0.5, 0.3, 1, 0, 1, 0]);
  assert.deepEqual(Array.from(input.combatArray() ?? []), [6, 1, 0, 1, -0.2]);
  assert.deepEqual(
    [input.anim(), input.frame(), input.facing(), input.dress(), input.arms(), input.seen(), input.spawn()],
    ['ride_gallop', 3, -1.5, '{"body":"female"}', 0x10002, 977n, 3],
  );
  assert.equal(Input.getRootAsInput(new flatbuffers.ByteBuffer(inputBytes(1, parts))).dress(), null);
});

test('bytes that hold no message read as nothing', () => {
  assert.equal(readFromRoom(new Uint8Array()), null);
  assert.equal(readFromRoom(new Uint8Array([1, 2, 3])), null);
});
