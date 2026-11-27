import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RoomConnection } from '../network/roomConnection.ts';
import { Foot, type FootContext, type Uses } from './foot.ts';
import type { Difficulty } from '../heldmap/heldMap.ts';
import { ashoreOn } from './isleVisit.ts';
import type { DungeonDoor } from './isleLaw.ts';
import type { IsleHeld } from './isles.ts';

/** Island 3 of seed 255, a cove whose dungeon's crypt door stands 5 m east and 6 m south of its middle. */
const held = {
  seen: { id: 3, at: [1000, 2000], seed: 255n, kind: 'cove', name: 'A cove' },
  plan: {
    ring: [[0, 0]],
    spawns: [[1, 1]],
    blocks: [],
    heights: new Float32Array(4),
    facing: 0,
    wrecks: [],
    nodes: [],
    door: { at: [5, 6], facing: 0, style: 'crypt' },
  },
  heights: new Float32Array(4),
} as unknown as IsleHeld;
const rooms = (name: string) => `wss://rooms.test/${name}`;
const foot = { rooms, session: () => Promise.resolve(null) } as unknown as FootContext;

test("a landing that fails closes the island room's socket rather than leaving it to rejoin for ever", async (context) => {
  let closed = 0;
  const connection = Object.assign(Object.create(RoomConnection.prototype) as RoomConnection, {
    close: () => closed++,
  });
  context.mock.method(RoomConnection, 'open', () => Promise.resolve(connection));
  context.mock.method(Foot, 'onDeck', (...asked: unknown[]) => {
    (asked[3] as (received: unknown) => unknown)(() => undefined);
    return Promise.reject(new Error('the ground did not load'));
  });
  const where = { word: null, continent: 'continent-4', voyage: { difficulty: undefined } };
  await assert.rejects(
    ashoreOn(foot, held, where, () => undefined),
    /the ground did not load/,
  );
  assert.equal(closed, 1);
});

test('an island is landed at its voyage’s tier, its room and its dungeon’s named with it', async (context) => {
  const joined: string[] = [];
  const connection = Object.create(RoomConnection.prototype) as RoomConnection;
  context.mock.method(RoomConnection, 'open', (address: string) => (joined.push(address), Promise.resolve(connection)));
  const doors: string[] = [];
  context.mock.method(Foot, 'onDeck', (...asked: unknown[]) => {
    const [, node, , , place] = asked as [unknown, { id: string }, unknown, unknown, { uses: Uses }];
    const door = place.uses(1005, 2006, () => undefined);
    door?.run();
    return Promise.resolve({ id: node.id } as unknown as Foot);
  });
  const enter = (door: DungeonDoor) => doors.push(door.room);
  const landAt = (difficulty: Difficulty | undefined) =>
    ashoreOn(foot, held, { word: null, continent: 'continent-4', voyage: { difficulty } }, enter);
  assert.deepEqual(await landAt('elite'), { id: 'isle-3-00000000000000ff--elite' });
  assert.deepEqual(await landAt('abyss'), { id: 'isle-3-00000000000000ff--abyss' });
  assert.deepEqual(await landAt(undefined), { id: 'isle-3-00000000000000ff' }, 'Normal before any voyage set one');
  assert.deepEqual(joined, [
    'wss://rooms.test/isle-3-00000000000000ff--elite',
    'wss://rooms.test/isle-3-00000000000000ff--abyss',
    'wss://rooms.test/isle-3-00000000000000ff',
  ]);
  assert.deepEqual(doors, [
    'sea-dungeon-continent-4-crypt-000000ff--elite',
    'sea-dungeon-continent-4-crypt-000000ff--abyss',
    'sea-dungeon-continent-4-crypt-000000ff',
  ]);
});
