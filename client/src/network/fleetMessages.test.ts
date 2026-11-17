import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import * as flatbuffers from 'flatbuffers';
import { Orders } from '../../../generated/messages/ts/overlook/wire.ts';
import { ordersBytes } from './fleetMessages.ts';
import { readFromRoom } from './messages.ts';

const written = (name: string) =>
  readFile(new URL(`../../../target/protocol/${name}`, import.meta.url))
    .then((bytes) => new Uint8Array(bytes))
    .catch(() => {
      throw new Error(`protocol/${name} is not built: run \`cargo test -p protocol\``);
    });

test('a fleet snapshot the server wrote reads back as its ships and what happened', async () => {
  // crates/protocol/src/fleet_tests.rs writes this: two players' ships, 3 and 4, and captain 9, with an event of
  // every kind but a ball flown out of reckoning.
  const fleet = readFromRoom(await written('fleet.bin'));
  assert.equal(fleet?.kind, 'snapshot');
  if (fleet?.kind !== 'snapshot') return;
  assert.deepEqual(
    fleet.vessels.map((vessel) => [vessel.id, vessel.captain, vessel.acknowledged]),
    [
      [3, false, 12],
      [4, false, 0],
      [9, true, 0],
    ],
  );
  const [first] = fleet.vessels;
  assert.deepEqual(Array.from(first?.ship ?? []), [200_000, 300_000, 0.5, 1.5, -0.25, 3, 1, 2]);
  assert.deepEqual(first?.hurts, { hull: 240, maxHull: 240, sail: 96, maxSail: 96, crew: 0, maxCrew: 0 });
  assert.deepEqual([first?.state, first?.load, fleet.vessels[2]?.mode], ['afloat', 1, 'cruise']);
  assert.deepEqual(
    fleet.naval.map((event) => [event.tick, event.kind, event.ship, event.detail]),
    [
      [7n, 'muzzle', 3, 0],
      [8n, 'hit', 9, 1],
      [8n, 'splash', 9, 0],
      [9n, 'run-out', 9, 1],
      [9n, 'state', 9, 1],
      [10n, 'refused', 4, 3],
      [10n, 'no-sail', 4, 1],
      [10n, 'load', 3, 2],
      [11n, 'gone', 9, 0],
    ],
  );
  const [muzzle, hit] = fleet.naval;
  assert.deepEqual([muzzle?.point, muzzle?.launch, hit?.by], [[1, 2, 3], [50, 2, 4], 3]);
  assert.deepEqual([fleet.naval[5]?.side, fleet.naval[5]?.left], [0, 2.5]);
  assert.deepEqual([fleet.tick, fleet.players, fleet.ships, fleet.fightClock], [77n, [], [], 0]);
});

test('orders are her helm, her look and its ray, the fire, the brace, a load, where she puts to sea and a call', () => {
  const ray = [200_001.5, 300_002, 6.5, 0.5, -0.25, -0.125];
  const bytes = ordersBytes(41, {
    steer: -0.75,
    crab: true,
    climb: -1,
    look: { bearing: -97.5, range: 64.25, ray },
    fire: true,
    brace: false,
    load: 3,
    putToSea: [200_000, 300_000, 1.25],
    call: 'captain',
  });
  const orders = Orders.getRootAsOrders(new flatbuffers.ByteBuffer(bytes));
  assert.deepEqual(
    [orders.sequence(), orders.steer(), orders.crab(), orders.climb(), orders.fire(), orders.brace(), orders.load()],
    [41, -0.75, true, -1, true, false, 3],
  );
  assert.deepEqual(Array.from(orders.aimArray() ?? []), [-97.5, 64.25, ...ray]);
  assert.deepEqual([Array.from(orders.putToSeaArray() ?? []), orders.call()], [[200_000, 300_000, 1.25], 1]);
  const plain = Orders.getRootAsOrders(
    new flatbuffers.ByteBuffer(
      ordersBytes(2, {
        steer: 0,
        crab: false,
        climb: 0,
        look: null,
        fire: false,
        brace: false,
        load: 0,
        putToSea: null,
        call: 'send off',
      }),
    ),
  );
  assert.deepEqual([plain.aimLength(), plain.putToSeaLength(), plain.call()], [0, 0, 255]);
});
