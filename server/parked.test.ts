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
  '{"ships":[{"account":"ann","number":1,"x":98000.0,"y":150000.0,"heading":0.0,"hull":0,"dress":[0,10,18,30],' +
  '"name":[255,255],"emblem":0}],"taken":[]}';

/** Ann as a room names her while her character sails the Sloop as built, as her ship lies parked. */
const ANN = { account: 'ann', hull: 0, dress: [0, 10, 18, 30], name: [255, 255], emblem: 0, level: 1 };

/** crates/room-wasm/src/parked_door_tests.rs pins the same word on Ann once she sails the Brig at level 9, before the
 *  room is told her username or guild tag (`REFIT`). */
const REFIT =
  '{"account":"ann","hull":2,"dress":[0,10,18,30],"name":[255,255],"emblem":0,"level":9,"username":"","tag":""}';

/** A sea island's word, as its sea gives it, for its room to open on. */
const ISLAND = '{"seed":"41","climate":"desert","at":[700000,300000],"guards":0,"levels":null}';

const shipsOf = (bytes: Uint8Array) => {
  const read = readFromRoom(bytes);
  return read?.kind === 'snapshot' ? read.ships : [];
};

test('the sea answers an island’s room with the ships parked at it as it does natively, and shows them in sight', () => {
  const door = startRoomDoor(compiled);
  assert.equal(door.openSea(SQUARE_SEA, 66), true);
  // As the host does each time the sea starts ticking; each naming then carries its time.
  const minute = 29_000_000;
  assert.equal(door.minute(minute), true);
  const ann = door.join();
  assert.equal(door.own(ann, 'ann'), true);
  assert.equal(door.input(ann, courseBytes([[98_000, 150_000]], 10)), 'taken');
  door.tick();
  door.leave(ann);
  const near = door.join();
  assert.equal(door.input(near, courseBytes([[90_000, 150_000]], 10)), 'taken');
  door.tick();
  const word = (seconds: number) => JSON.stringify({ named: [ANN], continent: 'continent-2', seconds });
  assert.equal(door.seaAshore(word(minute * 60)), ANSWER);
  assert.deepEqual(
    shipsOf(door.snapshot(near)).map((ship) => [ship.player, ship.pace]),
    [
      [near, 0],
      [ann, 0],
    ],
  );
  assert.equal(door.seaAshore(JSON.stringify({ named: [], seconds: minute * 60 + 46 })), '{"ships":[],"taken":[]}');
  assert.deepEqual(
    shipsOf(door.snapshot(near)).map((ship) => ship.player),
    [near],
    'its naming lapsed by the host’s time, though the sea never ticked',
  );
});

test('an island’s room sends each player every ship parked at it, their own too, and the traffic ships taken', () => {
  const door = startRoomDoor(compiled);
  assert.equal(door.openIsland(ISLAND), true);
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
  assert.equal(door.parked(JSON.stringify({ ships: [ship('ann', 7), ship('bea', 8)], taken: [2_605] })), true);
  door.tick();
  const { account, number, ...seen } = ship('bea', 8);
  assert.equal(account, 'bea');
  assert.deepEqual(shipsOf(door.snapshot(ann))[1], { ...seen, player: number, pace: 0 });
  for (const player of [ann, bea])
    assert.deepEqual(
      shipsOf(door.snapshot(player)).map((each) => each.player),
      [7, 8],
    );
  const read = readFromRoom(door.snapshot(bea));
  assert.deepEqual(read?.kind === 'snapshot' ? read.taken : null, [2_605], 'which its page draws on no route');
});

test('an island’s room names its player to the seas as their character has them now, as it does natively', () => {
  const door = startRoomDoor(compiled);
  assert.equal(door.openIsland(ISLAND), true);
  const [ann, guest] = [door.join(), door.join()];
  assert.ok(door.own(ann, 'ann'));
  const character = JSON.parse(door.character(ann) ?? '{}') as Record<string, unknown>;
  const refit = { ...character, fleet: { ships: [{ hull: 0 }, { hull: 2 }], sailed: 2 }, xp: 40_000 };
  assert.ok(door.restoreCharacter(ann, JSON.stringify(refit)));
  assert.equal(door.named(ann), REFIT);
  assert.equal(door.named(guest), '', 'a player of no account is named by none');
  assert.ok(door.name(ann, 'Ann') && door.tag(ann, 'SD'));
  assert.equal(door.named(ann), REFIT.replace('"username":"","tag":""', '"username":"Ann","tag":"SD"'), 'as told now');
});
