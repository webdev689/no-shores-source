import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
// The browser's side of the messages, so this run sends the room exactly the bytes a browser sends.
import { inputBytes, readFromRoom } from '../client/src/network/messages.ts';
import { startRoomDoor } from './roomDoor.ts';

const compiled = new WebAssembly.Module(
  await readFile(new URL('../target/wasm32-unknown-unknown/release/room_wasm.wasm', import.meta.url)).catch(() => {
    throw new Error('room_wasm.wasm is not built: run `npm run wasm` first');
  }),
);

/** The room door's agreement test holds the same node, script and fingerprint
 *  (crates/room-wasm/src/garrison_door_tests.rs). */
const GARRISON_HASH = '0453ef17';
const RUN_IN = 420;
const SWING_EVERY = 30;
const RUN_TICKS = 1500;

/** A mission's node: a section 400 m square on land rising 300 m a kilometre east and south, its two spawns near its
 *  southern edge. */
const grid = (data: readonly number[]) => ({
  width: 4,
  height: 4,
  left_m: -2000,
  top_m: -2000,
  cell_m: 1000,
  first_column: 0,
  first_row: 0,
  data,
});
const NODE = {
  id: 'glade',
  kind: 'mission',
  name: 'The Glade',
  continent: 'square',
  ring: [
    [-200, -200],
    [200, -200],
    [200, 200],
    [-200, 200],
  ],
  spawns: [
    [0, 180],
    [15, 185],
  ],
  bounds: [-300, -300, 300, 300],
  boxes: [],
  ground: {
    land: grid(Array.from({ length: 16 }, (unused, cell) => ((cell % 4) + Math.floor(cell / 4)) * 300)),
    lake_level: Array.from({ length: 16 }, () => 0),
    rivers: [],
    roads: [],
    towns: [],
    coast: grid(Array.from({ length: 16 }, () => 5000)),
    across: grid(Array.from({ length: 16 }, () => -50)),
    pads: [],
    seed: 7,
  },
};

test('a node’s garrison fights to the same fingerprint through WebAssembly as the room natively', () => {
  const room = startRoomDoor(compiled);
  assert.equal(room.openNode(JSON.stringify(NODE)), true);
  const player = room.join();
  let hash = 0x811c_9dc5;
  let mostAlert = 0;
  let events = 0;
  for (let tick = 1; tick <= RUN_TICKS; tick++) {
    const running = tick <= RUN_IN;
    const swing = !running && tick % SWING_EVERY === 0 ? 1 : 0;
    const intent = new Float64Array([running ? 1 : 0, 0, 0, 1, 0, 0, 0, swing, 0, 0, 0, 0, 0, NaN, NaN, NaN]);
    const look = { anim: '', frame: 0, facing: 0 };
    assert.equal(room.input(player, inputBytes(tick, { intent, look, arms: 0, seen: BigInt(tick - 1) })), 'taken');
    room.tick();
    const bytes = room.snapshot();
    for (const byte of bytes) hash = Math.imul(hash ^ byte, 0x0100_0193) >>> 0;
    const message = readFromRoom(bytes);
    if (message?.kind !== 'snapshot') continue;
    mostAlert = Math.max(mostAlert, message.foes.filter((foe) => foe.alert === 2).length);
    events += message.events.length;
  }
  assert.ok(mostAlert >= 3 && events > 0, `the garrison fights: ${mostAlert} alert at once, ${events} events`);
  assert.equal(hash.toString(16).padStart(8, '0'), GARRISON_HASH);
});
