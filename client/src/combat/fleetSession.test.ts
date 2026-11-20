import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { type RoomDoor, startRoomDoor } from '../../../server/roomDoor.ts';
import { readFromRoom } from '../network/messages.ts';
import type { RoomLink, Snapshot } from '../network/roomConnection.ts';
import { startFleetRules } from '../rules/fleetRules.ts';
import { FleetSession, fleetFeel, type SessionInput } from './fleetSession.ts';
import type { NavalEvent } from '../network/fleetMessages.ts';

const compiled = new WebAssembly.Module(
  await readFile(new URL('../../../target/wasm32-unknown-unknown/release/room_wasm.wasm', import.meta.url)).catch(
    () => {
      throw new Error('room_wasm.wasm is not built: run `npm run wasm` first');
    },
  ),
);
const TICK = 1 / 60;
const NOTHING: SessionInput = {
  steer: 0,
  crab: false,
  climbs: [],
  look: null,
  fire: false,
  brace: false,
  loadSteps: 0,
  call: 'none',
};

/** A fleet room in the test, its snapshots handed to each player `lag` ticks late, as a network would. */
class Fleet {
  readonly door: RoomDoor = startRoomDoor(compiled);
  private readonly players: { play: FleetSession; waiting: Snapshot[] }[] = [];
  private clock = 0;

  private readonly lag: number;

  constructor(lag: number) {
    this.lag = lag;
    assert.equal(this.door.openFleet(), true);
  }

  join(start: readonly [number, number, number]): FleetSession {
    const player = this.door.join();
    const door = this.door;
    const link: RoomLink = {
      player,
      dressed: [],
      joins: 1,
      rejoining: false,
      lost: null,
      send: (bytes) => assert.equal(door.input(player, bytes), 'taken'),
      pump: () => undefined,
    };
    const play = new FleetSession(link, startFleetRules(compiled), start);
    this.players.push({ play, waiting: [] });
    return play;
  }

  /** One tick: each player's frame of `input` (by `inputs`), the room's tick, and its snapshot on its way. */
  tick(inputs: (play: FleetSession) => SessionInput = () => NOTHING): void {
    this.clock += TICK;
    for (const { play } of this.players) play.advance(TICK, inputs(play), this.clock);
    this.door.tick();
    const snapshot = readFromRoom(this.door.snapshot());
    if (snapshot?.kind !== 'snapshot') throw new Error('the fleet room answers snapshots');
    for (const player of this.players) {
      player.waiting.push(snapshot);
      while (player.waiting.length > this.lag) player.play.receive(player.waiting.shift() as Snapshot, this.clock);
    }
  }

  /** The room's word on a player's ship, from its latest snapshot. */
  shipOf(play: FleetSession): number[] {
    const snapshot = readFromRoom(this.door.snapshot());
    return snapshot?.kind === 'snapshot'
      ? Array.from(snapshot.vessels.find((vessel) => vessel.id === play.id)?.ship ?? [])
      : [];
  }
}

/** The rudder over to starboard (1), to port (-1) or amidships, and a rung climbed this frame, or none. */
const sailing = (steer: number, climb?: number): SessionInput => ({
  ...NOTHING,
  steer,
  climbs: climb === undefined ? [] : [climb],
});

test('two players put to sea in a fleet, see each other, and each predicts her own ship as the room sails it', () => {
  const fleet = new Fleet(5);
  const first = fleet.join([200_000, 300_000, 0.25]);
  const second = fleet.join([200_080, 300_000, 0]);
  fleet.tick((play) => (play === first ? sailing(0, 1) : NOTHING));
  fleet.tick((play) => (play === first ? sailing(0, 1) : NOTHING));
  for (let tick = 0; tick < 240; tick++) fleet.tick((play) => (play === first ? sailing(1) : sailing(-1)));
  const seen = second.others().map((vessel) => vessel.id);
  assert.deepEqual(seen, [first.id], 'the second sees the first');
  // Five ticks of her orders are still on their way: her prediction stands that far ahead of the room's last word.
  const room = fleet.shipOf(first);
  for (let tick = 0; tick < 10; tick++) fleet.tick();
  assert.deepEqual(
    Array.from(first.shipFloats()),
    fleet.shipOf(first),
    'once the room has taken all, her ship is its own',
  );
  assert.notDeepEqual(room.slice(0, 2), [200_000, 300_000], 'under sail she has moved');
  assert.equal(first.shipFloats()[7], 2, 'sails set by two climbs');
});

test('a captain called by one player is seen by both, of the faction and rank called, and a look abeam lays', () => {
  const fleet = new Fleet(2);
  const first = fleet.join([200_000, 300_000, 0]);
  const second = fleet.join([200_060, 300_020, 0]);
  fleet.tick();
  const elite = { faction: 1, rank: 3 };
  fleet.tick((play) => (play === first ? { ...NOTHING, call: 'captain', captain: elite } : NOTHING));
  for (let tick = 0; tick < 6; tick++) fleet.tick();
  for (const play of [first, second]) {
    const captains = play.others().filter((vessel) => vessel.captain);
    assert.deepEqual(
      captains.map((vessel) => [vessel.faction, vessel.rank]),
      [[1, 3]],
      'a Grey Tithe Elite',
    );
  }
  const lay = first.lay({ bearing: 90, range: 80 }, 1);
  assert.equal(lay?.side, 'starboard');
  assert.equal(lay?.launches.length, 3);
  assert.ok(first.own(), 'the room shows her own ship');
  fleet.tick((play) => (play === second ? { ...NOTHING, call: 'send off' } : NOTHING));
  for (let tick = 0; tick < 4; tick++) fleet.tick();
  assert.equal(first.others().filter((vessel) => vessel.captain).length, 0, 'sent off');
  const gone = first.takeEvents().filter((event) => event.kind === 'gone');
  assert.deepEqual(gone, [{ kind: 'gone', ship: 1, sunk: false }], 'gone from the room, she is still named a captain');
});

test('two load presses before the room answers the first step the load twice', () => {
  const fleet = new Fleet(5);
  const play = fleet.join([200_000, 300_000, 0]);
  for (let tick = 0; tick < 8; tick++) fleet.tick();
  assert.equal(play.own()?.load, 1, 'round shot');
  fleet.tick(() => ({ ...NOTHING, loadSteps: 1 }));
  fleet.tick(() => ({ ...NOTHING, loadSteps: 1 }));
  for (let tick = 0; tick < 10; tick++) fleet.tick();
  assert.equal(play.own()?.load, 3, 'round, grape, then chain');
});

test("the room's clock holds still for a late snapshot rather than run back", () => {
  const door = startRoomDoor(compiled);
  door.openFleet();
  const player = door.join();
  const link: RoomLink = {
    player,
    dressed: [],
    joins: 1,
    rejoining: false,
    lost: null,
    send: () => undefined,
    pump: () => undefined,
  };
  const play = new FleetSession(link, startFleetRules(compiled), [200_000, 300_000, 0]);
  const snapshots = [0, 1].map(() => {
    door.tick();
    const snapshot = readFromRoom(door.snapshot());
    if (snapshot?.kind !== 'snapshot') throw new Error('the fleet room answers snapshots');
    return snapshot;
  });
  const [early, late] = snapshots as [Snapshot, Snapshot];
  play.receive(early, 0);
  const before = play.roomTime(0.2);
  // The next tick's snapshot comes 0.2 s late: its tick is a sixtieth on, the clock already 0.2 s past.
  play.receive(late, 0.2);
  assert.equal(play.roomTime(0.2), before, 'held');
  assert.ok(play.roomTime(0.45) > before, 'and on again');
});

test('a session whose link joins a new fleet puts her to sea again where she lay, her orders numbered anew', () => {
  const [before, after] = [startRoomDoor(compiled), startRoomDoor(compiled)];
  for (const door of [before, after]) assert.equal(door.openFleet(), true);
  let door = before;
  const answers = new Set<string>();
  const link = {
    player: door.join(),
    dressed: [],
    joins: 1,
    rejoining: false,
    lost: null,
    send: (bytes: Uint8Array<ArrayBuffer>) => void answers.add(door.input(link.player, bytes)),
    pump: () => undefined,
  };
  const play = new FleetSession(link, startFleetRules(compiled), [200_000, 300_000, 0.25]);
  let clock = 0;
  const tick = (input: SessionInput) => {
    clock += TICK;
    play.advance(TICK, input, clock);
    door.tick();
    const snapshot = readFromRoom(door.snapshot());
    if (snapshot?.kind === 'snapshot') play.receive(snapshot, clock);
  };
  tick(sailing(0, 1));
  tick(sailing(0, 1));
  for (let count = 0; count < 300; count++) tick(sailing(1));
  const [x = 0, y = 0] = play.shipFloats();
  assert.ok(Math.hypot(x - 200_000, y - 300_000) > 5, `under sail she has moved: ${x}, ${y}`);
  // A deploy: the fleet starts afresh, and her link joins it as its second player.
  door = after;
  after.join();
  Object.assign(link, { player: door.join(), joins: 2 });
  for (let count = 0; count < 30; count++) tick(NOTHING);
  assert.deepEqual([...answers], ['taken'], 'every order numbered anew, from 1');
  const [atX = 0, atY = 0] = play.own()?.ship ?? [];
  assert.ok(Math.hypot(atX - x, atY - y) < 5, `the new fleet has her where she lay: ${atX}, ${atY}`);
});

test("a fleet room's events reach the feel by each ship's own number, the sea's kinds by the one mapping", () => {
  const none = [0, 0, 0] as const;
  const told = (kind: NavalEvent['kind'], ship: number, detail = 0, point: readonly number[] = none, by = 0) =>
    ({ tick: 3n, kind, ship, by, detail, side: 0, point, launch: [40, 0, 2], left: 5 }) as NavalEvent;
  const felt = fleetFeel([
    told('muzzle', 12, 0, [1, 2, 3]),
    told('struck-at', 31, 1, [2, -3, 1.5]),
    told('hit', 31, 2, [9, 9, 1], 12),
    told('splash', 12, 0, [4, 5, 0]),
    told('sail-lost', 31, 2),
    told('mast-fell', 31, 1),
    told('struck', 31),
    told('sinking', 31),
    told('flotsam', 44, 2, [6, 7, 0]),
    told('gathered', 44, 0, none, 12),
    told('boarding', 31),
    told('ram', 31, 0, [7, 8, 1], 12),
  ]);
  assert.deepEqual(felt, [
    { kind: 'muzzle', ship: 12, point: [1, 2, 3], launch: [40, 0, 2] },
    { kind: 'hit', ship: 31, by: 12, zone: 'rig', point: [9, 9, 1], at: [2, -3, 1.5], part: 'sail' },
    { kind: 'splash', point: [4, 5, 0] },
    { kind: 'SailLost', tick: 3, ship: 31, sail: 2 },
    { kind: 'MastFell', tick: 3, ship: 31, mast: 1 },
    { kind: 'Struck', tick: 3, ship: 31 },
    { kind: 'Sinking', tick: 3, ship: 31 },
    { kind: 'Flotsam', tick: 3, id: 44, at: [6, 7], kind_of: 'chest' },
    { kind: 'Gathered', tick: 3, id: 44, by: 12 },
    { kind: 'Boarding', tick: 3, ship: 31 },
    { kind: 'ram', ship: 31, by: 12, point: [7, 8, 1], dealt: 5 },
  ]);
});
