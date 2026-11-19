import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { LocalRoom } from '../../network/localRoom.ts';
import type { Snapshot } from '../../network/roomConnection.ts';
import { courseOf, readWreck, topAt } from './wreckLayout.ts';

const MODULE = new URL('../../../../target/wasm32-unknown-unknown/release/room_wasm.wasm', import.meta.url);
const compiled = new WebAssembly.Module(
  await readFile(MODULE).catch(() => {
    throw new Error('room_wasm.wasm is not built: run `npm run wasm` first');
  }),
);
/** A little more than one of the room's ticks, seconds. */
const ONE_TICK = 0.02;
const layout = readWreck();
const course = courseOf(layout);
const [wakeX, wakeY] = layout.wake.at;

/** A room on the wreck, alone in the page, and its last snapshot. */
function wreckRoom(): { room: LocalRoom; last: () => Snapshot } {
  let last: Snapshot | null = null;
  const room = LocalRoom.open(compiled, { x: wakeX, y: wakeY }, course, (snapshot) => (last = snapshot));
  room.pump(ONE_TICK);
  return {
    room,
    last: () => {
      if (!last) throw new Error('the room sent nothing');
      return last;
    },
  };
}

const feet = (snapshot: Snapshot, player: number) => {
  const fighter = snapshot.players.find((seen) => seen.player === player)?.fighter;
  return fighter ? [fighter[0] ?? 0, fighter[1] ?? 0, fighter[2] ?? 0] : null;
};

test('the wreck opens as a room, the player waking on the quarterdeck, not in the sea under it', () => {
  const { room, last } = wreckRoom();
  const woke = feet(last(), room.player);
  assert.deepEqual(woke, [wakeX, wakeY, topAt(course, wakeX, wakeY)]);
});

test('the page stands a wave on the deck, brings the player back from the sea, and keeps checkpoints', () => {
  const { room, last } = wreckRoom();
  const foe = layout.zones[1]?.wave[0];
  assert.ok(foe);
  const id = room.standFoe(foe.type, foe.rank, foe.at[0], foe.at[1], foe.facing, 1);
  assert.ok(id > 0);
  room.pump(ONE_TICK);
  const stood = last().foes.find((seen) => seen.id === id);
  assert.equal(stood?.type, foe.type);
  const [checkX, checkY] = layout.zones[2]?.checkpoint ?? [0, 0];
  room.putPlayer(checkX, checkY);
  room.setSpawn(checkX, checkY);
  room.pump(ONE_TICK);
  assert.deepEqual(feet(last(), room.player), [checkX, checkY, topAt(course, checkX, checkY)]);
});
