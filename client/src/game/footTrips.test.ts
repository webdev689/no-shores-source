import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { DungeonLayout } from './dungeonLayout.ts';
import type { PropTable } from '../models/tables.ts';
import { EVENT } from '../combat/cues.ts';
import type { FightEvent, Reviving } from '../network/messages.ts';
import {
  dungeonPlace,
  Entrances,
  hearRoom,
  heardRun,
  openAlone,
  roomNameAt,
  takeWipe,
  tripAt,
  type Trips,
  unheard,
} from './footTrips.ts';
import { RoomThread } from '../network/roomThread.ts';
import { WORLD_CLOCK, roomNow } from '../sky/worldClock.ts';
import type { NodeInfo } from './worldData.ts';

const patrol: NodeInfo = {
  id: 'saltgrass-downs',
  kind: 'patrol',
  name: 'The Saltgrass Downs',
  continent: 'continent-1',
  ring: [],
  spawns: [],
  centre: [0, 0],
};
const props = {
  42000: {
    min: [0, 0, 0],
    max: [0, 0, 0],
    looks: [],
    doors: [{ type: 2, a: [-1, 0, -2], b: [-1, 2, -2], c: [1, 2, -2], n: [0, 0, -1] }],
  },
} as unknown as PropTable;

/** The ways in and out, noting what was asked of them. */
function noted(): Trips & { asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    props: () => props,
    enter: (number, name) => asked.push(`enter ${number} ${name}`),
    leave: () => asked.push('leave'),
  };
}

const roomModule = (() => {
  try {
    return new WebAssembly.Module(readFileSync('client/public/room.wasm'));
  } catch {
    return null;
  }
})();

test("inside, E within 2.5 m of the exit door offers Leave; on a patrol, an entrance's door offers Enter and its name", (context) => {
  if (!roomModule) return context.skip('room.wasm is not built: run `npm run wasm`');
  const layout = { exitDoor: { x: 10, y: 0.02 }, portal: { x: 40, y: 6.38 }, cell: 3.2 } as unknown as DungeonLayout;
  const trips = noted();
  const entrances = new Entrances();
  const ask = { patrol: patrol.id, name: patrol.name, number: 0 };
  const dungeon = { patrol, number: 0, ask, room: 'node-saltgrass-downs--dungeon-0', layout };
  const inside = { dungeon, portalOpen: false, patrol, entrances, module: roomModule };
  assert.equal(tripAt(10, 2.4, inside, trips)?.words, 'Leave');
  assert.equal(tripAt(10, 2.6, inside, trips), null);
  assert.equal(tripAt(40, 4.5, inside, trips), null, 'the return portal shut while the cache is');
  assert.equal(tripAt(40, 4.5, { ...inside, portalOpen: true }, trips)?.words, 'Leave', 'and open while it is');
  const zone = { ...inside, dungeon: { ...dungeon, passage: true } };
  assert.equal(tripAt(10, 2.4, zone, trips), null, "a passage zone's exit is its way in, and no way out");
  entrances.heard([100, 100, 0, 0, 0]);
  const outside = { dungeon: null, portalOpen: false, patrol, entrances, module: roomModule };
  const offer = tripAt(100, 102 + 2, outside, trips);
  assert.match(offer?.words ?? '', /^Enter The \w+ of the Saltgrass Downs$/);
  offer?.run();
  assert.match(trips.asked[0] ?? '', /^enter 0 The \w+ of the Saltgrass Downs$/);
  assert.equal(tripAt(100, 110, outside, trips), null);
  assert.equal(tripAt(100, 104, { ...outside, patrol: { ...patrol, kind: 'mission' } }, trips), null, 'a patrol only');
});

test("a patrol's dungeons are named as their entrances are heard, not as a door is first reached", (context) => {
  if (!roomModule) return context.skip('room.wasm is not built: run `npm run wasm`');
  // A module with nothing in it throws if it is asked to lay a dungeon, so a name it gives was forged before.
  const empty = new WebAssembly.Module(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]));
  const entrances = new Entrances();
  entrances.namesFrom(roomModule, patrol);
  entrances.heard([100, 100, 0, 0, 0, 400, 100, 0, 0, 2]);
  assert.match(entrances.nameOf(empty, patrol, 0), /^The \w+ of the Saltgrass Downs$/, 'named as heard');
  assert.match(entrances.nameOf(empty, patrol, 1), /^The \w+ of the Saltgrass Downs$/);
  assert.throws(() => new Entrances().nameOf(empty, patrol, 0), 'none is named before it is heard');
});

test('a dungeon is played as a place named for itself, its one spawn its way in', () => {
  const layout = { name: 'The Crypt of the Saltgrass Downs', columns: 2, rows: 1, cell: 3.2, arrival: { x: 1, y: 2 } };
  const place = dungeonPlace(patrol, layout as unknown as DungeonLayout);
  assert.equal(place.kind, 'dungeon');
  assert.equal(place.name, 'The Crypt of the Saltgrass Downs');
  assert.deepEqual(place.spawns, [[1, 2]]);
  assert.deepEqual(place.ring[2], [6.4, 3.2]);
});

test("a point is named for the dungeon's room it stands in, and nothing in a corridor or past the grid", () => {
  const layout = {
    cell: 3.2,
    columns: 3,
    rows: 1,
    cells: [0, -1, 1],
    rooms: [{ name: 'the Ossuary' }, { name: 'the Old Ossuary' }],
  } as unknown as DungeonLayout;
  assert.equal(roomNameAt(layout, { x: 1, y: 1 }), 'the Ossuary');
  assert.equal(roomNameAt(layout, { x: 4, y: 1 }), null);
  assert.equal(roomNameAt(layout, { x: 8, y: 1 }), 'the Old Ossuary');
  assert.equal(roomNameAt(layout, { x: 12, y: 1 }), null);
});

test('an Abyss run’s revives, the darkness and revives under way are heard from each snapshot, its wipe once it names this player', () => {
  const nothing = { darkness: false, reviving: [] as readonly Reviving[], breach: null };
  const held = { revives: -1, wiped: false, encounter: null, ...nothing };
  const reviving = [{ fallen: 7, reviver: 9, progress: 0.5 }];
  const said = { revives: 5, events: [] as FightEvent[], encounter: null, darkness: true, reviving };
  heardRun(held, said, 7);
  assert.deepEqual(held, { revives: 5, wiped: false, encounter: null, darkness: true, reviving, breach: null });
  heardRun(held, { ...said, events: [{ kind: EVENT.wiped, defender: 8 } as FightEvent] }, 7);
  assert.equal(held.wiped, false, 'another player’s word');
  heardRun(held, { ...said, events: [{ kind: EVENT.wiped, defender: 7 } as FightEvent] }, 7);
  assert.equal(held.wiped, true);
  assert.equal(takeWipe(held, false), false, 'heard behind a veil, which refuses the way out: it waits');
  assert.equal(takeWipe(held, true), true, 'taken on foot');
  assert.equal(takeWipe(held, true), false, 'once');
});

test("a land room's word on the ships parked by its island and the traffic ships taken is held, each snapshot's in place of the last", () => {
  const held = { gear: null, alone: null, ...unheard() };
  const heard = hearRoom(
    held,
    () => null,
    () => undefined,
    { online: true, asks: false },
  );
  const parked = { player: 4, x: 10, y: 20, heading: 1, pace: 0, hull: 2, dress: [], name: [], emblem: 0 };
  const word = { cache: [], revives: -1, events: [], encounter: null, darkness: false, reviving: [], outpost: 0 };
  heard.snapshot({ ...word, ships: [parked], taken: [2_605] } as never);
  assert.deepEqual([held.ships, [...held.taken]], [[parked], [2_605]]);
  heard.snapshot({ ...word, ships: [], taken: [] } as never);
  assert.deepEqual([held.ships, [...held.taken]], [[], []]);
});

test("a run played alone opens on the minute by the rooms' clock, not a page clock that is wrong", async () => {
  // The rooms say it is a day and a quarter-hour later than the page thinks.
  WORLD_CLOCK.heard(WORLD_CLOCK.seconds() + 86_400 + 900);
  const openRun = RoomThread.openRun.bind(RoomThread);
  let asked = '';
  RoomThread.openRun = (module, ask) => ((asked = ask), Promise.resolve(null as unknown as RoomThread));
  try {
    const room = 'sea-dungeon-continent-4-caverns-0a1b2c3d--elite--run-k3j4h5g6';
    const heard = {} as Parameters<typeof openAlone>[3];
    await openAlone({} as WebAssembly.Module, '', { number: 0, room }, heard);
  } finally {
    RoomThread.openRun = openRun;
  }
  const { minute } = JSON.parse(asked) as { minute: number };
  // A minute may turn between two readings.
  assert.ok(Math.abs(minute - Math.floor(roomNow() / 60_000)) <= 1, `${minute} by the rooms`);
  assert.ok(Math.abs(minute - Math.floor(Date.now() / 60_000)) >= 1000, 'not by the page');
  WORLD_CLOCK.heard(WORLD_CLOCK.seconds() - 86_400 - 900);
});
