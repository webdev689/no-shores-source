import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LIVE_GAME, gameAddress } from './gameAddress.ts';

test('the app plays the live game unless told otherwise', () => {
  assert.equal(gameAddress(undefined, true), LIVE_GAME);
  assert.equal(gameAddress('', false), LIVE_GAME);
});

test('run from the source, it plays any web address it is pointed at', () => {
  assert.equal(gameAddress('http://localhost:5173/', false), 'http://localhost:5173/');
  assert.equal(
    gameAddress('https://lattymoy.github.io/no-shores-source/', false),
    'https://lattymoy.github.io/no-shores-source/',
  );
});

test("an installed copy plays only this machine's own addresses beside the live game", () => {
  assert.equal(gameAddress('http://127.0.0.1:4173/', true), 'http://127.0.0.1:4173/');
  assert.equal(gameAddress('http://[::1]:4173/', true), 'http://[::1]:4173/');
  assert.equal(gameAddress('https://evil.example/play/', true), LIVE_GAME);
  assert.equal(gameAddress('http://localhost.evil.example/', true), LIVE_GAME);
});

test('an address that is not a web one is never played', () => {
  assert.equal(gameAddress('file:///home/me/dist/index.html', false), LIVE_GAME);
  assert.equal(gameAddress('not an address', false), LIVE_GAME);
});

test('the live game is played online, on the rooms and accounts the game names live', async () => {
  const { roomsFrom, accountsFrom } = await import('../../client/src/game/rooms.ts');
  const room = new URL(LIVE_GAME).searchParams.get('room');
  assert.notEqual(roomsFrom(room), null);
  assert.notEqual(accountsFrom(room, null), null);
});
