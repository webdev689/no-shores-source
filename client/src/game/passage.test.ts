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

/** A point `east` and `south` metres from one well inside the world's frame. */
const place = (east: number, south: number): Point2 => [1_000_000 + east, 1_000_000 + south];
/** A square island 10 km a side, its west coast 30 km east of that point. */
const ISLAND: readonly Point2[][] = [
  [place(30_000, -5_000), place(40_000, -5_000), place(40_000, 5_000), place(30_000, 5_000)],
];
const [LEFT, TOP] = place(-100_000, -100_000);
const MASK = maskFromOutlines(ISLAND, { leftM: LEFT, topM: TOP, widthM: 200_000, heightM: 200_000 });

/** A sea room for a passage: what the passage asks of it, kept in the order asked, and its word on her ship, as set. */
function fakeRoom(): {
  room: SeaRoom;
  asked: string[];
  word: { settledShip: SeenShip | null; ownShip: SeenShip | null };
} {
  const asked: string[] = [];
  const word = { settledShip: null as SeenShip | null, ownShip: null as SeenShip | null };
  const room = {
    get settledShip() {
      return word.settledShip;
    },
    get ownShip() {
      return word.ownShip;
    },
    // To the nearest metre, as the room takes a course.
    course: (points: readonly Point2[], pace: number) =>
      asked.push(`course ${JSON.stringify(points.map((point) => point.map(Math.round)))} ×${pace}`),
    face: (heading: number) => asked.push(`face ${heading.toFixed(4)}`),
  } as unknown as SeaRoom;
  return { room, asked, word };
}

test('W sets her sailing straight on short of the coast, A and D turn her onto a new course, S heaves her to', () => {
  const passage = new Passage(ISLAND, () => MASK, place(15_000, 0), Math.PI / 2);
  const { room, asked } = fakeRoom();
  passage.room = room;
  passage.straightOn();
  assert.equal(passage.sailing, true);
  assert.deepEqual(asked, [`course ${JSON.stringify([place(30_000 - AHEAD.shortM, 0)])} ×${passage.pace}`]);
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
  const passage = new Passage(ISLAND, () => MASK, place(29_700, 0), 0);
  const { room, asked } = fakeRoom();
  passage.room = room;
  passage.straightOn();
  passage.steer(1, 9);
  assert.equal(passage.sailing, false);
  assert.equal(passage.note, 'Land lies ahead.');
  assert.match(asked.at(-1) ?? '', /^face /);
});

test('straight on toward a coast, she comes to rest short of it and the voyage line says why', () => {
  const passage = new Passage(ISLAND, () => MASK, place(25_000, 0), Math.PI / 2);
  passage.room = fakeRoom().room;
  passage.straightOn();
  for (let second = 0; second < 30 && passage.sailing; second++) passage.advance(1);
  assert.equal(passage.sailing, false);
  assert.ok(Math.abs(passage.ship.x - place(30_000 - AHEAD.shortM, 0)[0]) < 1e-6, `${passage.ship.x}`);
  assert.equal(passage.note, 'Land lies ahead.');
});

test('her course straight on is set again as she nears its end, while the sea lies open', () => {
  const passage = new Passage(ISLAND, () => MASK, place(0, 0), 0);
  const { room, asked } = fakeRoom();
  passage.room = room;
  passage.straightOn();
  for (let second = 0; second < 40 && asked.length < 2; second++) passage.advance(1);
  assert.equal(asked.length, 2, 'set again before she reaches its end');
  assert.ok(passage.ship.y < place(0, -(AHEAD.reachM - AHEAD.renewM))[1] + 1, `${passage.ship.y}`);
  assert.equal(passage.sailing, true);
});

test('while the room has not yet taken her new course, she sails at the pace it last held her to', () => {
  const passage = new Passage(ISLAND, () => MASK, place(0, 0), 0);
  const { room, word } = fakeRoom();
  passage.room = room;
  word.ownShip = { player: 1, ...{ x: 0, y: 0 }, heading: 0, pace: 1 };
  passage.straightOn();
  passage.advance(1);
  assert.ok(Math.abs(passage.ship.y - (place(0, 0)[1] - 12)) < 1e-6, `held to ×1, 12 m: ${passage.ship.y}`);
});

test("the room's word sets her right: at rest where it has her, or laid there when she drifts off her course", () => {
  const passage = new Passage(ISLAND, () => MASK, place(0, 0), 0);
  const { room, asked, word } = fakeRoom();
  passage.room = room;
  passage.straightOn();
  const [x, y] = place(80, -500);
  word.settledShip = { player: 1, x, y, heading: 0, pace: 60 };
  passage.advance(0);
  assert.deepEqual([passage.ship.x, passage.ship.y], [x, y], '80 m off her line: laid where the room has her');
  assert.equal(asked.length, 2, 'and her course set again from there');
  word.settledShip = { player: 1, x, y: y - 300, heading: 0, pace: 0 };
  passage.advance(1);
  assert.equal(passage.sailing, false, 'the room has her at rest short of the end: she rests');
  assert.equal(passage.stoppedShort, true, 'hove to, to be resumed');
  assert.deepEqual([passage.ship.x, passage.ship.y], [x, y - 300]);
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

test("watched close she eases down the ladder to the world's own time a step each 0.15 s, and back up to the dial", () => {
  const passage = new Passage(ISLAND, () => MASK, place(0, 0), 0);
  const { room, asked, word } = fakeRoom();
  passage.room = room;
  passage.straightOn();
  const paces = () => asked.map((said) => Number(said.split('×')[1]));
  for (let frame = 0; frame < 60; frame++) passage.advance(0.05, true);
  assert.deepEqual(paces(), [60, 40, 30, 20, 10, 5, 1], "the dial's x60, then down each step to the world's own time");
  assert.equal(passage.pace, 60, 'the dial itself is not changed');
  assert.equal(passage.note, 'Sailing straight on', 'said only once the room has it');
  const before = passage.ship.y;
  passage.advance(1, true);
  assert.ok(Math.abs(before - passage.ship.y - 12) < 1e-6, `her true speed, 12 m a second: ${before - passage.ship.y}`);
  word.settledShip = { player: 1, x: passage.ship.x, y: passage.ship.y, heading: 0, pace: 1 };
  assert.equal(passage.note, 'Sailing straight on · Sailing at true speed while you watch close.');
  word.settledShip = null;
  asked.length = 0;
  for (let frame = 0; frame < 60; frame++) passage.advance(0.05, false);
  assert.deepEqual(paces(), [5, 10, 20, 30, 40, 60], 'the view risen, back up the ladder to the dial');
  assert.equal(passage.note, 'Sailing straight on');
});

test('the dial stepped while the view is close is kept for when it rises; stepped at the dial, she sails at it', () => {
  const passage = new Passage(ISLAND, () => MASK, place(0, 0), 0);
  const { room, asked } = fakeRoom();
  passage.room = room;
  passage.straightOn();
  passage.stepPace(1);
  assert.match(asked.at(-1) ?? '', /×100$/, 'at the dial, a step up sails at once');
  for (let frame = 0; frame < 60; frame++) passage.advance(0.05, true);
  passage.stepPace(-1);
  assert.match(asked.at(-1) ?? '', /×1$/, "watched close, still the world's own time");
  for (let frame = 0; frame < 60; frame++) passage.advance(0.05, false);
  assert.match(asked.at(-1) ?? '', /×60$/, 'back up to the dial as it is now');
});

test('a pace step the room refused is asked again once its word comes, until the two agree', () => {
  const passage = new Passage(ISLAND, () => MASK, place(0, 0), 0);
  const { room, asked, word } = fakeRoom();
  passage.room = room;
  passage.straightOn();
  for (let frame = 0; frame < 60; frame++) passage.advance(0.05, true);
  asked.length = 0;
  // The room still sails her at x5: the last step down was refused.
  word.settledShip = { player: 1, x: passage.ship.x, y: passage.ship.y, heading: 0, pace: 5 };
  passage.advance(0.05, true);
  assert.match(asked.at(-1) ?? '', /×1$/, 'the world’s own time asked again');
  assert.equal(passage.note, 'Sailing straight on', 'not said while the room has her at another pace');
  word.settledShip = { ...word.settledShip, pace: 1 };
  asked.length = 0;
  passage.advance(0.05, true);
  assert.deepEqual(asked, [], 'once they agree, nothing more is sent');
});
