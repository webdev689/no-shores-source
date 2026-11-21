import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import * as flatbuffers from 'flatbuffers';
import { FromRoom } from '../generated/messages/ts/overlook/wire.ts';
// The browser's side of the messages, so this run sends the room exactly the bytes a browser sends.
import { inputBytes, readFromRoom } from '../client/src/network/messages.ts';
import { ASKS, type GearAsk } from '../client/src/network/gearMessages.ts';
import { SnapshotKeeper } from '../client/src/network/snapshots.ts';
import { type RoomDoor, startRoomDoor } from './roomDoor.ts';

const compiled = new WebAssembly.Module(
  await readFile(new URL('../target/wasm32-unknown-unknown/release/room_wasm.wasm', import.meta.url)).catch(() => {
    throw new Error('room_wasm.wasm is not built: run `npm run wasm` first');
  }),
);

/** The asks of the houses' roads (`crates/protocol/src/gear_wire.rs`): a keeper spoken with, a fragment chosen. */
const SPEAK = 64 as number as GearAsk['kind'];

/** Flat land 10 m up over 4 km square round the origin, far from any coast. */
const grid = (fill: number) => ({
  width: 4,
  height: 4,
  left_m: -2000,
  top_m: -2000,
  cell_m: 1000,
  first_column: 0,
  first_row: 0,
  data: Array.from({ length: 16 }, () => fill),
});
const GROUND = {
  land: grid(10),
  lake_level: Array.from({ length: 16 }, () => 0),
  rivers: [],
  roads: [],
  towns: [],
  coast: grid(5000),
  across: grid(-50),
  pads: [],
  seed: 7,
};

/** A node 400 m square round the origin, its spawn near its southern edge. */
const node = (id: string, kind: string, more: object) => ({
  id,
  kind,
  name: id,
  continent: 'square',
  ring: [
    [-200, -200],
    [200, -200],
    [200, 200],
    [-200, 200],
  ],
  spawns: [[0, 180]],
  bounds: [-300, -300, 300, 300],
  boxes: [],
  ground: GROUND,
  ...more,
});

/** The Hall: the three houses' counters in a row by the spawn. */
const HALL = node('harbour-social', 'social', {
  counters: [
    { kind: 'stormcallers', at: [10, 150] },
    { kind: 'lamplighters', at: [20, 150] },
    { kind: 'veiled', at: [30, 150] },
  ],
});

const BEACON = [120, -120, 30];
const CAMP = [-120, -120, 48];
/** The Saltgrass Downs, holding the Old Beacon and Tithe Camp as its file names them. */
const DOWNS = node('saltgrass-downs', 'patrol', {
  places: [
    { name: 'The Old Beacon', at: BEACON.slice(0, 2), radius: BEACON[2] },
    { name: 'Tithe Camp', at: CAMP.slice(0, 2), radius: CAMP[2] },
  ],
});

/** The quest fields off a gear message, as a page reads them. */
interface Quests {
  readonly quest: number;
  readonly task: number;
  readonly counts: readonly number[];
  readonly done: readonly number[];
  readonly earned: readonly number[];
  readonly at: readonly number[];
  readonly art: number;
  readonly answer: number;
  readonly arms: readonly number[];
}

function questsOf(bytes: Uint8Array): Quests | null {
  const gear = bytes.length > 0 ? FromRoom.getRootAsFromRoom(new flatbuffers.ByteBuffer(bytes)).gear() : null;
  if (!gear) return null;
  const list = (numbers: ArrayLike<number> | null) => Array.from(numbers ?? []);
  return {
    quest: gear.quest(),
    task: gear.questTask(),
    counts: list(gear.questCountsArray()),
    done: list(gear.questsDoneArray()),
    earned: list(gear.artsEarnedArray()),
    at: list(gear.questAtArray()),
    art: gear.art(),
    answer: gear.answer(),
    arms: list(gear.armsArray()),
  };
}

/** One player walking a room: each tick an input standing still (facing `yaw`, swinging when asked), the gear
 *  message's quest fields as last sent, and the foes as the snapshots last showed them. */
class Walker {
  sequence = 0;
  quests: Quests | null = null;
  readonly kept = new SnapshotKeeper();
  foes: readonly { readonly x: number; readonly y: number }[] = [];

  readonly door: RoomDoor;
  readonly player: number;

  constructor(door: RoomDoor, player: number) {
    this.door = door;
    this.player = player;
  }

  tick(count: number, ask?: GearAsk, yaw = 0, swingEvery = 0): this {
    for (let tick = 0; tick < count; tick += 1) {
      this.sequence += 1;
      const swing = swingEvery > 0 && this.sequence % swingEvery === 0 ? 1 : 0;
      const intent = new Float64Array([0, 0, yaw, 0, 0, 0, 0, swing, 0, 0, 0, 0, 0, NaN, NaN, NaN, 0]);
      // The hands hold the loadout their gear allows, as a page takes it up: the sword they start with.
      const arms = this.quests?.arms.find((code) => code !== 0) ?? 0;
      const parts = { intent, look: { anim: '', frame: 0, facing: 0 }, arms, seen: BigInt(this.sequence - 1) };
      const bytes = inputBytes(this.sequence, tick === 0 && ask ? { ...parts, ask } : parts);
      assert.equal(this.door.input(this.player, bytes), 'taken');
      this.door.tick();
      this.quests = questsOf(this.door.gear(this.player)) ?? this.quests;
      const read = readFromRoom(this.door.snapshot(this.player));
      const message = read?.kind === 'snapshot' ? this.kept.whole(read) : null;
      if (message) this.foes = message.foes.map((foe) => ({ x: foe.glance[0] ?? 0, y: foe.glance[1] ?? 0 }));
    }
    return this;
  }

  /** Stands at a point, then takes an ask there over a gear message's turn. */
  standAt(x: number, y: number, ask?: GearAsk): Quests {
    assert.ok(this.door.putPlayer(this.player, x, y));
    this.tick(13, ask);
    assert.ok(this.quests, 'the gear message came');
    return this.quests;
  }
}

test('the opening is walked by speaking with each keeper and pledging, and the road reaches its place and counts a kill of the group it stands', () => {
  const hall = startRoomDoor(compiled);
  assert.equal(hall.openNode(JSON.stringify(HALL)), true);
  const walker = new Walker(hall, hall.join()).tick(2);
  assert.deepEqual(walker.quests, {
    quest: 1,
    task: 0,
    counts: [0, 0, 0],
    done: [0, 0, 0, 0],
    earned: [0, 0, 0],
    at: [],
    art: 0,
    answer: 0,
    arms: walker.quests?.arms ?? [],
  });
  assert.equal(walker.standAt(60, 150, { kind: SPEAK, column: 1 }).answer, 9, 'away from the counter: not here');
  assert.deepEqual(walker.standAt(10, 151, { kind: SPEAK, column: 1 }).counts, [1, 0, 0]);
  assert.deepEqual(walker.standAt(20, 151, { kind: SPEAK, column: 2 }).counts, [1, 1, 0]);
  const heard = walker.standAt(30, 151, { kind: SPEAK, column: 3 });
  assert.deepEqual([heard.quest, heard.task, heard.counts], [1, 1, [0]], 'the next task at once');
  const pledged = walker.standAt(10, 151, { kind: ASKS.pledge, column: 1 });
  assert.deepEqual([pledged.quest, pledged.task, pledged.done], [2, 0, [1, 0, 0, 0]], "the Stormcallers' road");
  const character = hall.character(walker.player);
  assert.ok(character);

  const downs = startRoomDoor(compiled);
  assert.equal(downs.openNode(JSON.stringify(DOWNS)), true);
  const player = downs.join();
  assert.equal(downs.restoreCharacter(player, character), true);
  const road = new Walker(downs, player).tick(2);
  assert.deepEqual([road.quests?.quest, road.quests?.task, road.quests?.at], [2, 0, BEACON], "the beacon's mark");
  const reached = road.standAt(BEACON[0] ?? 0, (BEACON[1] ?? 0) + 25);
  assert.deepEqual([reached.task, reached.counts, reached.at], [1, [0, 0], CAMP], 'the camp next, its mark');
  const near = (foe: { readonly x: number; readonly y: number }) =>
    Math.hypot(foe.x - (CAMP[0] ?? 0), foe.y - (CAMP[1] ?? 0)) < 6;
  road.standAt(CAMP[0] ?? 0, (CAMP[1] ?? 0) + 160);
  assert.equal(road.foes.filter(near).length, 0, '160 m off, nothing stands');
  road.standAt(CAMP[0] ?? 0, (CAMP[1] ?? 0) + 149);
  assert.equal(road.foes.filter(near).length, 5, 'within 150 m, its group stands');
  assert.ok(downs.putPlayer(player, CAMP[0] ?? 0, (CAMP[1] ?? 0) - 1.3));
  // The camp's first foe stands 2.5 m north of its middle, 1.2 m before the player: faced, swung at until one falls.
  for (let tick = 0; tick < 3600 && (road.quests?.counts[0] ?? 0) === 0; tick += 30) road.tick(30, undefined, 0, 15);
  assert.ok((road.quests?.counts[0] ?? 0) >= 1, `a kill counts: ${JSON.stringify(road.quests)}`);
  assert.equal(road.quests?.task, 1);
});
