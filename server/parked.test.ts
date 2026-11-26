import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { courseBytes } from '../client/src/network/courseMessages.ts';
import { readFromRoom } from '../client/src/network/messages.ts';
import { startRoomDoor } from './roomDoor.ts';

const compiled = new WebAssembly.Module(
  await readFile(new URL('../target/wasm32-unknown-unknown/release/room_wasm.wasm', import.meta.url)).catch(() => {
    throw new Error('room_wasm.wasm is not built: run `npm run wasm` first');
  }),
);

/** A sea round one square continent 100 km a side, its north-west corner 100 km from the frame's. */
const SQUARE_SEA = JSON.stringify({
  continents: [
    {
      id: 'continent-2',
      outline: [
        [100_000, 100_000],
        [200_000, 100_000],
        [200_000, 200_000],
        [100_000, 200_000],
      ],
    },
  ],
  isles: [],
});

/** crates/room-wasm/src/parked_door_tests.rs pins the same answer natively (`ANSWER`). */
const ANSWER =
  '[{"account":"ann","number":1,"x":80000.0,"y":150000.0,"heading":0.0,"hull":0,"dress":[0,10,18,30],' +
  '"name":[255,255],"emblem":0}]';

const shipsOf = (bytes: Uint8Array) => {
  const read = readFromRoom(bytes);
  return read?.kind === 'snapshot' ? read.ships : [];
};

test('the sea answers an island’s room with the ships parked at it as it does natively, and shows them in sight', () => {
  const door = startRoomDoor(compiled);
  assert.equal(door.openSea(SQUARE_SEA, 66), true);
  const ann = door.join();
  assert.equal(door.own(ann, 'ann'), true);
  assert.equal(door.input(ann, courseBytes([[80_000, 150_000]], 10)), 'taken');
  door.tick();
  door.leave(ann);
  const near = door.join();
  assert.equal(door.input(near, courseBytes([[90_000, 150_000]], 10)), 'taken');
  door.tick();
  assert.equal(door.seaAshore('{"accounts":["ann"],"continent":"continent-2"}'), ANSWER);
  assert.deepEqual(
    shipsOf(door.snapshot(near)).map((ship) => [ship.player, ship.pace]),
    [
      [near, 0],
      [ann, 0],
    ],
  );
});

test('an island’s room sends each player the ships parked at it, never their own', () => {
  const door = startRoomDoor(compiled);
  assert.equal(door.openIsland('{"seed":"41","climate":"desert","at":[700000,300000],"guards":0,"levels":null}'), true);
  const [ann, bea] = [door.join(), door.join()];
  assert.ok(door.own(ann, 'ann') && door.own(bea, 'bea'));
  const ship = (account: string, number: number) => ({
    account,
    number,
    x: 700_100,
    y: 300_200,
    heading: 1.5,
    hull: 1,
    dress: [1, 2, 3, 4],
    name: [5, 6],
    emblem: 7,
  });
  assert.equal(door.parked(JSON.stringify([ship('ann', 7), ship('bea', 8)])), true);
  door.tick();
  const { account, number, ...seen } = ship('bea', 8);
  assert.equal(account, 'bea');
  assert.deepEqual(shipsOf(door.snapshot(ann)), [{ ...seen, player: number, pace: 0 }]);
  assert.deepEqual(
    shipsOf(door.snapshot(bea)).map((each) => each.player),
    [7],
  );
});
