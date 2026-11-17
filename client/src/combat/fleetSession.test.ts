import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { type RoomDoor, startRoomDoor } from '../../../server/roomDoor.ts';
import { readFromRoom } from '../network/messages.ts';
import type { RoomLink, Snapshot } from '../network/roomConnection.ts';
import { startFleetRules } from '../rules/fleetRules.ts';
import { FleetSession, type SessionInput } from './fleetSession.ts';

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

test('a captain called by one player is seen by both, and a look abeam lays its guns', () => {
  const fleet = new Fleet(2);
  const first = fleet.join([200_000, 300_000, 0]);
  const second = fleet.join([200_060, 300_020, 0]);
  fleet.tick();
  fleet.tick((play) => (play === first ? { ...NOTHING, call: 'captain' } : NOTHING));
  for (let tick = 0; tick < 6; tick++) fleet.tick();
  for (const play of [first, second]) assert.equal(play.others().filter((vessel) => vessel.captain).length, 1);
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
  const link: RoomLink = { player, dressed: [], lost: null, send: () => undefined, pump: () => undefined };
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
