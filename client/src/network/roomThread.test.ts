import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import layout from '../../../content/world/layout.json' with { type: 'json' };
import { LocalRoom } from './localRoom.ts';
import type { Snapshot } from './roomConnection.ts';
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
  });
}
const settled = () => new Promise((done) => setTimeout(done, 5));

test('a sea in the rooms’ worker sends the same snapshots as the same sea in the page', async (context) => {
  context.mock.method(Date, 'now', () => Date.UTC(2026, 10, 21, 12, 0, 0));
  joinedPort();
  const [here, there]: Snapshot[][] = [[], []];
  const page = LocalRoom.openSea(compiled, layoutText, (snapshot) => here.push(snapshot), 42);
  const worker = await RoomThread.openSea(compiled, layoutText, (snapshot) => there.push(snapshot), 42);
  assert.deepEqual([worker.player, worker.epoch], [page.player, page.epoch]);
  for (let frame = 0; frame < 10; frame++) {
    page.pump(0.05);
    worker.pump(0.05);
    await settled();
  }
  assert.ok(here.length > 0, 'the sea ticked');
  assert.deepEqual(there, here, 'tick for tick');
  assert.equal(await worker.isleWord(1), page.isleWord(1), 'its word on an island too');
  worker.close();
  worker.pump(1);
  await settled();
  assert.equal(there.length, here.length, 'let go, it sends no more');
});

test('a room that cannot open says why, and the game hears it as a failed opening', async () => {
  joinedPort();
  await assert.rejects(
    RoomThread.openNode(compiled, '{"not":"a node"}', () => undefined),
    /not one a room can stand on/,
  );
});
