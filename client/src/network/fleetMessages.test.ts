import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import * as flatbuffers from 'flatbuffers';
import { Orders } from '../../../generated/messages/ts/overlook/wire.ts';
import { commissionOf, ordersBytes } from './fleetMessages.ts';
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
    fleet.vessels.map((vessel) => [vessel.faction, vessel.rank]),
    [
      [0, 0],
      [0, 0],
      [1, 3],
    ],
    'players’ ships, then a Grey Tithe Elite',
  );
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
      [12n, 'ram', 9, 0],
      [13n, 'struck-at', 9, 1],
      [13n, 'sail-lost', 9, 2],
      [13n, 'mast-fell', 9, 1],
      [13n, 'struck', 9, 0],
      [14n, 'sinking', 9, 0],
      [15n, 'flotsam', 21, 2],
      [16n, 'gathered', 21, 0],
      [16n, 'boarding', 9, 0],
    ],
  );
  const ram = fleet.naval[9];
  assert.deepEqual([ram?.by, ram?.point, ram?.left], [4, [7, 8, 1], 27], 'a ram: who rammed, where, and what it took');
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
    captain: { faction: 1, rank: 4 },
  });
  const orders = Orders.getRootAsOrders(new flatbuffers.ByteBuffer(bytes));
  assert.deepEqual(
    [orders.sequence(), orders.steer(), orders.crab(), orders.climb(), orders.fire(), orders.brace(), orders.load()],
    [41, -0.75, true, -1, true, false, 3],
  );
  assert.deepEqual(Array.from(orders.aimArray() ?? []), [-97.5, 64.25, ...ray]);
  assert.deepEqual([Array.from(orders.putToSeaArray() ?? []), orders.call()], [[200_000, 300_000, 1.25], 1]);
  assert.deepEqual([orders.callFaction(), orders.callRank()], [1, 4], 'a Miniboss of the Grey Tithe called');
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
  assert.deepEqual([plain.callFaction(), plain.callRank()], [0, 0], 'no captain called, none named');
});

test('orders never wrap a number past its field: her number, load and call are refused, and her rudder, rung and look are held within what the room takes', () => {
  const orders = {
    steer: 3,
    crab: false,
    climb: 255,
    look: { bearing: 400, range: 2e6 },
    fire: false,
    brace: false,
    load: 0,
    putToSea: null,
    call: 'none',
  } as const;
  const held = Orders.getRootAsOrders(new flatbuffers.ByteBuffer(ordersBytes(1, orders)));
  assert.deepEqual([held.steer(), held.climb(), Array.from(held.aimArray() ?? [])], [1, 1, [180, 1e5]]);
  const under = { ...orders, steer: -3, climb: -255, look: { bearing: -400, range: -5 } };
  const low = Orders.getRootAsOrders(new flatbuffers.ByteBuffer(ordersBytes(1, under)));
  assert.deepEqual([low.steer(), low.climb(), Array.from(low.aimArray() ?? [])], [-1, -1, [-180, 0]]);
  assert.throws(() => ordersBytes(-1, orders), RangeError);
  assert.throws(() => ordersBytes(2 ** 32, orders), RangeError);
  assert.throws(() => ordersBytes(1, { ...orders, load: 5 }), RangeError);
  assert.throws(() => ordersBytes(1, { ...orders, steer: Number.NaN }), RangeError);
  assert.throws(() => ordersBytes(1, { ...orders, look: { bearing: 0, range: 5, ray: [Number.NaN] } }), RangeError);
  assert.throws(() => ordersBytes(1, { ...orders, putToSea: [Number.POSITIVE_INFINITY, 0, 0] }), RangeError);
  const calling = { ...orders, call: 'captain' } as const;
  assert.throws(() => ordersBytes(1, { ...calling, captain: { faction: 258, rank: 2 } }), RangeError);
  assert.throws(() => ordersBytes(1, { ...calling, captain: { faction: 1, rank: 6 } }), RangeError);
});

test('an older room’s captain, sent with no faction or rank, reads as a Major of the pirates', () => {
  assert.deepEqual(commissionOf(0, 0), { faction: 2, rank: 2 });
  assert.deepEqual(commissionOf(1, 3), { faction: 1, rank: 3 });
});
