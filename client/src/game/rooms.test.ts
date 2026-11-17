import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LIVE_ACCOUNTS } from '../network/accounts.ts';
import { LIVE_ROOMS } from '../network/roomAddress.ts';
import { accountsFrom, roomsFrom } from './rooms.ts';

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
});
