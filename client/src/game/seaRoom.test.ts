import assert from 'node:assert/strict';
import { test } from 'node:test';
import { courseBytes, helmBytes } from '../network/messages.ts';
import type { SeenShip } from '../network/messages.ts';
import type { Snapshot } from '../network/roomConnection.ts';
import { SeaRoom } from './seaRoom.ts';

/** A sea room's link in the test: what the page sends, and its snapshots handed on by tick, with the ships at sea. */
async function joined() {
  const sent: Uint8Array[] = [];
  let hand: (snapshot: Snapshot) => void = () => undefined;
  const link = {
    player: 1,
    dressed: [],
    joins: 1,
    rejoining: false,
    lost: null,
    send: (bytes: Uint8Array) => void sent.push(bytes),
    pump: () => undefined,
  };
  const room = await SeaRoom.join(
    (snapshot) => {
      hand = snapshot;
      return link;
    },
    [50_000, 150_000],
    10,
  );
  const atTick = (tick: number, ships: readonly SeenShip[] = [], told: readonly number[][] = []) =>
    hand({
      tick: BigInt(tick),
      players: [],
      ships,
      pirates: [],
      fights: [],
      flotsam: [],
      kept: [],
      told: told.map((numbers) => ({ player: 1, numbers })),
      decks: [],
      islands: [],
    } as unknown as Snapshot);
  return { room, sent, atTick, link };
}

test('a course set sooner than the sea takes one waits for a later snapshot, the newest in place of the rest', async () => {
  const { room, sent, atTick } = await joined();
  assert.equal(sent.length, 1, 'joining puts her to sea at once');
  room.course([[60_000, 150_000]], 10);
  room.course([[70_000, 150_000]], 20);
  atTick(1000);
  assert.equal(sent.length, 1, 'the room took her first course by its first snapshot: the next waits on from there');
  atTick(1044);
  assert.equal(sent.length, 1);
  atTick(1045);
  assert.equal(sent.length, 2, 'sent once the sea will take it');
  room.course([[80_000, 150_000]], 20);
  atTick(1089);
  assert.equal(sent.length, 2);
  atTick(1090);
  assert.equal(sent.length, 3);
  assert.notDeepEqual(sent[1], sent[2], 'each its own course');
});

test('a facing still waiting when the player leaves the helm is let go, and a course is sent before the leave', async () => {
  const { room, sent, atTick } = await joined();
  room.face(1.5);
  room.leaveHelm();
  atTick(1000);
  assert.equal(sent.length, 2, 'the course that put her to sea, and the helm left: no facing');
  room.course([[60_000, 150_000]], 10);
  room.leaveHelm();
  assert.equal(sent.length, 2, 'the leave waits on the course');
  atTick(1100);
  assert.deepEqual(
    sent.slice(2),
    [courseBytes([[60_000, 150_000]], 10), helmBytes(true)],
    'the course, then the leave',
  );
});

test('while its link rejoins the sea shows none of its ships; joined again, she is its new player, her course sent at once', async () => {
  const { room, sent, atTick, link } = await joined();
  atTick(1000, [{ player: 1, x: 50_000, y: 150_000, heading: 0, pace: 0 }]);
  assert.ok(room.ownShip);
  link.rejoining = true;
  room.pump(0);
  assert.equal(room.ownShip, null, 'the old room has her no more');
  Object.assign(link, { player: 4, joins: 2, rejoining: false });
  assert.deepEqual([room.rejoined(), room.rejoined(), room.own], [true, false, 4]);
  room.course([[50_000, 150_000]], 10);
  assert.equal(sent.length, 2, 'put to sea again at once, with no wait on the old room’s clock');
});

test('washed up, the player’s ship lies where the room moored her, taken once, and what the sea told is kept', async () => {
  const { room, atTick } = await joined();
  const moored = { player: 1, x: 61_000, y: 50_000, heading: 1, pace: 0 };
  atTick(5, [moored], [[20, 5, 0, 1]]);
  assert.deepEqual(room.takeWashed(), { x: 61_000, y: 50_000, heading: 1 });
  assert.equal(room.takeWashed(), null, 'taken once');
  atTick(6, [moored]);
  assert.equal(room.takeWashed(), null, 'only the snapshot that tells it moors her');
  assert.deepEqual(room.takeTold().told, [[20, 5, 0, 1]]);
});

test('back at sea, her ship lies where the room last kept her', async () => {
  const { room, atTick } = await joined();
  atTick(5, [{ player: 1, x: 61_000, y: 50_000, heading: 2, pace: 0 }], [[23, 5, 61_000, 50_000, 2]]);
  assert.deepEqual(room.takeWashed(), { x: 61_000, y: 50_000, heading: 2 });
});
