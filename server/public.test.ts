import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
// The browser's side of the messages, so this run sends the room exactly the bytes a browser sends.
import { inputBytes, readFromRoom } from '../client/src/network/messages.ts';
import type { PublicEvent } from '../client/src/network/publicMessages.ts';
import { startRoomDoor } from './roomDoor.ts';

const built = (path: string, how: string) =>
  readFile(new URL(`../target/${path}`, import.meta.url)).catch(() => {
    throw new Error(`${path} is not built: ${how}`);
  });
const compiled = new WebAssembly.Module(
  await built('wasm32-unknown-unknown/release/room_wasm.wasm', 'run `npm run wasm` first'),
);

/** The room door's test holds the same node, script and fingerprints (crates/room-wasm/src/public_door_tests.rs). */
const FISSURE_HASH = '89000314';
const RAID_HASH = 'b9bce62f';
const FISSURE_MINUTE = 15_000;
const RAID_MINUTE = 15_015;
const MOST_TICKS = 8 * 3_600;
const STRIKE = 1.5 * 1.5;
const SWING_EVERY = 20;
const GOT = 0.5 * 0.5;
const NEAR_AXIS = 0.4142135623730951;
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

type Point = readonly [number, number];
interface Read {
  readonly players: readonly { readonly id: number; readonly at: Point }[];
  readonly foes: readonly {
    readonly id: number;
    readonly faction: number;
    readonly type: number;
    readonly at: Point;
  }[];
  readonly event: PublicEvent | null;
}

const apart = (one: Point, two: Point) => (one[0] - two[0]) * (one[0] - two[0]) + (one[1] - two[1]) * (one[1] - two[1]);

/** The nearest of `points` to `from`, the first of any as near. */
function nearest(from: Point, points: readonly (readonly [number, Point])[]): readonly [number, Point] | null {
  let best: readonly [number, Point] | null = null;
  for (const each of points) if (!best || apart(from, best[1]) > apart(from, each[1])) best = each;
  return best;
}

/** The nearest of the eight compass points to a heading, by comparisons alone (as the Rust script turns). */
function yawToward(east: number, south: number): number {
  const north = -south;
  let point: number;
  if (Math.abs(east) < Math.abs(north) * NEAR_AXIS) point = north > 0 ? 0 : 4;
  else if (Math.abs(north) < Math.abs(east) * NEAR_AXIS) point = east > 0 ? 2 : 6;
  else if (east > 0) point = north > 0 ? 1 : 3;
  else point = north > 0 ? 7 : 5;
  return point * (Math.PI / 4);
}

/** What a scripted player does this tick, as the intent's numbers. */
function decide(read: Read | null, player: number, tick: number): Float64Array {
  const intent = (forward: number, yaw: number, run: number, stroke: number, guard: number) =>
    new Float64Array([forward, 0, yaw, run, 0, 0, 0, stroke, guard, 0, 0, 0, 0, NaN, NaN, NaN]);
  const still = intent(0, 0, 0, 0, 0);
  const feet = read?.players.find((each) => each.id === player)?.at;
  const event = read?.event;
  if (!read || !feet || !event) return still;
  const marks = (kind: number) => event.marks.filter((mark) => mark.kind === kind);
  const ofFaction = (faction: number, type: number) =>
    read.foes
      .filter((foe) => foe.faction === faction && (type === 0 || foe.type === type))
      .map((foe) => [foe.id, foe.at] as const);
  let walk: Point | null = null;
  let strike: number | null = null;
  if (event.kind === 1 && event.phase === 1) {
    if (marks(5).some((carried) => carried.id === player)) walk = [event.ground[0], event.ground[1]];
    else if (event.heroic === 1 && marks(2).length > 0) strike = marks(2)[0]?.id ?? null;
    else if (marks(4).length > 0)
      walk =
        nearest(
          feet,
          marks(4).map((shard) => [shard.id, [shard.at[0], shard.at[1]]] as const),
        )?.[1] ?? null;
    else strike = nearest(feet, ofFaction(3, 0))?.[0] ?? null;
  } else if (event.kind === 2 && event.phase === 1) {
    if (marks(6).length > 0) strike = marks(6)[0]?.id ?? null;
    else strike = (nearest(feet, ofFaction(1, 2)) ?? nearest(feet, ofFaction(1, 0)))?.[0] ?? null;
  }
  const goal = walk ?? (strike === null ? null : (read.foes.find((foe) => foe.id === strike)?.at ?? null));
  if (!goal) return still;
  const yaw = yawToward(goal[0] - feet[0], goal[1] - feet[1]);
  if (apart(feet, goal) > (strike === null ? GOT : STRIKE)) return intent(1, yaw, 1, 0, 0);
  const swing = strike !== null && tick % SWING_EVERY === 0;
  const stroke = [1, 2, 3, 4, 5, 6][Math.floor(tick / SWING_EVERY) % 6] ?? 1;
  return intent(0, yaw, 0, swing ? stroke : 0, strike !== null && !swing ? 1 : 0);
}

/** Plays an event from `minute` with two scripted players until its result has shown a second. */
async function play(minute: number): Promise<{ hash: string; ended: readonly number[] }> {
  const character = (await built('protocol/scripted-character.json', 'run `cargo test -p room-wasm`')).toString();
  const room = startRoomDoor(compiled);
  assert.equal(room.openNode(JSON.stringify(NODE)), true);
  assert.equal(room.minute(minute), true);
  const players = [room.join(), room.join()];
  for (const player of players) assert.equal(room.restoreCharacter(player, character), true);
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
    last = {
      players: message.players.map((seen) => ({ id: seen.player, at: [seen.body.x, seen.body.y] as const })),
      foes: message.foes
        .filter((foe) => (foe.glance[10] ?? 0) > 0)
        .map((foe) => ({
          id: foe.id,
          faction: foe.faction,
          type: foe.type,
          at: [foe.glance[0] ?? 0, foe.glance[1] ?? 0] as const,
        })),
      event: message.public,
    };
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
