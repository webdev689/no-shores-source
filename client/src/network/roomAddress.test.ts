import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LIVE_ROOMS, roomAddress } from './roomAddress.ts';

test('a room’s name alone is that room on the deployed rooms, whatever its case', () => {
  assert.equal(roomAddress('playtest'), `${LIVE_ROOMS}/room/playtest`);
  assert.equal(roomAddress('Sea-Trial-2'), `${LIVE_ROOMS}/room/sea-trial-2`);
});

test('a whole address is kept as it is, so a room can be local', () => {
  assert.equal(roomAddress('ws://127.0.0.1:8787/room/test'), 'ws://127.0.0.1:8787/room/test');
});

test('what is neither a name nor an address is no room', () => {
  assert.equal(roomAddress(''), null);
  assert.equal(roomAddress('play test'), null);
  assert.equal(roomAddress('a'.repeat(41)), null);
  assert.equal(roomAddress('https://example.com/room/x'), null);
});
