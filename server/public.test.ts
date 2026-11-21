import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
// The browser's side of the messages, so this run sends the room exactly the bytes a browser sends.
import { inputBytes, readFromRoom } from '../client/src/network/messages.ts';
import { LocalRoom } from '../client/src/network/localRoom.ts';
import { BotPlay, decide, type Read, readOf, seasoned } from '../client/src/network/publicBots.ts';
import { startRoomDoor } from './roomDoor.ts';

const built = (path: string, how: string) =>
  readFile(new URL(`../target/${path}`, import.meta.url)).catch(() => {
    throw new Error(`${path} is not built: ${how}`);
  });
const compiled = new WebAssembly.Module(
  await built('wasm32-unknown-unknown/release/room_wasm.wasm', 'run `npm run wasm` first'),
);

/** The room door's test holds the same node, script and fingerprints (crates/room-wasm/src/public_door_tests.rs). */
const FISSURE_HASH = 'f9a9a33b';
const RAID_HASH = '84c7dd48';
const FISSURE_MINUTE = 15_000;
const RAID_MINUTE = 15_015;
const MOST_TICKS = 8 * 3_600;
/** A sword in the main hand, by combat's arms code. */
const SWORD = 2;

const grid = (value: number) => ({
  width: 4,
  height: 4,
  left_m: -2000,
  top_m: -2000,
  cell_m: 1000,
  first_column: 0,
  first_row: 0,
  data: Array.from({ length: 16 }, () => value),
});
/** Saltgrass Downs as a node with no garrison, on level land 10 m up, its spawns between its two grounds. */
const NODE = {
  id: 'saltgrass-downs',
  kind: 'social',
  name: 'Saltgrass Downs',
  continent: 'continent-1',
  ring: [
    [-200, -200],
    [200, -200],
    [200, 200],
    [-200, 200],
  ],
  spawns: [
    [30, -60],
    [34, -60],
  ],
  bounds: [-300, -300, 300, 300],
  boxes: [],
  grounds: {
    fissure: { at: [0, -100], radius: 30, growth: [17, -100] },
    raid: {
      at: [100, 0],
      radius: 30,
      stores: [
        [92, -4],
        [108, -4],
        [100, 10],
      ],
      approach: [100, -45],
      banners: [
        [94, -36],
        [106, -36],
      ],
    },
  },
  ground: {
    land: grid(10),
    lake_level: Array.from({ length: 16 }, () => 0),
    rivers: [],
    roads: [],
    towns: [],
    coast: grid(5000),
    across: grid(-50),
    pads: [],
    seed: 7,
  },
};

/** Plays an event from `minute` with two scripted players until its result has shown a second. */
async function play(minute: number): Promise<{ hash: string; ended: readonly number[] }> {
  const room = startRoomDoor(compiled);
  assert.equal(room.openNode(JSON.stringify(NODE)), true);
  assert.equal(room.minute(minute), true);
  const players = [room.join(), room.join()];
  // Raised as the page raises its bots (`&bots=`), so the fingerprints prove its bots are the rules' players.
  for (const player of players)
    assert.equal(room.restoreCharacter(player, seasoned(room.character(player) ?? '')), true);
  let hash = 0x811c_9dc5;
  let last: Read | null = null;
  let ended: { tick: number; event: number[] } | null = null;
  for (let tick = 1; tick <= MOST_TICKS; tick++) {
    for (const player of players) {
      const intent = decide(last, player, tick);
      const look = { anim: '', frame: 0, facing: 0 };
      const sent = inputBytes(tick, { intent, look, arms: SWORD, seen: BigInt(tick - 1) });
      assert.equal(room.input(player, sent), 'taken');
    }
    room.tick();
    const bytes = room.snapshot();
    for (const byte of bytes) hash = Math.imul(hash ^ byte, 0x0100_0193) >>> 0;
    const message = readFromRoom(bytes);
    if (message?.kind !== 'snapshot') throw new Error('a snapshot');
    last = readOf(message);
    const event = message.public;
    if (event && event.phase >= 2) ended ??= { tick, event: [event.kind, event.phase, event.heroic] };
    if (ended && tick >= ended.tick + 60) break;
  }
  return { hash: hash.toString(16).padStart(8, '0'), ended: ended?.event ?? [0, 0, 0] };
}

test('two scripted players seal a heroic Fissure to the same fingerprint through WebAssembly as natively', async () => {
  const { hash, ended } = await play(FISSURE_MINUTE);
  assert.deepEqual(ended, [1, 2, 2], 'the Fissure won, heroic');
  assert.equal(hash, FISSURE_HASH);
});

test('two scripted players hold a heroic raid to the same fingerprint through WebAssembly as natively', async () => {
  const { hash, ended } = await play(RAID_MINUTE);
  assert.deepEqual(ended, [2, 2, 2], 'the raid held, heroic');
  assert.equal(hash, RAID_HASH);
});

/** A dev page's own room (`&speed=`, `&bots=`, `&heroic=`) playing an event from `minute` with its bots beside the page's
 *  own player, who stands still: the event as it ended (its kind, phase and heroic task). */
function playInPage(minute: number, heroic: boolean): readonly number[] {
  let ended: readonly number[] | null = null;
  const room = LocalRoom.openNode(
    compiled,
    JSON.stringify(NODE),
    (snapshot) => {
      const event = snapshot.public;
      if (event && event.phase >= 2) ended ??= [event.kind, event.phase, event.heroic];
    },
    { minuteShift: minute - Math.floor(Date.now() / 60_000), play: new BotPlay({ speed: 60, bots: 2, heroic }) },
  );
  for (let frame = 0; frame * 60 < MOST_TICKS && !ended; frame++) room.pump(0);
  return ended ?? [0, 0, 0];
}

test("a dev page's bots play its own room's events through, the heroic task taken or left alone", () => {
  assert.deepEqual(playInPage(FISSURE_MINUTE, true), [1, 2, 2], 'the Fissure won, heroic');
  assert.deepEqual(playInPage(FISSURE_MINUTE, false), [1, 2, 3], 'the Fissure won, its heroic task missed');
  assert.deepEqual(playInPage(RAID_MINUTE, true), [2, 2, 2], 'the raid held, heroic');
  assert.deepEqual(playInPage(RAID_MINUTE, false), [2, 2, 3], 'the raid held, its heroic task missed');
});
