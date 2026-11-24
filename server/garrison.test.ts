import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
// The browser's side of the messages, so this run sends the room exactly the bytes a browser sends.
import { inputBytes, readFromRoom } from '../client/src/network/messages.ts';
import { SnapshotKeeper } from '../client/src/network/snapshots.ts';
import { startRoomDoor } from './roomDoor.ts';

const compiled = new WebAssembly.Module(
  await readFile(new URL('../target/wasm32-unknown-unknown/release/room_wasm.wasm', import.meta.url)).catch(() => {
    throw new Error('room_wasm.wasm is not built: run `npm run wasm` first');
  }),
);

/** The room door's agreement test holds the same node, script and fingerprint
 *  (crates/room-wasm/src/garrison_door_tests.rs). */
const GARRISON_HASH = 'd4b41f69';
const RUN_IN = 420;
const SWING_EVERY = 30;
const RUN_TICKS = 1500;

/** A mission's node: a section 400 m square on land rising 300 m a kilometre east and south, its two spawns near its
 *  southern edge, and in the square its room bakes a wall from below the ground up and a roof 4 m or more over it. */
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
  boxes: [
    [-10, 152, 10, 153, 970, 900],
    [15, 145, 25, 160, 962.5, 962],
  ],
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

/** A player run north into a node's garrison for RUN_IN ticks, then standing and swinging each SWING_EVERY ticks until
 *  RUN_TICKS: the fingerprint of its snapshots, the most foes alert at once, and the events it saw. */
function runIn(node: object): { hash: string; mostAlert: number; events: number } {
  const room = startRoomDoor(compiled);
  assert.equal(room.openNode(JSON.stringify(node)), true);
  const player = room.join();
  const kept = new SnapshotKeeper();
  let hash = 0x811c_9dc5;
  let mostAlert = 0;
  let events = 0;
  for (let tick = 1; tick <= RUN_TICKS; tick++) {
    const running = tick <= RUN_IN;
    const swing = !running && tick % SWING_EVERY === 0 ? 1 : 0;
    const intent = new Float64Array([running ? 1 : 0, 0, 0, 1, 0, 0, 0, 0, swing, 0, 0, 0, 0, 0, NaN, NaN, NaN, 0]);
    const look = { anim: '', frame: 0, facing: 0 };
    assert.equal(room.input(player, inputBytes(tick, { intent, look, arms: 0, seen: BigInt(tick - 1) })), 'taken');
    room.tick();
    const bytes = room.snapshot(player);
    for (const byte of bytes) hash = Math.imul(hash ^ byte, 0x0100_0193) >>> 0;
    const read = readFromRoom(bytes);
    // Kept whole as a page keeps it: a snapshot names only the foes that changed since the last one shown.
    const message = read?.kind === 'snapshot' ? kept.whole(read) : null;
    if (!message) continue;
    mostAlert = Math.max(mostAlert, message.foes.filter((foe) => foe.alert === 2).length);
    events += message.events.length;
  }
  return { hash: hash.toString(16).padStart(8, '0'), mostAlert, events };
}

test('a node’s garrison fights to the same fingerprint through WebAssembly as the room natively', () => {
  const { hash, mostAlert, events } = runIn(NODE);
  assert.ok(mostAlert >= 3 && events > 0, `the garrison fights: ${mostAlert} alert at once, ${events} events`);
  assert.equal(hash, GARRISON_HASH);
});

/** The room door's agreement test holds the same run and fingerprint: the node as a patrol whose layout marks a foes'
 *  site the player runs near, so its group stands mid-run on a mesh baked round it then. */
const PATROL_SITE_HASH = 'ade4d029';

test('a patrol’s foes’ site stands its group to the same fingerprint through WebAssembly as natively', () => {
  const { hash, mostAlert } = runIn({ ...NODE, kind: 'patrol', foes: [[-60, 40]] });
  assert.ok(mostAlert >= 1, 'its foes fight');
  assert.equal(hash, PATROL_SITE_HASH);
});

/** The room door's agreement test holds the same run and fingerprint: two players, the garrison's foes shared out
 *  between them. */
const GARRISON_PAIR_HASH = '212fe761';

test('two players against a node’s garrison fight to the same fingerprint through WebAssembly as natively', () => {
  const room = startRoomDoor(compiled);
  assert.equal(room.openNode(JSON.stringify(NODE)), true);
  const players = [room.join(), room.join()];
  let hash = 0x811c_9dc5;
  const struck = [0, 0];
  for (let tick = 1; tick <= RUN_TICKS; tick++) {
    players.forEach((player, index) => {
      // The second player swings half a beat of swings after the first.
      const running = tick <= RUN_IN;
      const swing = !running && (tick + 15 * index) % SWING_EVERY === 0 ? 1 : 0;
      const intent = new Float64Array([running ? 1 : 0, 0, 0, 1, 0, 0, 0, 0, swing, 0, 0, 0, 0, 0, NaN, NaN, NaN, 0]);
      const look = { anim: '', frame: 0, facing: 0 };
      assert.equal(room.input(player, inputBytes(tick, { intent, look, arms: 0, seen: BigInt(tick - 1) })), 'taken');
    });
    room.tick();
    // Each player's own snapshot, the first's then the second's; every event comes in both.
    const bytes = room.snapshot(players[0] ?? 0);
    for (const byte of [...bytes, ...room.snapshot(players[1] ?? 0)]) hash = Math.imul(hash ^ byte, 0x0100_0193) >>> 0;
    const message = readFromRoom(bytes);
    if (message?.kind !== 'snapshot') continue;
    for (const event of message.events) {
      const index = players.indexOf(event.defender);
      if (index >= 0 && event.striker !== event.defender) struck[index] = (struck[index] ?? 0) + 1;
    }
  }
  assert.ok(
    struck.every((blows) => blows > 0),
    `the garrison fights both players: ${struck.join(', ')}`,
  );
  assert.equal(hash.toString(16).padStart(8, '0'), GARRISON_PAIR_HASH);
});
