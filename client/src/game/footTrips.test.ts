import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { DungeonLayout } from './dungeonLayout.ts';
import type { PropTable } from '../models/tables.ts';
import { EVENT } from '../combat/cues.ts';
import type { FightEvent } from '../network/messages.ts';
import { dungeonPlace, Entrances, heardRun, roomNameAt, tripAt, type Trips } from './footTrips.ts';
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
  entrances.heard([100, 100, 0, 0, 0]);
  const outside = { dungeon: null, portalOpen: false, patrol, entrances, module: roomModule };
  const offer = tripAt(100, 102 + 2, outside, trips);
  assert.match(offer?.words ?? '', /^Enter The \w+ of the Saltgrass Downs$/);
  offer?.run();
  assert.match(trips.asked[0] ?? '', /^enter 0 The \w+ of the Saltgrass Downs$/);
  assert.equal(tripAt(100, 110, outside, trips), null);
  assert.equal(tripAt(100, 104, { ...outside, patrol: { ...patrol, kind: 'mission' } }, trips), null, 'a patrol only');
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

test('an Abyss run’s revives are heard from each snapshot, and its wipe once it names this player', () => {
  const held = { revives: -1, wiped: false, encounter: null };
  heardRun(held, { revives: 5, events: [], encounter: null }, 7);
  assert.deepEqual(held, { revives: 5, wiped: false, encounter: null });
  heardRun(held, { revives: 5, events: [{ kind: EVENT.wiped, defender: 8 } as FightEvent], encounter: null }, 7);
  assert.equal(held.wiped, false, 'another player’s word');
  heardRun(held, { revives: 5, events: [{ kind: EVENT.wiped, defender: 7 } as FightEvent], encounter: null }, 7);
  assert.equal(held.wiped, true);
});
