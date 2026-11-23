import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import type { Snapshot } from '../../network/roomConnection.ts';
import { type FromRooms, serveRooms, type ToRooms } from '../../network/roomServe.ts';
import { roomPort, RoomThread } from '../../network/roomThread.ts';
import { courseOf, readWreck } from './wreckLayout.ts';
import { SWORD_AND_SHIELD } from './wreckTeaching.ts';

const compiled = new WebAssembly.Module(
  await readFile(new URL('../../../../target/wasm32-unknown-unknown/release/room_wasm.wasm', import.meta.url)),
);

/** The rooms' worker as a thread is: each word crossing a task later, copied as a message is. */
function joinedPort(): void {
  let toGame: (said: FromRooms) => void = () => undefined;
  const serve = serveRooms((said) => setTimeout(() => toGame(structuredClone(said))));
  roomPort({
    post: (told: ToRooms) =>
      setTimeout(() =>
        serve(told.kind === 'open' ? { ...told, opening: structuredClone(told.opening) } : structuredClone(told)),
      ),
    hear: (heard) => (toGame = heard),
    fail: () => undefined,
  });
}
const settled = () => new Promise((done) => setTimeout(done, 5));

test("the wreck's room in the worker answers the story's asks in turn, as the same room in the page", async () => {
  joinedPort();
  const wreck = readWreck();
  const course = courseOf(wreck);
  const [x, y] = wreck.wake.at;
  const seen: Snapshot[] = [];
  const room = await RoomThread.openOverSea(
    compiled,
    { x, y },
    course,
    (snapshot) => seen.push(snapshot),
    () => {},
  );
  // Asked one after another without waiting, as the run asks them: each made in the worker in that order.
  const asked = [
    room.story({ ask: 'wreck' }),
    room.story({ ask: 'stand', type: 8, rank: 1, x, y: y + 4, facing: 0, level: 1, hunt: true }),
    room.story({ ask: 'take', kind: SWORD_AND_SHIELD }),
    room.story({ ask: 'take', kind: SWORD_AND_SHIELD }),
  ];
  const [woke, boarder = 0, given, again] = await Promise.all(asked);
  assert.equal(woke, 1);
  assert.ok(boarder > 0, 'the boarder stood, its number answered');
  assert.deepEqual([given, again], [1, 0], 'the arms given once, refused while carried');
  for (let frame = 0; frame < 5; frame++) {
    room.pump(1 / 30);
    await settled();
  }
  assert.ok(
    seen.at(-1)?.foes.some((foe) => foe.id === boarder),
    'the boarder stands in its snapshots',
  );
  assert.equal(await room.story({ ask: 'clear' }), 1);
  room.close();
  assert.equal(await room.story({ ask: 'stand', type: 8, rank: 1, x, y, facing: 0, level: 1 }), 0, 'let go: none');
});
