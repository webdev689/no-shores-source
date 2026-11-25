import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import * as flatbuffers from 'flatbuffers';
import { FromRoom } from '../generated/messages/ts/overlook/wire.ts';
// The browser's side of the messages, so this run sends the room exactly the bytes a browser sends.
import { inputBytes, readFromRoom } from '../client/src/network/messages.ts';
import { SnapshotKeeper } from '../client/src/network/snapshots.ts';
import { startRoomDoor } from './roomDoor.ts';

const compiled = new WebAssembly.Module(
  await readFile(new URL('../target/wasm32-unknown-unknown/release/room_wasm.wasm', import.meta.url)).catch(() => {
    throw new Error('room_wasm.wasm is not built: run `npm run wasm` first');
  }),
);

/** The room door's test holds the same ask, script and fingerprint; they are read from it
 *  (crates/room-wasm/src/passage_room_door_tests.rs), so the two can never hold different ones. */
const door = await readFile(new URL('../crates/room-wasm/src/passage_room_door_tests.rs', import.meta.url), 'utf8');
const doorHolds = (name: string): string => {
  const found = new RegExp(`const ${name}: [^=]+=\\s*([^;]+);`).exec(door)?.[1];
  if (found === undefined) throw new Error(`${name} is not in the room door's test`);
  return found.trim();
};
const number = (name: string) => Number(doorHolds(name).replaceAll('_', ''));
const ASK = /r#"(.*)"#/.exec(doorHolds('PASSAGE_ASK'))?.[1] ?? '';
const PASSAGE_HASH = doorHolds('PASSAGE_HASH').replaceAll('"', '');
const [PASSAGE_DONE, RUN_TICKS, SWING_EVERY, HEALTH, REACH_M] = [
  'PASSAGE_DONE',
  'RUN_TICKS',
  'SWING_EVERY',
  'HEALTH',
  'REACH_M',
].map(number);
/** A sword in the main hand, by combat's arms code: the kitted character's. */
const SWORD = 2;
/** XP the rules' diver earns (`diver`), well past level 20. */
const DIVER_XP = 10_000_000;

/** How far apart two points are, as combat::sight::apart measures them, to the bit. */
function apart(one: ArrayLike<number>, two: ArrayLike<number>): number {
  const [along, down] = [(two[0] ?? 0) - (one[0] ?? 0), (two[1] ?? 0) - (one[1] ?? 0)];
  return Math.sqrt(along * along + down * down);
}

test('a passage zone’s room fights its deal done to the same fingerprint through WebAssembly as natively', () => {
  const room = startRoomDoor(compiled);
  const asked = JSON.parse(ASK.replace('ZONE', '0')) as { island: string; week: number };
  const web = JSON.parse(room.passageWeb(asked.island, asked.week)) as { zones: { number: number; deal: string }[] };
  const ambush = web.zones.find((zone) => zone.deal === 'ambush');
  assert.ok(ambush, 'the week holds an Ambush');
  assert.equal(room.openPassage(ASK.replace('ZONE', String(ambush.number))), true);
  assert.equal(room.refusal(), null, 'its week');
  const player = room.join();
  // The rules' diver: kitted, past the prologue, raised, on a public dive in the zone from the first mouth.
  const character = JSON.parse(room.kitted()) as { xp: number; story: { prologue: boolean }; passage?: object };
  character.xp += DIVER_XP;
  character.story.prologue = true;
  const { island, week } = asked;
  character.passage = { island, week, route: 'public', mouth: 0, zone: ambush.number, depth: 1 };
  assert.equal(room.restoreCharacter(player, JSON.stringify(character)), true);
  const kept = new SnapshotKeeper();
  let [hash, doneAt] = [0x811c_9dc5, 0];
  let own: ArrayLike<number> = [0, 0];
  let living: (readonly number[])[] = [];
  for (let tick = 1; tick <= RUN_TICKS; tick++) {
    // It runs at the nearest living foe as its snapshots show them, and swings once it is near.
    const nearest = living.reduce<readonly number[] | null>(
      (best, foe) => (best === null || apart(own, foe) < apart(own, best) ? foe : best),
      null,
    );
    const yaw = nearest ? Math.atan2((nearest[0] ?? 0) - (own[0] ?? 0), -((nearest[1] ?? 0) - (own[1] ?? 0))) : 0;
    const near = nearest !== null && apart(own, nearest) <= REACH_M;
    const swing = near && tick % SWING_EVERY === 0 ? 1 : 0;
    const forward = nearest && !near ? 1 : 0;
    const intent = new Float64Array([forward, 0, yaw, 1, 0, 0, 0, 0, swing, 0, 0, 0, 0, 0, NaN, NaN, NaN, 0]);
    const look = { anim: '', frame: 0, facing: 0 };
    const input = inputBytes(tick, { intent, look, arms: SWORD, seen: BigInt(tick - 1), respawn: true });
    assert.equal(room.input(player, input), 'taken');
    room.tick();
    const bytes = room.snapshot(player);
    for (const byte of bytes) hash = Math.imul(hash ^ byte, 0x0100_0193) >>> 0;
    // The deal as the snapshot carries it, read from the wire's own tables: whether it is done, and the mouths open.
    const seen = FromRoom.getRootAsFromRoom(new flatbuffers.ByteBuffer(bytes)).snapshot()?.passage();
    assert.ok(seen, 'a passage zone’s deal crosses in its snapshot');
    if (seen.done() && doneAt === 0) {
      doneAt = tick;
      assert.ok(seen.open(), 'the mouths open with it');
    }
    const read = readFromRoom(bytes);
    const message = read?.kind === 'snapshot' ? kept.whole(read) : null;
    if (!message) continue;
    living = message.foes.map((foe) => Array.from(foe.glance)).filter((glance) => (glance[HEALTH] ?? 0) > 0);
    own = message.players.find((each) => each.player === player)?.fighter ?? own;
  }
  assert.deepEqual([hash.toString(16).padStart(8, '0'), doneAt], [PASSAGE_HASH, PASSAGE_DONE]);
});
