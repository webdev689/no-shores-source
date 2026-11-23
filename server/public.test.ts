import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
// The browser's side of the messages, so this run sends the room exactly the bytes a browser sends.
import { inputBytes, readFromRoom } from '../client/src/network/messages.ts';
import { LocalRoom } from '../client/src/network/localRoom.ts';
import { askedPlay, BotPlay, decide, type Read, readOf, seasoned } from '../client/src/network/publicBots.ts';
import { startRoomDoor } from './roomDoor.ts';

const built = (path: string, how: string) =>
  readFile(new URL(`../target/${path}`, import.meta.url)).catch(() => {
    throw new Error(`${path} is not built: ${how}`);
  });
const compiled = new WebAssembly.Module(
  await built('wasm32-unknown-unknown/release/room_wasm.wasm', 'run `npm run wasm` first'),
);

/** The room door's test holds the same node and script; its fingerprints, minutes and where each event ended are read
 *  from it (crates/room-wasm/src/public_door_tests.rs), so the two can never hold different ones. */
const door = await readFile(new URL('../crates/room-wasm/src/public_door_tests.rs', import.meta.url), 'utf8');
const doorHolds = (name: string): string => {
  const found = new RegExp(`const ${name}: [^=]+= ([^;]+);`).exec(door)?.[1];
  if (found === undefined) throw new Error(`${name} is not in the room door's test`);
  return found;
};
const doorNumbers = (name: string): number[] =>
  doorHolds(name)
    .replace(/[[\]"]/g, '')
    .split(',')
    .map((each) => each.split('*').reduce((product, part) => product * Number(part.trim().replaceAll('_', '')), 1));
const FISSURE_HASH = doorHolds('FISSURE_HASH').replaceAll('"', '');
const RAID_HASH = doorHolds('RAID_HASH').replaceAll('"', '');
const [FISSURE_MINUTE = 0] = doorNumbers('FISSURE_MINUTE');
const [RAID_MINUTE = 0] = doorNumbers('RAID_MINUTE');
const [MOST_TICKS = 0] = doorNumbers('MOST_TICKS');
/** A viewer who is no player: the snapshot cut for them is whole, everyone and every foe packed. */
const NO_VIEWER = 0;
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
async function play(minute: number): Promise<{ hash: string; ended: readonly number[]; at: readonly number[] }> {
  const room = startRoomDoor(compiled);
  assert.equal(room.openNode(JSON.stringify(NODE)), true);
  assert.equal(room.minute(minute), true);
  const players = [room.join(), room.join()];
  // Raised as the page raises its bots (`&bots=`), so the fingerprints prove its bots are the rules' players.
  for (const player of players) assert.equal(room.restoreCharacter(player, seasoned(room.kitted())), true);
  let hash = 0x811c_9dc5;
  let last: Read | null = null;
  let ended: { tick: number; event: number[]; at: number[] } | null = null;
  for (let tick = 1; tick <= MOST_TICKS; tick++) {
    for (const player of players) {
      const intent = decide(last, player, tick);
      const look = { anim: '', frame: 0, facing: 0 };
      const sent = inputBytes(tick, { intent, look, arms: SWORD, seen: BigInt(tick - 1) });
      assert.equal(room.input(player, sent), 'taken');
    }
    room.tick();
    const bytes = room.snapshot(players[0] ?? 0);
    for (const byte of bytes) hash = Math.imul(hash ^ byte, 0x0100_0193) >>> 0;
    // Read whole, as cut for a viewer who is no player, as the room door's test reads it.
    const message = readFromRoom(room.snapshot(NO_VIEWER));
    if (message?.kind !== 'snapshot') throw new Error('a snapshot');
    last = readOf(message);
    const event = message.public;
    if (event && event.phase >= 2) {
      ended ??= { tick, event: [event.kind, event.phase, event.heroic], at: [tick, event.stage, event.progress] };
    }
    if (ended && tick >= ended.tick + 60) break;
  }
  const hex = hash.toString(16).padStart(8, '0');
  return { hash: hex, ended: ended?.event ?? [0, 0, 0], at: ended?.at ?? [0, 0, 0] };
}

test('two scripted players seal a heroic Fissure to the same fingerprint through WebAssembly as natively', async () => {
  const { hash, ended, at } = await play(FISSURE_MINUTE);
  assert.deepEqual(ended, [1, 2, 2], 'the Fissure won, heroic');
  assert.deepEqual(at, doorNumbers('FISSURE_ENDED'), "the tick it was won at, the Warden's stage and the shards set");
  assert.equal(hash, FISSURE_HASH);
});

test('two scripted players meet a raid’s heroic task and hold its stores, to the same fingerprint in WebAssembly as natively', async () => {
  const { hash, ended, at } = await play(RAID_MINUTE);
  assert.deepEqual(ended, [2, 2, 2], 'the raid won, its heroic task met');
  assert.deepEqual(at, doorNumbers('RAID_ENDED'), 'the tick it was won at, its wave and the stores left');
  assert.equal(hash, RAID_HASH);
});

/** A dev page's own room (`&speed=`, `&bots=`, `&heroic=`) playing an event from `minute` with its bots beside the page's
 *  own player, who stands still: the event as it ended (its kind, phase and heroic task). */
function playInPage(minute: number, heroic: boolean): readonly number[] {
  let ended: readonly number[] | null = null;
  // The world's minute held still, so the event starts at `minute` however long the play takes.
  const realNow = Date.now;
  const now = realNow();
  Date.now = () => now;
  try {
    const room = LocalRoom.openNode(
      compiled,
      JSON.stringify(NODE),
      (snapshot) => {
        const event = snapshot.public;
        if (event && event.phase >= 2) ended ??= [event.kind, event.phase, event.heroic];
      },
      false,
      { minuteShift: minute - Math.floor(now / 60_000), play: new BotPlay({ speed: 60, bots: 2, heroic }) },
    );
    for (let frame = 0; frame * 60 < MOST_TICKS && !ended; frame++) room.pump(0);
  } finally {
    Date.now = realNow;
  }
  return ended ?? [0, 0, 0];
}

test("a dev page's bots play its own room's events through, the heroic task taken or left alone", () => {
  assert.deepEqual(playInPage(FISSURE_MINUTE, true), [1, 2, 2], 'the Fissure won, heroic');
  assert.deepEqual(playInPage(FISSURE_MINUTE, false), [1, 2, 3], 'the Fissure won, its heroic task missed');
  assert.deepEqual(playInPage(RAID_MINUTE, true), [2, 2, 2], 'the raid held, its heroic task met');
  assert.deepEqual(playInPage(RAID_MINUTE, false), [2, 2, 3], 'the raid held, its heroic task missed');
});

test("the dev address's play: ticks a frame, bots, and the heroic task left alone only when asked", () => {
  assert.deepEqual(askedPlay('?at=gullwing-vale&public=raid&speed=12&bots=3'), { speed: 12, bots: 3, heroic: true });
  assert.deepEqual(askedPlay('?bots=2&heroic=0'), { speed: 0, bots: 2, heroic: false });
  assert.deepEqual(askedPlay('?speed=999&bots=-4'), { speed: 64, bots: 0, heroic: true });
  assert.equal(askedPlay('?public=fissure&speed=x'), null);
});
