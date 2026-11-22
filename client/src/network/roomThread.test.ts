import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { isDeepStrictEqual } from 'node:util';
import layout from '../../../content/world/layout.json' with { type: 'json' };
import { LocalRoom } from './localRoom.ts';
import type { GearMessage, Snapshot } from './roomConnection.ts';
import { type FromRooms, serveRooms, type ToRooms } from './roomServe.ts';
import { roomPort, RoomThread } from './roomThread.ts';

const MODULE = new URL('../../../target/wasm32-unknown-unknown/release/room_wasm.wasm', import.meta.url);
const compiled = new WebAssembly.Module(
  await readFile(MODULE).catch(() => {
    throw new Error('room_wasm.wasm is not built: run `npm run wasm` first');
  }),
);
const layoutText = JSON.stringify(layout);

/** The worker as a thread is: each word crossing a task later, copied as a message is (the module shared, as a
 *  worker shares it). */
function joinedPort(): void {
  let toGame: (said: FromRooms) => void = () => undefined;
  const serve = serveRooms((said) => setTimeout(() => toGame(structuredClone(said))));
  roomPort({
    post: (told: ToRooms) => setTimeout(() => serve(told.kind === 'open' ? told : structuredClone(told))),
    hear: (heard) => (toGame = heard),
    fail: () => undefined,
  });
}
const settled = () => new Promise((done) => setTimeout(done, 5));
/** Waits until `came` holds, two seconds at most: the worker's words come back by message, later under a full check's
 *  load than any one wait. The assertion after it says what never came. */
async function until(came: () => boolean): Promise<void> {
  // `performance`, not `Date`: a test may hold `Date.now` still.
  const deadline = performance.now() + 2000;
  while (!came() && performance.now() < deadline) await settled();
}

test('a sea in the rooms’ worker sends the same snapshots as the same sea in the page', async (context) => {
  context.mock.method(Date, 'now', () => Date.UTC(2026, 10, 21, 12, 0, 0));
  joinedPort();
  const [here, there]: Snapshot[][] = [[], []];
  const [geared, gearedThere]: GearMessage[][] = [[], []];
  const page = LocalRoom.openSea(
    compiled,
    layoutText,
    (snapshot) => here.push(snapshot),
    42,
    [],
    0,
    (gear) => geared.push(gear),
  );
  const worker = await RoomThread.openSea(
    compiled,
    layoutText,
    (snapshot) => there.push(snapshot),
    42,
    [],
    0,
    (gear) => gearedThere.push(gear),
  );
  assert.deepEqual([worker.player, worker.epoch], [page.player, page.epoch]);
  for (let frame = 0; frame < 10; frame++) {
    page.pump(0.05);
    worker.pump(0.05);
    await settled();
  }
  assert.ok(here.length > 0, 'the sea ticked');
  await until(() => there.length >= here.length && gearedThere.length >= geared.length);
  assert.deepEqual(there, here, 'tick for tick');
  assert.deepEqual(gearedThere, geared, 'and each word on the gear, if it says any');
  assert.deepEqual([worker.trim, worker.arms, worker.arts], [page.trim, page.arms, page.arts]);
  assert.equal(await worker.isleWord(1), page.isleWord(1), 'its word on an island too');
  worker.close();
  worker.pump(1);
  await settled();
  assert.equal(there.length, here.length, 'let go, it sends no more');
});

/** A node's file as the bake writes it: a glade 100 m square round its spawn, on land 10 m up. */
function glade(): string {
  const grid = (value: number) => ({
    ...{ width: 4, height: 4, left_m: -2000, top_m: -2000, cell_m: 1000, first_column: 0, first_row: 0 },
    data: Array<number>(16).fill(value),
  });
  const layers = { land: grid(10), lake_level: Array<number>(16).fill(0), rivers: [], roads: [], towns: [] };
  const ground = { ...layers, coast: grid(5000), across: grid(-50), pads: [], seed: 7 };
  const ring = [
    [-50, -50],
    [50, -50],
    [50, 50],
    [-50, 50],
  ];
  return JSON.stringify({
    id: 'glade',
    kind: 'social',
    ring,
    spawns: [[0, 0]],
    bounds: [-150, -150, 150, 150],
    boxes: [],
    ground,
  });
}

test("a node's room in the worker keeps the player's gear as the same room in the page does", async () => {
  joinedPort();
  const page = LocalRoom.openNode(compiled, glade(), () => undefined);
  const worker = await RoomThread.openNode(compiled, glade(), () => undefined);
  for (let frame = 0; frame < 10; frame++) {
    page.pump(0.05);
    worker.pump(0.05);
    await settled();
  }
  assert.ok(page.trim ?? page.arms ?? page.arts, 'the room said the gear');
  const gear = (room: LocalRoom | RoomThread) => [room.trim, room.arms, room.arts];
  await until(() => isDeepStrictEqual(gear(worker), gear(page)));
  assert.deepEqual(gear(worker), gear(page));
  worker.close();
});

test('a room that cannot open says why, and the game hears it as a failed opening', async () => {
  joinedPort();
  await assert.rejects(
    RoomThread.openNode(compiled, '{"not":"a node"}', () => undefined),
    /not one a room can stand on/,
  );
});

test('a word asked of a room let go before it answers is answered with none, never left waiting', async () => {
  joinedPort();
  const sea = await RoomThread.openSea(compiled, layoutText, () => undefined, 42);
  const asked = sea.isleWord(1);
  sea.close();
  assert.equal(await asked, '');
});

test('a room that fails in the worker is lost, why said, and what it was asked is answered', async () => {
  joinedPort();
  const node = await RoomThread.openNode(compiled, glade(), () => undefined);
  const asked = node.isleWord(1);
  // Bytes no input can be read from: the room's door throws on them in the worker.
  node.send(undefined as unknown as Uint8Array<ArrayBuffer>);
  await until(() => node.lost !== null);
  assert.ok(node.lost, 'the room is lost within two seconds');
  assert.equal(await asked, '');
  assert.equal(await node.isleWord(1), '', 'and asked again, answers none');
});

test('a rooms worker that fails loses every room and refuses every opening still waiting', async () => {
  let fail: (reason: string) => void = () => undefined;
  roomPort({ post: () => undefined, hear: () => undefined, fail: (failed) => (fail = failed) });
  const opening = RoomThread.openNode(compiled, glade(), () => undefined);
  fail('the worker could not start');
  await assert.rejects(opening, /the worker could not start/);
});
