import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Sea } from './sea.ts';
import { SeaRoom } from './seaRoom.ts';

/** The sea's own fields a join reads and writes, and a room that notes whether it was closed. */
function seaJoining() {
  const sea = {
    joins: 0,
    room: null,
    roomLost: true,
    position: [0, 0],
    hull: {},
    passage: { pace: 1, room: null },
    sendLie: () => undefined,
  };
  const room = () => ({
    closed: false,
    close() {
      this.closed = true;
    },
  });
  return { sea, room };
}

test('a sea join that comes after the player has left is closed, not kept open behind them', async (context) => {
  const { sea, room } = seaJoining();
  const made = room();
  let arrive: (joined: unknown) => void = () => undefined;
  context.mock.method(SeaRoom, 'join', () => new Promise((resolve) => (arrive = resolve)));
  const entering = Sea.prototype.enterRoom.call(sea as unknown as Sea, (() => undefined) as never);
  Sea.prototype.leaveRoom.call(sea as unknown as Sea);
  arrive(made);
  await entering;
  assert.ok(made.closed);
  assert.equal(sea.room, null);
});

test('a second join closes the room of the first, whichever comes first', async (context) => {
  const { sea, room } = seaJoining();
  const [first, second] = [room(), room()];
  const arrivals: ((joined: unknown) => void)[] = [];
  context.mock.method(SeaRoom, 'join', () => new Promise((resolve) => arrivals.push(resolve)));
  const one = Sea.prototype.enterRoom.call(sea as unknown as Sea, (() => undefined) as never);
  const two = Sea.prototype.enterRoom.call(sea as unknown as Sea, (() => undefined) as never);
  arrivals[1]?.(second);
  arrivals[0]?.(first);
  await Promise.all([one, two]);
  assert.deepEqual([first.closed, second.closed], [true, false]);
  assert.equal(sea.room, second);
});

test('a sea room that would not open leaves the ship sailing alone and says so', () => {
  const { sea } = seaJoining();
  sea.roomLost = false;
  const sailed: unknown[] = [];
  const left = Object.assign(sea, {
    leaveRoom: Sea.prototype.leaveRoom,
    sailTo: (point: unknown) => sailed.push(point),
  });
  Sea.prototype.sailAlone.call(left as unknown as Sea, [3, 4]);
  assert.deepEqual([sea.room, sea.roomLost, sailed], [null, true, [[3, 4]]]);
});
