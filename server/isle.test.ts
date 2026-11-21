import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { startRoomDoor } from './roomDoor.ts';

const compiled = new WebAssembly.Module(
  await readFile(new URL('../target/wasm32-unknown-unknown/release/room_wasm.wasm', import.meta.url)).catch(() => {
    throw new Error('room_wasm.wasm is not built: run `npm run wasm` first');
  }),
);

/** The isle crate's own test pins the same fingerprint natively (crates/isle/src/tests.rs, GROUND_41_DESERT). */
const GROUND_41_DESERT = '5372bca559dd7c59';

/** FNV-1a over the numbers' bits, little-endian, as the crate's test takes it. */
function fingerprint(numbers: Float64Array): string {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new Uint8Array(numbers.buffer, numbers.byteOffset, numbers.byteLength)) {
    hash = BigInt.asUintN(64, (hash ^ BigInt(byte)) * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, '0');
}

test("the page's WebAssembly builds an island's ground to the room's own bits", () => {
  const door = startRoomDoor(compiled);
  assert.equal(fingerprint(door.isleHeights('41', 'desert', [0, 0])), GROUND_41_DESERT);
});

/** crates/room-wasm/src/isle_door_tests.rs pins the same of the room's own plans (PLANS): a cove and a quarry. */
const PLANS = 'b34441b512d89694';

test("the page's WebAssembly lays every module, block and post of an island where the room does", () => {
  const door = startRoomDoor(compiled);
  const text = door.islePlan('41', 'desert') + door.islePlan('2', 'rainforest');
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(text)) hash = BigInt.asUintN(64, (hash ^ BigInt(byte)) * 0x100000001b3n);
  assert.equal(hash.toString(16).padStart(16, '0'), PLANS);
});

test("an island's plan comes to the page whole, and none for home waters' climate", () => {
  const door = startRoomDoor(compiled);
  const plan = JSON.parse(door.islePlan('41', 'desert')) as { kind: string; spawns: unknown[]; placements: unknown[] };
  assert.ok(['cove', 'ruin', 'quarry'].includes(plan.kind));
  assert.equal(plan.spawns.length, 3);
  assert.ok(plan.placements.length > 20);
  assert.equal(door.islePlan('41', 'temperate-coast'), '');
  assert.equal(door.isleHeights('41', 'moon', [0, 0]).length, 0);
});

test("an island's room opens only on a word that makes an island", () => {
  const door = startRoomDoor(compiled);
  assert.equal(
    door.openIsland('{"seed":"41","climate":"desert","at":[700000,300000],"guards":2,"levels":[10,14]}'),
    true,
  );
  assert.ok(door.join() > 0);
  assert.equal(startRoomDoor(compiled).openIsland('{"seed":"41"}'), false);
});

test("an island's room checks landings, which only a sea answers", () => {
  const door = startRoomDoor(compiled);
  assert.equal(door.openIsland('{"seed":"41","climate":"desert","at":[700000,300000],"guards":0,"levels":null}'), true);
  assert.equal(door.checkLandings(), true);
  assert.equal(door.land('account-a'), true);
  assert.equal(door.seaLanded(1, '41', 'account-a'), false, 'an island room is no sea');
});
