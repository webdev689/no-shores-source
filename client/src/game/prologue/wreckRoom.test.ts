import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import type { CourseBlock } from '../../../../server/roomDoor.ts';
import { LocalRoom } from '../../network/localRoom.ts';
import type { Snapshot } from '../../network/roomConnection.ts';
import { glanceFrom, glanceView } from '../../rules/fighters.ts';
import { courseOf, layoutAt, readWreck, topAt, type WreckLayout } from './wreckLayout.ts';

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

/** Origins far out in the world the wreck is laid at, where a sum lands a spot on a seam between deck blocks. */
const FAR_OUT: readonly (readonly [number, number])[] = [
  [500, 500],
  [23817, -4120],
  [12000.37, -8000.11],
  [-30411.8, 19077.25],
];
/** Thule's roster type and rank, and the levels he stands over the player. */
const THULE = { type: 12, rank: 5, level: 4 };
/** How long a fight is watched, seconds. */
const WATCHED_S = 40;

/** A room on the wreck, alone in the page, the player at `at`, and its last snapshot. */
function wreckRoom(
  blocks: readonly CourseBlock[] = course,
  [spawnX, spawnY]: readonly [number, number] = [wakeX, wakeY],
): { room: LocalRoom; last: () => Snapshot } {
  let last: Snapshot | null = null;
  const room = LocalRoom.openOverSea(compiled, { x: spawnX, y: spawnY }, blocks, (snapshot) => (last = snapshot));
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

test('the page stands a wave on the deck, sends it away, and brings the player back from the sea', () => {
  const { room, last } = wreckRoom();
  const foe = layout.zones[1]?.wave[0];
  assert.ok(foe);
  const id = room.standFoe(foe.type, foe.rank, foe.at[0], foe.at[1], foe.facing, 1);
  assert.ok(id > 0);
  room.pump(ONE_TICK);
  const stood = last().foes.find((seen) => seen.id === id);
  assert.equal(stood?.type, foe.type);
  room.clearFoes();
  room.pump(ONE_TICK);
  assert.equal(last().foes.length, 0);
  const [checkX, checkY] = layout.zones[2]?.checkpoint ?? [0, 0];
  room.putPlayer(checkX, checkY);
  room.pump(ONE_TICK);
  assert.deepEqual(feet(last(), room.player), [checkX, checkY, topAt(course, checkX, checkY)]);
});

test('a block stood on the course closes a way: the player put on it stands on its top', () => {
  const { room, last } = wreckRoom();
  const { gate } = layout.arena;
  room.standBlock(gate);
  const [x, y] = [(gate.minX + gate.maxX) / 2, (gate.minY + gate.maxY) / 2];
  room.putPlayer(x, y);
  room.pump(ONE_TICK);
  assert.equal(feet(last(), room.player)?.[2], gate.top);
});

test("a zone's heap stood across the way stops the player, and taken once its wave falls lets them through", () => {
  const { room, last } = wreckRoom();
  const gate = layout.zones[0]?.gate;
  assert.ok(gate);
  const [x, y] = [(gate.minX + gate.maxX) / 2, (gate.minY + gate.maxY) / 2];
  room.standBlock(gate);
  room.putPlayer(x, y);
  room.pump(ONE_TICK);
  assert.equal(feet(last(), room.player)?.[2], gate.top, 'the heap stands');
  room.takeBlock(gate);
  room.putPlayer(x, y);
  room.pump(ONE_TICK);
  assert.equal(feet(last(), room.player)?.[2], topAt(course, x, y), 'and is gone');
});

test('every foe of every wave stands on the deck under it, at every origin the wreck is laid at', () => {
  for (const origin of FAR_OUT) {
    const placed = layoutAt(layout, origin);
    const blocks = courseOf(placed);
    const { room, last } = wreckRoom(blocks, placed.wake.at);
    for (const foe of placed.zones.flatMap((zone) => zone.wave)) {
      room.clearFoes();
      const id = room.standFoe(foe.type, foe.rank, foe.at[0], foe.at[1], foe.facing, 1);
      room.pump(ONE_TICK);
      const stood = last().foes.find((seen) => seen.id === id)?.glance[2];
      assert.equal(stood, topAt(blocks, ...foe.at), `a foe at ${foe.at.join(', ')} from ${origin.join(', ')}`);
    }
  }
});

/** The lowest health the player and each foe came to over a fight watched in a room on `placed`, the player standing
 *  at `spot`, the foes the page stands in `stand`. */
function watched(placed: WreckLayout, spot: readonly [number, number], stand: (room: LocalRoom) => void) {
  const { room, last } = wreckRoom(courseOf(placed), spot);
  stand(room);
  let player = Infinity;
  const foes = new Map<number, { lowest: number; most: number }>();
  for (let tick = 0; tick < WATCHED_S * 60; tick++) {
    room.pump(1 / 60);
    const mine = last().players.find((seen) => seen.player === room.player)?.fighter;
    if (mine) player = Math.min(player, glanceView(glanceFrom(mine)).health);
    for (const foe of last().foes) {
      const { health, healthMax } = glanceView(foe.glance);
      const lowest = Math.min(foes.get(foe.id)?.lowest ?? Infinity, health);
      foes.set(foe.id, { lowest, most: healthMax });
    }
  }
  return { player, foes: [...foes.values()] };
}

/** A spot `apart` metres from (x, y) toward `toward`. */
function short([x, y]: readonly [number, number], toward: readonly [number, number], apart: number): [number, number] {
  const length = Math.hypot(toward[0] - x, toward[1] - y);
  return [x + ((toward[0] - x) * apart) / length, y + ((toward[1] - y) * apart) / length];
}

test("each wave's two sides fight each other and the player standing by them, on the decks far out at sea", () => {
  const placed = layoutAt(layout, FAR_OUT[1] ?? [0, 0]);
  const blocks = courseOf(placed);
  placed.zones.forEach((zone, index) => {
    const [first] = zone.wave;
    if (!first) return;
    const spot = short(first.at, zone.checkpoint, 1.2);
    assert.ok(topAt(blocks, ...spot) >= 2, `${zone.name}: the player stands on her deck`);
    const fought = watched(placed, spot, (room) => {
      for (const other of placed.zones) if (other.gate && other !== zone) room.standBlock(other.gate);
      for (const foe of zone.wave) room.standFoe(foe.type, foe.rank, foe.at[0], foe.at[1], foe.facing, 1);
    });
    assert.ok(fought.player < 100, `${zone.name}: the player standing by is struck (${index})`);
    // The player never strikes: a foe struck was struck by the other side.
    assert.ok(
      fought.foes.some((foe) => foe.lowest < foe.most),
      `${zone.name}: its two sides fight: ${JSON.stringify(fought.foes)}`,
    );
  });
});

test('Thule strikes a player who stands before him in the arena', () => {
  const placed = layoutAt(layout, FAR_OUT[2] ?? [0, 0]);
  const [x, y] = placed.arena.thule;
  const fought = watched(placed, [x, y - 2.7], (room) => room.standFoe(THULE.type, THULE.rank, x, y, 0, THULE.level));
  assert.ok(fought.player < 100, `the player is struck: ${fought.player}`);
});
