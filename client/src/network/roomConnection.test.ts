import assert from 'node:assert/strict';
import { type TestContext, test } from 'node:test';
import * as flatbuffers from 'flatbuffers';
import { FromRoom, Joined, Snapshot } from '../../../generated/messages/ts/overlook/wire.ts';
import { PROTOCOL } from '../../../generated/messages/ts/version.ts';
import { ELSEWHERE, RoomConnection, SHUT, type Snapshot as RoomSnapshot, rejoinWait } from './roomConnection.ts';

/** A room's message as its bytes: a welcome for `player`, or a snapshot at `tick`. */
function fromRoom(message: { readonly player: number } | { readonly tick: bigint }): ArrayBuffer {
  const builder = new flatbuffers.Builder(64);
  const part =
    'player' in message
      ? Joined.createJoined(builder, message.player, Joined.createDressedVector(builder, []), 0, 0, PROTOCOL, 0, 0)
      : Snapshot.createSnapshot(
          builder,
          message.tick,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0n,
          0,
          0,
          0,
          0,
          -1,
          0,
        );
  FromRoom.startFromRoom(builder);
  if ('player' in message) FromRoom.addJoined(builder, part);
  else FromRoom.addSnapshot(builder, part);
  builder.finish(FromRoom.endFromRoom(builder));
  return builder.asUint8Array().slice().buffer;
}

/** A stand-in for the browser's WebSocket that the test opens, welcomes and closes as a room or a network would. */
class FakeSocket extends EventTarget {
  readyState: number = WebSocket.CONNECTING;
  binaryType = 'blob';
  readonly sent: (Uint8Array | string)[] = [];

  send(bytes: Uint8Array | string): void {
    this.sent.push(bytes);
  }

  close(): void {
    this.closed(1000);
  }

  /** The socket opens, before the room has said anything. */
  opens(): void {
    this.readyState = WebSocket.OPEN;
    this.dispatchEvent(new Event('open'));
  }

  /** The room says something: its welcome to player `player`, or a snapshot at `tick`. */
  says(message: { readonly player: number } | { readonly tick: bigint }): void {
    this.readyState = WebSocket.OPEN;
    this.dispatchEvent(new MessageEvent('message', { data: fromRoom(message) }));
  }

  closed(code: number, reason = ''): void {
    if (this.readyState === WebSocket.CLOSED) return;
    this.readyState = WebSocket.CLOSED;
    this.dispatchEvent(Object.assign(new Event('close'), { code, reason }));
  }
}

/** A connection joined as player `player` over fake sockets, each socket it opens, and the snapshots it handed on;
 *  with `session`, the token it sends once welcomed. */
async function joined(player: number, session: string | null = null) {
  const sockets: FakeSocket[] = [];
  const ticks: bigint[] = [];
  const connect = () => {
    const socket = new FakeSocket();
    sockets.push(socket);
    return socket as unknown as WebSocket;
  };
  const opening = RoomConnection.open(
    'ws://test/room/court',
    (snapshot: RoomSnapshot) => ticks.push(snapshot.tick),
    undefined,
    session,
    connect,
  );
  sockets[0]?.says({ player });
  return { connection: await opening, sockets, ticks };
}

const waitMs = (tries: number) => rejoinWait(tries) * 1000;

test('a rejoin waits 1 s, then twice as long after each try that fails, 15 s at most', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 9].map(rejoinWait), [1, 2, 4, 8, 15, 15, 15]);
});

test('a socket a deploy closes is joined again after a second: a new player, welcomed and numbered anew', async (context: TestContext) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const { connection, sockets, ticks } = await joined(3);
  sockets[0]?.says({ tick: 10n });
  assert.deepEqual([connection.player, connection.joins, connection.rejoining, ticks], [3, 1, false, [10n]]);
  sockets[0]?.closed(1006);
  assert.deepEqual([connection.rejoining, connection.lost, connection.open], [true, null, false]);
  connection.send(new Uint8Array([1]));
  assert.equal(sockets[0]?.sent.length, 0, 'nothing is sent while the socket is closed');
  context.mock.timers.tick(waitMs(0) - 1);
  assert.equal(sockets.length, 1, 'no try before the wait is over');
  context.mock.timers.tick(1);
  assert.equal(sockets.length, 2);
  sockets[1]?.opens();
  connection.send(new Uint8Array([1]));
  assert.equal(sockets[1]?.sent.length, 0, 'an input numbered for the last join waits out the welcome');
  sockets[1]?.says({ player: 1 });
  sockets[1]?.says({ tick: 2n });
  assert.deepEqual([connection.player, connection.joins, connection.rejoining, ticks], [1, 2, false, [10n, 2n]]);
  connection.send(new Uint8Array([1]));
  assert.equal(sockets[1]?.sent.length, 1, 'the new socket carries the inputs');
});

test('tries that fail wait longer each time, and a welcome starts the waits over', async (context: TestContext) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const { connection, sockets } = await joined(3);
  sockets[0]?.closed(1006);
  for (let tries = 0; tries < 6; tries++) {
    context.mock.timers.tick(waitMs(tries) - 1);
    assert.equal(sockets.length, tries + 1, `still waiting before try ${tries + 1}`);
    context.mock.timers.tick(1);
    assert.equal(sockets.length, tries + 2, `try ${tries + 1} after ${rejoinWait(tries)} s`);
    if (tries < 5) sockets.at(-1)?.closed(1006);
  }
  assert.equal(connection.rejoining, true);
  sockets.at(-1)?.says({ player: 8 });
  assert.deepEqual([connection.player, connection.joins, connection.rejoining], [8, 2, false]);
  sockets.at(-1)?.closed(1001);
  context.mock.timers.tick(waitMs(0));
  assert.equal(sockets.length, 8, 'a second, not fifteen, after a link that held');
});

test('a room that sends the player away, or a page that leaves, is never joined again', async (context: TestContext) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const away = await joined(3);
  away.sockets[0]?.closed(1008, 'out of order');
  context.mock.timers.tick(waitMs(9));
  assert.deepEqual([away.sockets.length, away.connection.rejoining, away.connection.lost], [1, false, 'out of order']);
  const left = await joined(4);
  left.sockets[0]?.closed(1006);
  left.connection.close();
  context.mock.timers.tick(waitMs(9));
  assert.deepEqual([left.sockets.length, left.connection.lost], [1, null], 'the wait was let go');
});

test('a rejoin sends the session token again once welcomed, before any input', async (context: TestContext) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const { connection, sockets } = await joined(3, 'token');
  assert.deepEqual(sockets[0]?.sent, ['token']);
  sockets[0]?.closed(1006);
  context.mock.timers.tick(waitMs(0));
  sockets[1]?.opens();
  sockets[1]?.says({ player: 4 });
  connection.send(new Uint8Array([1]));
  assert.deepEqual(sockets[1]?.sent, ['token', new Uint8Array([1])]);
});

test('a room whose gate shuts is never joined again, and says why', async (context: TestContext) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const shut = await joined(5);
  shut.sockets[0]?.closed(SHUT, 'Abyss seas open at level 20.');
  context.mock.timers.tick(waitMs(9));
  assert.deepEqual(
    [shut.sockets.length, shut.connection.rejoining, shut.connection.shut, shut.connection.lost],
    [1, false, 'Abyss seas open at level 20.', 'Abyss seas open at level 20.'],
  );
});

test('a character taken by another tab or room is never joined again, and says so', async (context: TestContext) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const taken = await joined(6);
  taken.sockets[0]?.closed(ELSEWHERE, 'your character joined another room');
  context.mock.timers.tick(waitMs(9));
  assert.deepEqual(
    [taken.sockets.length, taken.connection.rejoining, taken.connection.lost, taken.connection.shut],
    [1, false, 'your character joined another room', null],
  );
});

test('a rejoin sending its own old socket away carries on', async (context: TestContext) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const { connection, sockets } = await joined(7);
  sockets[0]?.closed(1006);
  context.mock.timers.tick(waitMs(0));
  sockets[1]?.says({ player: 8 });
  // The room saw the old socket close only now, as the new one took the character from it.
  sockets[0]?.dispatchEvent(Object.assign(new Event('close'), { code: ELSEWHERE, reason: 'joined another room' }));
  context.mock.timers.tick(waitMs(9));
  assert.deepEqual(
    [sockets.length, connection.player, connection.rejoining, connection.lost, connection.open],
    [2, 8, false, null, true],
  );
});

test('a locked node’s room turns the player away saying why: a join fails with its words, and no rejoin is tried', async (context: TestContext) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const socket = new FakeSocket();
  const connect = () => socket as unknown as WebSocket;
  const opening = RoomConnection.open('ws://test/room/node-burned-mill', () => undefined, undefined, null, connect);
  socket.closed(4003, 'The Burned Mill is locked');
  await assert.rejects(opening, /closed: The Burned Mill is locked$/);
  const kept = await joined(3);
  kept.sockets[0]?.closed(1001);
  context.mock.timers.tick(waitMs(0));
  kept.sockets[1]?.closed(4003, 'The Burned Mill is locked');
  context.mock.timers.tick(waitMs(9));
  const { rejoining, lost } = kept.connection;
  assert.deepEqual([kept.sockets.length, rejoining, lost], [2, false, 'The Burned Mill is locked']);
});
