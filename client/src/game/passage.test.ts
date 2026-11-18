import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { LocalRoom } from '../network/localRoom.ts';
import { courseBytes, faceBytes, type SeenShip } from '../network/messages.ts';
import type { Snapshot } from '../network/roomConnection.ts';
import type { Point2 } from '../overworld/ground.ts';
import { maskFromOutlines } from '../overworld/seaRoute.ts';
import { Passage } from './passage.ts';
import { AHEAD, HELM_TURN } from './seaHelm.ts';
import type { SeaRoom } from './seaRoom.ts';

/** A square island 10 km a side, its west coast 30 km east of the origin. */
const ISLAND: readonly Point2[][] = [
  [
    [30_000, -5_000],
    [40_000, -5_000],
    [40_000, 5_000],
    [30_000, 5_000],
  ],
];
const MASK = maskFromOutlines(ISLAND, { leftM: -100_000, topM: -100_000, widthM: 200_000, heightM: 200_000 });

/** What the passage asks of a sea room, kept in the order asked. */
function fakeRoom(): { room: SeaRoom; asked: string[] } {
  const asked: string[] = [];
  const room = {
    settledShip: null,
    // To the nearest metre, as the room takes a course.
    course: (points: readonly Point2[], pace: number) =>
      asked.push(`course ${JSON.stringify(points.map((point) => point.map(Math.round)))} ×${pace}`),
    face: (heading: number) => asked.push(`face ${heading.toFixed(4)}`),
  } as unknown as SeaRoom;
  return { room, asked };
}

test('W sets her sailing straight on short of the coast, A and D turn her onto a new course, S heaves her to', () => {
  const passage = new Passage(ISLAND, () => MASK, [15_000, 0], Math.PI / 2);
  const { room, asked } = fakeRoom();
  passage.room = room;
  passage.straightOn();
  assert.equal(passage.sailing, true);
  assert.deepEqual(asked, [`course [[${30_000 - AHEAD.shortM},0]] ×${passage.pace}`]);
  assert.equal(passage.note, 'Sailing straight on');
  passage.steer(-1, 0.5);
  assert.ok(Math.abs(passage.ship.heading - (Math.PI / 2 - HELM_TURN / 2)) < 1e-12, 'to port');
  assert.equal(asked.length, 2, 'under way, a course along the new heading');
  passage.stop();
  assert.equal(passage.sailing, false);
  assert.equal(passage.stoppedShort, true, 'hove to, to be resumed');
  passage.steer(1, 1);
  assert.match(asked.at(-1) ?? '', /^face /, 'at rest she turns where she lies');
  passage.resume();
  assert.equal(passage.note, 'Sailing straight on', 'resumed straight on, along her heading now');
});

test('turned toward a coast too near, she comes to rest facing it and the voyage line says why', () => {
  const passage = new Passage(ISLAND, () => MASK, [29_700, 0], 0);
  const { room, asked } = fakeRoom();
  passage.room = room;
  passage.straightOn();
  passage.steer(1, 9);
  assert.equal(passage.sailing, false);
  assert.equal(passage.note, 'Land lies ahead.');
  assert.match(asked.at(-1) ?? '', /^face /);
});

test('straight on toward a coast, she comes to rest short of it and the voyage line says why', () => {
  const passage = new Passage(ISLAND, () => MASK, [25_000, 0], Math.PI / 2);
  passage.room = fakeRoom().room;
  passage.straightOn();
  for (let second = 0; second < 30 && passage.sailing; second++) passage.advance(1);
  assert.equal(passage.sailing, false);
  assert.ok(Math.abs(passage.ship.x - (30_000 - AHEAD.shortM)) < 1e-6, `${passage.ship.x}`);
  assert.equal(passage.note, 'Land lies ahead.');
});

test('her course straight on is set again as she nears its end, while the sea lies open', () => {
  const passage = new Passage(ISLAND, () => MASK, [0, 0], 0);
  const { room, asked } = fakeRoom();
  passage.room = room;
  passage.straightOn();
  for (let second = 0; second < 40 && asked.length < 2; second++) passage.advance(1);
  assert.equal(asked.length, 2, 'set again before she reaches its end');
  assert.ok(passage.ship.y < -(AHEAD.reachM - AHEAD.renewM) + 1, `${passage.ship.y}`);
  assert.equal(passage.sailing, true);
});

const built = (name: string) =>
  readFile(new URL(`../../../target/wasm32-unknown-unknown/release/${name}`, import.meta.url));
const roomModule = await WebAssembly.compile(await built('room_wasm.wasm'));
const layoutText = await readFile(new URL('../../../content/world/layout.json', import.meta.url), 'utf8');

test('the sea room turns her at rest to the heading the helm faces her, and holds her where she lies', () => {
  let last: Snapshot | null = null;
  const room = LocalRoom.openSea(roomModule, layoutText, (snapshot) => (last = snapshot), 7);
  const layout = JSON.parse(layoutText) as { continents: { outline: [number, number][] }[] };
  const west = Math.min(...layout.continents.flatMap((continent) => continent.outline.map(([x]) => x)));
  const own = (): SeenShip | undefined => (last as Snapshot | null)?.ships.find((ship) => ship.player === room.player);
  room.send(courseBytes([[west - 5000, 1_500_000]], 10));
  room.pump(1);
  const before = own();
  room.send(faceBytes(2.5));
  room.pump(0.1);
  assert.deepEqual(
    [own()?.x, own()?.y, own()?.heading, own()?.pace],
    [before?.x, before?.y, 2.5, 0],
    'turned, at rest, where she lay',
  );
});
