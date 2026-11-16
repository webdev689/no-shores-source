import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import course from '../content/testground/course.json' with { type: 'json' };
// The browser's side of the messages and rules, so these tests send the room exactly the bytes a browser sends and
// check its bodies with the browser's own steps.
import { type SeenPlayer, courseBytes, inputBytes, readFromRoom } from '../client/src/network/messages.ts';
import { type Controls, floatsOf, startMovementRules } from '../client/src/rules/movementRules.ts';
import { type RoomDoor, startRoomDoor } from './roomDoor.ts';

const built = (name: string) =>
  readFile(new URL(`../target/wasm32-unknown-unknown/release/${name}.wasm`, import.meta.url)).catch(() => {
    throw new Error(`${name}.wasm is not built: run \`npm run wasm\` first`);
  });
const compiled = new WebAssembly.Module(await built('room_wasm'));
const walk = { forward: 1, sideways: 0, yaw: 0, run: false, jump: false, crouch: false, mounted: false };
const walking = { anim: 'walk', frame: 2, facing: 0 };

test('a room welcomes players, takes the inputs a browser writes in order, and its snapshots read back in the browser', () => {
  const room = startRoomDoor(compiled);
  assert.equal(room.tickSeconds, 1 / 60);
  assert.equal(room.open(course.start, course.blocks), true);
  const [first, second] = [room.join(), room.join()];
  assert.deepEqual(readFromRoom(room.joined(first)), { kind: 'joined', player: first, dressed: [], node: null });
  assert.equal(room.input(first, inputBytes(1, walk, walking, '{"body":"male"}')), 'taken');
  for (let sequence = 2; sequence <= 30; sequence++)
    assert.equal(room.input(first, inputBytes(sequence, walk, walking)), 'taken');
  assert.equal(room.input(first, inputBytes(40, walk, walking)), 'out of order');
  assert.equal(room.input(second, inputBytes(1, walk, { ...walking, anim: 'Not A Move' })), 'not an input');
  assert.equal(room.input(second, new Uint8Array([1, 2, 3])), 'not an input');
  for (let tick = 0; tick < 30; tick++) room.tick();
  const snapshot = readFromRoom(room.snapshot());
  assert.equal(snapshot?.kind, 'snapshot');
  if (snapshot?.kind !== 'snapshot') return;
  const [walker, stander] = snapshot.players;
  assert.equal(walker?.acknowledged, 30);
  assert.ok(Math.abs((walker?.body.y ?? 0) - (course.start.y - 4.43 / 2)) < 0.01, `walked half a second north`);
  assert.deepEqual([stander?.player, stander?.acknowledged, stander?.body.y], [second, 0, course.start.y]);
  assert.deepEqual(walker?.standing, { kind: 'inside' }, 'a course has no section to leave');
  // The walker's look came with its last input, and its dress once, to everyone and to whoever joins after.
  assert.deepEqual([walker?.anim, walker?.frame], ['walk', 2]);
  assert.deepEqual(snapshot.dressed, [{ player: first, dress: '{"body":"male"}' }]);
  room.tick();
  assert.deepEqual((readFromRoom(room.snapshot()) as { dressed: unknown }).dressed, []);
  const third = room.join();
  assert.deepEqual(readFromRoom(room.joined(third)), {
    kind: 'joined',
    player: third,
    dressed: [{ player: first, dress: '{"body":"male"}' }],
    node: null,
  });
});

test('a player who leaves is no longer seen, and each room is a room of its own', () => {
  const room = startRoomDoor(compiled);
  room.open(course.start, course.blocks);
  const player = room.join();
  room.leave(player);
  room.tick();
  const snapshot = readFromRoom(room.snapshot());
  assert.deepEqual(snapshot?.kind === 'snapshot' ? snapshot.players : null, []);
  const another = startRoomDoor(compiled);
  another.open(course.start, course.blocks);
  assert.equal(another.join(), 1);
});

/** A node's file as the bake writes it: a section 100 m square on land 10 m up, round a terrace at 12 m with a wall
 *  on it, and two spawns. */
function nodeFile(): { text: string; ground: string } {
  const grid = (value: number) => ({
    width: 4,
    height: 4,
    left_m: -2000,
    top_m: -2000,
    cell_m: 1000,
    first_column: 0,
    first_row: 0,
    data: Array<number>(16).fill(value),
  });
  const layers = { land: grid(10), lake_level: Array<number>(16).fill(0), rivers: [], roads: [], towns: [] };
  const pads = [{ bounds: [-10, -10, 10, 10], level: 12 }];
  const ground = { ...layers, coast: grid(5000), across: grid(-50), pads, seed: 7 };
  const section = {
    ring: [
      [-50, -50],
      [50, -50],
      [50, 50],
      [-50, 50],
    ],
    spawns: [
      [0, 0],
      [30, -40],
    ],
  };
  const named = { id: 'glade', kind: 'patrol', name: 'The Glade', continent: 'square', ...section };
  const file = { ...named, bounds: [-150, -150, 150, 150], ground, boxes: [[-5, -8, 5, -7, 13]] };
  return { text: JSON.stringify(file), ground: JSON.stringify(ground) };
}

/** Sends one input a browser writes and ticks the room; answers what the room then saw of the player. */
function play(room: RoomDoor, player: number, sequence: number, controls: Controls, respawn = false): SeenPlayer {
  assert.equal(room.input(player, inputBytes(sequence, controls, walking, undefined, respawn)), 'taken');
  room.tick();
  const snapshot = readFromRoom(room.snapshot());
  const seen = snapshot?.kind === 'snapshot' ? snapshot.players.find((each) => each.player === player) : undefined;
  if (!seen) throw new Error(`the room did not see player ${player}`);
  return seen;
}

test('a node’s room warns a player past its edge, kills them 60 m out, and respawns them only after 4 s', async () => {
  const { text, ground } = nodeFile();
  const room = startRoomDoor(compiled);
  assert.equal(room.openNode('not a node'), false);
  assert.equal(room.openNode(text), true);
  const [first, second] = [room.join(), room.join()];
  const node = { id: 'glade', bounds: [-150, -150, 150, 150] };
  assert.deepEqual(readFromRoom(room.joined(first)), { kind: 'joined', player: first, dressed: [], node });
  // The browser stands bodies on the same ground and boxes, and finds the same bodies, to the bit.
  const movement = await startMovementRules(await built('movement_wasm'));
  assert.equal(movement.setGround(ground), true);
  movement.setCourse([{ minX: -5, minY: -8, maxX: 5, maxY: -7, top: 13 }]);
  room.tick();
  const joined = readFromRoom(room.snapshot());
  const bodies = joined?.kind === 'snapshot' ? joined.players.map((seen) => floatsOf(seen.body)) : [];
  assert.deepEqual(bodies, [floatsOf(movement.standing(0, 0)), floatsOf(movement.standing(30, -40))], 'in turn');

  const east = { ...walk, yaw: Math.PI / 2, run: true };
  let sequence = 0;
  let seen = play(room, second, ++sequence, east);
  while (seen.standing.kind === 'inside') seen = play(room, second, ++sequence, east);
  assert.deepEqual(seen.standing, { kind: 'warned', ticks: 599 });
  while (seen.standing.kind === 'warned') seen = play(room, second, ++sequence, east);
  assert.deepEqual(seen.standing, { kind: 'dead', ticks: 0 });
  assert.ok(seen.body.x >= 110, `dead 60 m past the edge, at ${seen.body.x}`);
  const died = floatsOf(seen.body);
  for (let ticks = 1; ticks <= 240; ticks++) {
    seen = play(room, second, ++sequence, east, true);
    assert.deepEqual([seen.standing, floatsOf(seen.body)], [{ kind: 'dead', ticks }, died], 'still, and refused');
  }
  seen = play(room, second, ++sequence, east, true);
  assert.deepEqual(seen.standing, { kind: 'inside' });
  assert.deepEqual(floatsOf(seen.body), floatsOf(movement.standing(30, -40)), 'back at the spawn nearest its death');
});

test('the sea sails the course a browser writes, refuses one across land, and shows each ship', () => {
  const room = startRoomDoor(compiled);
  const square = [
    [100_000, 100_000],
    [200_000, 100_000],
    [200_000, 200_000],
    [100_000, 200_000],
  ];
  assert.equal(room.openSea(JSON.stringify({ continents: [{ id: 'square', outline: square }], isles: [] })), true);
  const [first, second] = [room.join(), room.join()];
  const north: [number, number][] = [
    [50_000, 150_000],
    [50_000, 50_000],
  ];
  assert.equal(room.input(first, courseBytes(north, 10)), 'taken');
  assert.equal(
    room.input(
      second,
      courseBytes(
        [
          [50_000, 150_000],
          [250_000, 150_000],
        ],
        10,
      ),
    ),
    'refused',
  );
  assert.equal(room.input(second, inputBytes(1, walk, walking)), 'not an input', 'the sea takes courses');
  for (let tick = 0; tick < 60; tick++) room.tick();
  const snapshot = readFromRoom(room.snapshot());
  const ships = snapshot?.kind === 'snapshot' ? snapshot.ships : [];
  assert.equal(ships.length, 1, 'only the ship whose course was taken is at sea');
  assert.deepEqual([ships[0]?.player, ships[0]?.x, ships[0]?.heading, ships[0]?.pace], [first, 50_000, 0, 10]);
  assert.ok(Math.abs((ships[0]?.y ?? 0) - (150_000 - 120)) < 1e-6, 'a second north at 10 × 12 m/s');
});
