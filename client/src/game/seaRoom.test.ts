import assert from 'node:assert/strict';
import { test } from 'node:test';
import { courseBytes, helmBytes } from '../network/messages.ts';
import type { RoomLink, Snapshot } from '../network/roomConnection.ts';
import { SeaRoom } from './seaRoom.ts';

/** A sea room's link in the test: what the page sends, and its snapshots handed on by tick. */
async function joined(): Promise<{ room: SeaRoom; sent: Uint8Array[]; atTick: (tick: number) => void }> {
  const sent: Uint8Array[] = [];
  let hand: (snapshot: Snapshot) => void = () => undefined;
  const link: RoomLink = {
    player: 1,
    dressed: [],
    lost: null,
    send: (bytes) => sent.push(bytes),
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
  const atTick = (tick: number) =>
    hand({ tick: BigInt(tick), players: [], ships: [], pirates: [], fights: [] } as unknown as Snapshot);
  return { room, sent, atTick };
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
