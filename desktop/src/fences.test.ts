import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LIVE_ACCOUNTS } from '../../client/src/network/accounts.ts';
import { ACCOUNTS_ORIGIN, gamePlace, isGamePage, opensInBrowser, permits, staysInWindow } from './fences.ts';
import { LIVE_GAME } from './gameAddress.ts';

const game = gamePlace(LIVE_GAME);

test('the accounts the shell lets a sign-in through are the ones the game signs in with', () => {
  assert.equal(ACCOUNTS_ORIGIN, LIVE_ACCOUNTS);
});

test("the game's pages are those under its path at its origin", () => {
  assert.equal(isGamePage('https://noshores.online/play/', game), true);
  assert.equal(isGamePage('https://noshores.online/play', game), true);
  assert.equal(isGamePage('https://noshores.online/play/?at=overlook#code=1', game), true);
  assert.equal(isGamePage('https://noshores.online/player', game), false);
  assert.equal(isGamePage('https://noshores.online/', game), false);
  assert.equal(isGamePage('http://noshores.online/play/', game), false);
  assert.equal(isGamePage('https://noshores.online.example/play/', game), false);
});

test("a dev server's game is every page at its origin", () => {
  const dev = gamePlace('http://localhost:5173/');
  assert.equal(isGamePage('http://localhost:5173/?spawn=', dev), true);
  assert.equal(isGamePage('http://localhost:5174/', dev), false);
});

test('a Discord sign-in passes through the window, by the accounts and Discord, and nothing else does', () => {
  assert.equal(staysInWindow(`${ACCOUNTS_ORIGIN}/v1/discord/start?back=x&nonce=y`, game), true);
  assert.equal(staysInWindow(`${ACCOUNTS_ORIGIN}/v1/discord/callback?code=1&state=2`, game), true);
  assert.equal(staysInWindow('https://discord.com/oauth2/authorize?client_id=1', game), true);
  assert.equal(staysInWindow('https://discord.com/login', game), true);
  assert.equal(staysInWindow(`${ACCOUNTS_ORIGIN}/v1/session`, game), false);
  assert.equal(staysInWindow('https://noshores.online/', game), false);
  assert.equal(staysInWindow('https://evil.discord.com.example/', game), false);
  assert.equal(staysInWindow('not an address', game), false);
});

test("only a web address goes to the player's browser", () => {
  assert.equal(opensInBrowser('https://noshores.online/'), true);
  assert.equal(opensInBrowser('http://example.com/a'), true);
  assert.equal(opensInBrowser('file:///etc/passwd'), false);
  assert.equal(opensInBrowser('javascript:alert(1)'), false);
  assert.equal(opensInBrowser('ms-settings:privacy'), false);
  assert.equal(opensInBrowser('https://user@example.com/'), false);
});

test('the game may hold the pointer and the screen; nothing else is granted, and nothing to another page', () => {
  assert.equal(permits('pointerLock', 'https://noshores.online/play/', game), true);
  assert.equal(permits('fullscreen', 'https://noshores.online', game), true);
  assert.equal(permits('media', 'https://noshores.online/play/', game), false);
  assert.equal(permits('notifications', 'https://noshores.online/play/', game), false);
  assert.equal(permits('pointerLock', 'https://discord.com/', game), false);
  assert.equal(permits('pointerLock', '', game), false);
});
