import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LIVE_ACCOUNTS } from '../network/accounts.ts';
import { LIVE_ROOMS } from '../network/roomAddress.ts';
import { accountsFrom, nodeOfRoom, nodeRoom, roomsFrom, seaRoomName } from './rooms.ts';

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
  assert.equal(nodeRoom({ id: 'saltgrass-downs', kind: 'patrol' }, 'normal'), 'node-saltgrass-downs');
  assert.equal(nodeRoom({ id: 'saltgrass-downs', kind: 'patrol' }, 'elite'), 'node-saltgrass-downs--elite');
  assert.equal(nodeRoom({ id: 'saltgrass-downs', kind: 'patrol' }, 'abyss'), 'node-saltgrass-downs--abyss');
  assert.equal(nodeRoom({ id: 'overlook-social', kind: 'social' }, 'abyss'), 'node-overlook-social');
});

test('a node’s room name reads back as its node and difficulty, the old names as the new tiers', () => {
  for (const seas of ['normal', 'elite', 'abyss'] as const) {
    const room = nodeRoom({ id: 'saltgrass-downs', kind: 'patrol' }, seas);
    assert.deepEqual(nodeOfRoom(room), { id: 'saltgrass-downs', seas });
  }
  // A place the accounts kept under the other names (a presence or a held character) still reads.
  assert.deepEqual(nodeOfRoom('node-saltgrass-downs--rough'), { id: 'saltgrass-downs', seas: 'elite' });
  assert.deepEqual(nodeOfRoom('node-saltgrass-downs--storm'), { id: 'saltgrass-downs', seas: 'abyss' });
  assert.equal(nodeOfRoom('sea'), null);
});

test('a voyage sails in its difficulty’s sea room', () => {
  assert.deepEqual(
    (['normal', 'elite', 'abyss'] as const).map(seaRoomName),
    ['sea', 'sea--elite', 'sea--abyss'],
  );
});
