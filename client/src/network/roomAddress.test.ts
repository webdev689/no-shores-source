import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fleetAddress, LIVE_ROOMS, roomAddress } from './roomAddress.ts';

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
  assert.equal(roomAddress('a'.repeat(65)), null);
  const longest = 'node-thunderhoof-grasslands--abyss--dungeon-2';
  assert.equal(roomAddress(longest), `${LIVE_ROOMS}/room/${longest}`, 'a dungeon’s room, past 40 characters');
  assert.equal(roomAddress('a'.repeat(64)), `${LIVE_ROOMS}/room/${'a'.repeat(64)}`);
  assert.equal(roomAddress('https://example.com/room/x'), null);
});

test('the editor’s fleet is its name on the deployed rooms, a local server’s own fleet, or a whole address', () => {
  assert.equal(fleetAddress(null), null);
  assert.equal(fleetAddress('Trial'), `${LIVE_ROOMS}/room/fleet-trial`);
  assert.equal(fleetAddress('ws://127.0.0.1:8787'), 'ws://127.0.0.1:8787/room/fleet-editor');
  assert.equal(fleetAddress('ws://127.0.0.1:8787/'), 'ws://127.0.0.1:8787/room/fleet-editor');
  assert.equal(fleetAddress('ws://127.0.0.1:8787/room/fleet-two'), 'ws://127.0.0.1:8787/room/fleet-two');
  assert.equal(fleetAddress('a'.repeat(59)), null, 'too long a name for its room');
  assert.equal(fleetAddress('two words'), null);
});
