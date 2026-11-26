import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SERVERS, askHealth, serverWords } from './servers.ts';

test("the launcher asks the live rooms' and accounts' own health doors", () => {
  assert.deepEqual(
    SERVERS.map((server) => server.health),
    [
      'https://overlook-rooms.mackcothran.workers.dev/health',
      'https://overlook-accounts.mackcothran.workers.dev/v1/health',
    ],
  );
});

test('a server is timed on an open connection: the first ask opens it, and the second is timed', async () => {
  let now = 100;
  const clock = () => now;
  const asks: number[] = [];
  // The first answer pays for the connection; the second, on it, is the server's own time.
  const answering = async () => {
    asks.push(now);
    now += asks.length === 1 ? 300 : 42;
    return new Response('{"ok":true}');
  };
  assert.deepEqual(await askHealth('https://rooms/health', answering, clock), { state: 'up', ms: 42 });
  assert.equal(asks.length, 2);
});

test('a server that refuses, fails or says it is not well is not answering', async () => {
  const clock = () => 0;
  const unwell = async () => new Response('', { status: 503 });
  assert.deepEqual(await askHealth('https://rooms/health', unwell, clock), { state: 'down' });
  const gone = async () => Promise.reject(new TypeError('Failed to fetch'));
  assert.deepEqual(await askHealth('https://rooms/health', gone, clock), { state: 'down' });
});

test('a server is said in plain words', () => {
  assert.equal(serverWords({ state: 'checking' }), 'Checking');
  assert.equal(serverWords({ state: 'up', ms: 42 }), 'Online, 42 ms');
  assert.equal(serverWords({ state: 'down' }), 'Not answering');
});
