import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { afterEach, test } from 'node:test';
import { startRoomDoor } from '../../../server/roomDoor.ts';
import { type FleetRules, startFleetRules } from '../rules/fleetRules.ts';
import { FleetBerth } from './fleetBerth.ts';
import type { FleetSession } from './fleetSession.ts';

const compiled = new WebAssembly.Module(
  await readFile(new URL('../../../target/wasm32-unknown-unknown/release/room_wasm.wasm', import.meta.url)).catch(
    () => {
      throw new Error('room_wasm.wasm is not built: run `npm run wasm` first');
    },
  ),
);

type Listener = (event: { readonly data?: unknown; readonly reason?: string }) => void;

/** A socket to a fleet room in the test: the room's door welcomes it a moment after it opens. */
class FakeSocket {
  static readonly OPEN = 1;
  static readonly made: FakeSocket[] = [];
  static readonly door = (() => {
    const door = startRoomDoor(compiled);
    door.openFleet();
    return door;
  })();
  readonly url: string;
  binaryType = '';
  readyState = FakeSocket.OPEN;
  closed = false;
  private readonly listeners = new Map<string, Listener[]>();

  constructor(url: string) {
    this.url = url;
    FakeSocket.made.push(this);
    const welcome = new Uint8Array(FakeSocket.door.joined(FakeSocket.door.join())).buffer;
    setTimeout(() => this.emit('message', { data: welcome }), 1);
  }

  addEventListener(kind: string, listener: Listener): void {
    this.listeners.set(kind, [...(this.listeners.get(kind) ?? []), listener]);
  }

  send(): void {}

  close(): void {
    if (this.closed) return;
    [this.closed, this.readyState] = [true, 3];
    this.emit('close', { reason: '' });
  }

  private emit(kind: string, event: Parameters<Listener>[0]): void {
    for (const listener of this.listeners.get(kind) ?? []) listener(event);
  }
}

const realSocket = globalThis.WebSocket;
(globalThis as { WebSocket: unknown }).WebSocket = FakeSocket;
afterEach(() => {
  FakeSocket.made.length = 0;
});
process.on('exit', () => {
  (globalThis as { WebSocket: unknown }).WebSocket = realSocket;
});

const settled = () => new Promise((resolve) => setTimeout(resolve, 20));
const START = [200_000, 300_000, 0] as const;

test('a join whose rules fail closes its socket, and the next join asks for the rules again', async () => {
  let asked = 0;
  const load = (): Promise<FleetRules> => {
    asked++;
    return asked === 1
      ? Promise.reject(new Error('room.wasm would not load'))
      : Promise.resolve(startFleetRules(compiled));
  };
  const berth = FleetBerth.fromPage('?room=qa', load);
  assert.ok(berth);
  const failures: unknown[] = [];
  const sessions: FleetSession[] = [];
  berth.join(
    START,
    (session) => sessions.push(session),
    (error) => failures.push(error),
  );
  await settled();
  assert.equal(failures.length, 1, 'the first join fails');
  assert.equal(FakeSocket.made[0]?.closed, true, 'its socket, which opened, is closed: it held a place in the room');
  berth.join(
    START,
    (session) => sessions.push(session),
    (error) => failures.push(error),
  );
  await settled();
  assert.equal(asked, 2, 'the rules are asked for again');
  assert.equal(sessions.length, 1, 'and the second join sails');
  assert.equal(FakeSocket.made[1]?.closed, false);
  berth.leave();
  assert.equal(FakeSocket.made[1]?.closed, true, 'brought in, it leaves');
});

test('a join let go before the room answers is dropped, its socket closed', async () => {
  const berth = FleetBerth.fromPage('?room=qa', () => Promise.resolve(startFleetRules(compiled)));
  assert.ok(berth);
  const answered: string[] = [];
  berth.join(
    START,
    () => answered.push('joined'),
    () => answered.push('failed'),
  );
  berth.leave();
  await settled();
  assert.equal(answered.length, 0, 'neither joined nor failed: it moved on');
  assert.equal(FakeSocket.made[0]?.closed, true);
  berth.join(
    START,
    () => answered.push('joined'),
    () => answered.push('failed'),
  );
  await settled();
  assert.deepEqual(answered, ['joined'], 'a join after it sails');
});
