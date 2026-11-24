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
import book from '../content/quests/quests.json' with { type: 'json' };

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

/** The Stormcallers' road as the file lays it: its first task's place reached, and the next task's kill goal with a
 *  group to stand, by its place among that task's goals. */
const STORM = book.quests.find((quest) => quest.id === 'stormcallers');
const REACHED = STORM?.tasks[0]?.goals[0];
const TAKEN = STORM?.tasks[1]?.goals ?? [];
const KILL = TAKEN.findIndex((goal) => goal.kind === 'kill' && 'spawn' in goal);
const KILLED = TAKEN[KILL];
const BEACON = [120, -120, 30];
const CAMP = [-120, -120, 48];
/** The Saltgrass Downs, holding the road's first place and its camp as its file names them. */
const DOWNS = node(REACHED && 'node' in REACHED ? String(REACHED.node) : '', 'patrol', {
  places: [
    { name: REACHED && 'place' in REACHED ? REACHED.place : '', at: BEACON.slice(0, 2), radius: BEACON[2] },
    { name: KILLED && 'place' in KILLED ? KILLED.place : '', at: CAMP.slice(0, 2), radius: CAMP[2] },
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
      const intent = new Float64Array([0, 0, yaw, 0, 0, 0, 0, 0, swing, 0, 0, 0, 0, 0, NaN, NaN, NaN, 0]);
      // The hands hold the loadout their gear allows, as a page takes it up: the kitted character's sword.
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
    counts: [0],
    done: [0, 0, 0, 0],
    earned: [0, 0, 0],
    at: [],
    art: 0,
    answer: 0,
    arms: walker.quests?.arms ?? [],
  });
  // The stranger is heard anywhere in the social space; her task done, the round of the counters begins.
  const welcomed = walker.standAt(60, 150, { kind: SPEAK, column: 18 });
  assert.deepEqual([welcomed.answer, welcomed.task], [0, 1]);
  // A character armed and on the houses, as one who walked the round and bought their gear stands.
  const kit = JSON.parse(hall.kitted()) as { quests: object };
  kit.quests = { roads: { house: { task: 'hear-three-houses' } } };
  assert.equal(hall.restoreCharacter(walker.player, JSON.stringify(kit)), true);
  assert.equal(walker.standAt(60, 150, { kind: SPEAK, column: 1 }).answer, 9, 'away from the counter: not here');
  assert.deepEqual(walker.standAt(10, 151, { kind: SPEAK, column: 1 }).counts, [1, 0, 0]);
  assert.deepEqual(walker.standAt(20, 151, { kind: SPEAK, column: 2 }).counts, [1, 1, 0]);
  const heard = walker.standAt(30, 151, { kind: SPEAK, column: 3 });
  const choose = book.quests[0]?.tasks.findIndex((task) => task.id === 'choose-house');
  assert.deepEqual([heard.quest, heard.task, heard.counts], [1, choose, [0]], 'the next task at once');
  const pledged = walker.standAt(10, 151, { kind: ASKS.pledge, column: 1 });
  assert.deepEqual([pledged.quest, pledged.task, pledged.done], [2, 0, [1, 0, 0, 0]], "the Stormcallers' road");
  // On foot the page tells its room the story is behind it, which a patrol's gate asks.
  walker.standAt(10, 151, { kind: ASKS.finishPrologue });
  const character = hall.character(walker.player);
  assert.ok(character);

  const downs = startRoomDoor(compiled);
  assert.equal(downs.openNode(JSON.stringify(DOWNS)), true);
  const player = downs.join();
  assert.equal(downs.restoreCharacter(player, character), true);
  const road = new Walker(downs, player).tick(2);
  assert.deepEqual([road.quests?.quest, road.quests?.task, road.quests?.at], [2, 0, BEACON], "the beacon's mark");
  const reached = road.standAt(BEACON[0] ?? 0, (BEACON[1] ?? 0) + 25);
  assert.deepEqual(
    [reached.task, reached.counts, reached.at],
    [1, TAKEN.map(() => 0), CAMP],
    'the camp next, its mark',
  );
  const near = (foe: { readonly x: number; readonly y: number }) =>
    Math.hypot(foe.x - (CAMP[0] ?? 0), foe.y - (CAMP[1] ?? 0)) < 6;
  road.standAt(CAMP[0] ?? 0, (CAMP[1] ?? 0) + 160);
  assert.equal(road.foes.filter(near).length, 0, '160 m off, nothing stands');
  road.standAt(CAMP[0] ?? 0, (CAMP[1] ?? 0) + 149);
  assert.equal(road.foes.filter(near).length, 5, 'within 150 m, its group stands');
  assert.ok(downs.putPlayer(player, CAMP[0] ?? 0, (CAMP[1] ?? 0) - 1.3));
  // The camp's first foe stands 2.5 m north of its middle, 1.2 m before the player: the player turns to the nearest
  // foe each half second and swings at it until one falls.
  const stand = [CAMP[0] ?? 0, (CAMP[1] ?? 0) - 1.3] as const;
  const facing = (): number => {
    const away = (foe: { readonly x: number; readonly y: number }) => Math.hypot(foe.x - stand[0], foe.y - stand[1]);
    const nearest = road.foes.reduce<{ readonly x: number; readonly y: number } | null>(
      (best, foe) => (best === null || away(foe) < away(best) ? foe : best),
      null,
    );
    return nearest ? Math.atan2(nearest.x - stand[0], -(nearest.y - stand[1])) : 0;
  };
  for (let tick = 0; tick < 3600 && (road.quests?.counts[KILL] ?? 0) === 0; tick += 30) {
    road.tick(30, undefined, facing(), 15);
  }
  assert.ok((road.quests?.counts[KILL] ?? 0) >= 1, `a kill counts: ${JSON.stringify(road.quests)}`);
  assert.equal(road.quests?.task, 1);
});

test('a player whose page keeps no character plays the room’s as their own, and its word says so', () => {
  const door = startRoomDoor(compiled);
  assert.equal(door.openNode(JSON.stringify(HALL)), true);
  const player = door.join();
  const claimed = () => {
    const bytes = door.gear(player);
    return FromRoom.getRootAsFromRoom(new flatbuffers.ByteBuffer(bytes)).gear()?.claimed();
  };
  assert.equal(claimed(), false, 'a claim may still come');
  // The worker says so once the player speaks with no token, or once a claim gives nothing back.
  door.noneKept(player);
  // A room sends a player's gear at most every 12 ticks.
  for (let tick = 0; tick < 12; tick++) door.tick();
  assert.equal(claimed(), true, 'none will: the room’s is theirs, so their page shows its road');
});
