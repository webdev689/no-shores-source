import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LIVE_ACCOUNTS } from '../network/accounts.ts';
import { LIVE_ROOMS } from '../network/roomAddress.ts';
import { accountsFrom, dungeonRoom, nodeOfRoom, nodeRoom, roomsFrom } from './rooms.ts';

test('without ?room= the game plays offline', () => {
  assert.equal(roomsFrom(null), null);
});

test('a whole address names the server, with or without a room after it', () => {
  assert.equal(roomsFrom('ws://127.0.0.1:8787')?.('sea'), 'ws://127.0.0.1:8787/room/sea');
  assert.equal(roomsFrom('ws://127.0.0.1:8787/')?.('sea'), 'ws://127.0.0.1:8787/room/sea');
  assert.equal(
    roomsFrom('ws://127.0.0.1:8787/room/playtest')?.('node-tidewall'),
    'ws://127.0.0.1:8787/room/node-tidewall',
  );
});

test('anything else plays on the deployed rooms', () => {
  assert.equal(roomsFrom('live')?.('node-overlook-social'), `${LIVE_ROOMS}/room/node-overlook-social`);
});

test('the deployed rooms keep characters on the deployed accounts; a local server only on accounts named', () => {
  assert.equal(accountsFrom('live', null), LIVE_ACCOUNTS);
  assert.equal(accountsFrom(null, null), null);
  assert.equal(accountsFrom('ws://127.0.0.1:8787', null), null);
  assert.equal(accountsFrom('ws://127.0.0.1:8787', 'http://127.0.0.1:8788'), 'http://127.0.0.1:8788');
  assert.equal(accountsFrom('live', 'elsewhere'), LIVE_ACCOUNTS, 'only a whole address names other accounts');
  // A crafted link sends the session nowhere but the deployed accounts and rooms, or this machine's own.
  assert.equal(accountsFrom('live', 'https://evil.example'), LIVE_ACCOUNTS, 'accounts elsewhere are never named');
  assert.equal(accountsFrom('wss://evil.example', null), null, "another's room gets no session");
  assert.equal(accountsFrom('wss://evil.example', 'http://127.0.0.1:8788'), null);
  assert.equal(accountsFrom('ws://localhost:8787', 'http://localhost:8788/'), 'http://localhost:8788/');
});

test('a harder voyage to a patrol is a room of its own; a social space is one for all', () => {
  assert.equal(nodeRoom({ id: 'saltgrass-downs', kind: 'patrol' }, 'calm'), 'node-saltgrass-downs');
  assert.equal(nodeRoom({ id: 'saltgrass-downs', kind: 'patrol' }, 'storm'), 'node-saltgrass-downs--storm');
  assert.equal(nodeRoom({ id: 'overlook-social', kind: 'social' }, 'storm'), 'node-overlook-social');
});

test("a patrol's dungeon has one room at each sea, named for its patrol and its number", () => {
  const patrol = { id: 'saltgrass-downs' };
  assert.equal(dungeonRoom(patrol, 'calm', 0), 'node-saltgrass-downs--dungeon-0');
  assert.equal(dungeonRoom(patrol, 'rough', 2), 'node-saltgrass-downs--rough--dungeon-2');
  assert.equal(dungeonRoom(patrol, 'storm', 1), 'node-saltgrass-downs--storm--dungeon-1');
});

test("a room's name reads back as its node, its seas and its dungeon; a dungeon only after `--`", () => {
  assert.deepEqual(nodeOfRoom('node-saltgrass-downs'), { id: 'saltgrass-downs', seas: 'calm', dungeon: null });
  assert.deepEqual(nodeOfRoom('node-saltgrass-downs--storm--dungeon-2'), {
    id: 'saltgrass-downs',
    seas: 'storm',
    dungeon: 2,
  });
  assert.deepEqual(nodeOfRoom('node-dungeon-0'), { id: 'dungeon-0', seas: 'calm', dungeon: null });
  assert.equal(nodeOfRoom('sea'), null);
});
