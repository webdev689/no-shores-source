import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { runAsk } from './roomNames.ts';
import { startRoomDoor } from './roomDoor.ts';
import { pinned } from './pinnedForTests.ts';

const compiled = new WebAssembly.Module(
  await readFile(new URL('../target/wasm32-unknown-unknown/release/room_wasm.wasm', import.meta.url)).catch(() => {
    throw new Error('room_wasm.wasm is not built: run `npm run wasm` first');
  }),
);

/** The isle crate's own test holds the same fingerprint natively (crates/isle/src/tests.rs). */
const GROUND_41_DESERT = pinned('isle.ground_41_desert');

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

/** crates/room-wasm/src/isle_door_tests.rs holds the same of the room's own plans: a cove and a quarry. */
const PLANS = pinned('isle.plans');

test("the page's WebAssembly lays every module, block and post of an island where the room does", () => {
  const door = startRoomDoor(compiled);
  const text = door.islePlan('41', 'desert') + door.islePlan('2', 'rainforest');
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(text)) hash = BigInt.asUintN(64, (hash ^ BigInt(byte)) * 0x100000001b3n);
  assert.equal(hash.toString(16).padStart(16, '0'), PLANS);
});

test("an island's plan comes to the page whole, and none for a climate the islands do not dress", () => {
  const door = startRoomDoor(compiled);
  const plan = JSON.parse(door.islePlan('41', 'desert')) as { kind: string; spawns: unknown[]; placements: unknown[] };
  assert.ok(['cove', 'ruin', 'quarry'].includes(plan.kind));
  assert.equal(plan.spawns.length, 3);
  assert.ok(plan.placements.length > 20);
  assert.equal(door.islePlan('41', 'moon'), '');
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

/** XP reaching levels 9, 10, 19 and 20 (`gear::power::xp_for_level`). */
const [LEVEL_9, LEVEL_10, LEVEL_19, LEVEL_20] = [36_000, 45_000, 171_000, 190_000];

/** Why a room's gate shuts to its new player's character raised to `earned` XP, '' where it opens. */
function shutAt(door: ReturnType<typeof startRoomDoor>, earned: number): string {
  const player = door.join();
  const kept = JSON.parse(door.character(player) ?? '{}') as { xp: number };
  return door.shut(player, JSON.stringify({ ...kept, xp: earned }));
}

test("an island's room and its dungeon's run at a tier shut by level, as the voyage's card shuts that tier", () => {
  const island = startRoomDoor(compiled);
  const word = '{"seed":"41","climate":"desert","at":[700000,300000],"guards":0,"levels":null}';
  assert.equal(island.openIsland(word), true);
  assert.equal(island.difficulty(1), true, 'landed at Elite');
  assert.equal(shutAt(island, LEVEL_9), 'Elite seas open at level 10.');
  assert.equal(shutAt(island, LEVEL_10), '');
  const run = startRoomDoor(compiled);
  const name = 'sea-dungeon-continent-1-crypt-0000002a--abyss--run-k3j4h5g6';
  assert.equal(run.openRun(runAsk(name, 29_919_420) ?? ''), true);
  assert.equal(shutAt(run, LEVEL_19), 'Abyss seas open at level 20.');
  assert.equal(shutAt(run, LEVEL_20), '');
});

test("an island's room checks landings, which only a sea answers", () => {
  const door = startRoomDoor(compiled);
  assert.equal(door.openIsland('{"seed":"41","climate":"desert","at":[700000,300000],"guards":0,"levels":null}'), true);
  assert.equal(door.checkLandings(), true);
  assert.equal(door.land('account-a', 1), true);
  assert.equal(door.seaLanded(1, '41', 'account-a'), 0, 'an island room is no sea');
});

test("a sea island's dungeon has its sea's word only behind the door of an island the sea holds", () => {
  const door = startRoomDoor(compiled);
  const layout = `{ "continents": [{ "id": "continent-4", "climate": "desert", "outline": ${JSON.stringify([
    [100000, 100000],
    [200000, 100000],
    [200000, 200000],
    [100000, 200000],
  ])} }], "isles": [] }`;
  assert.equal(door.openSea(layout, 7), true);
  assert.equal(door.seaDungeon('sea-dungeon-continent-4-caverns-0a1b2c3d'), '', 'no island stands');
  assert.equal(startRoomDoor(compiled).seaDungeon('sea-dungeon-continent-4-caverns-0a1b2c3d'), '', 'no sea is open');
});
