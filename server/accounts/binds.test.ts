import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
// The page's side of the binds against the Worker's rules on a real database.
import { KEEP_AFTER_MS, keepBinds } from '../../client/src/game/bindsKept.ts';
import { AccountLink, type Kept } from '../../client/src/network/accounts.ts';
import { DEFAULTS, rebind } from '../../client/src/player/binds.ts';
import { LiveBinds } from '../../client/src/player/input.ts';
import { handle } from './accounts.ts';
import { accounts } from './accountsForTests.ts';
import { BINDS_MOST } from './binds.ts';
import { sqliteForTests } from './sqliteForTests.ts';

test("a player's binds are kept with their account alone, and only binds the game knows are kept", async () => {
  const { ask } = accounts();
  assert.equal((await ask('GET', '/v1/binds')).status, 401, 'signed in only');
  const token = (await ask('POST', '/v1/guest')).body['token'] as string;
  assert.deepEqual((await ask('GET', '/v1/binds', undefined, token)).body, { binds: null }, 'none kept yet');
  const binds = { jump: { keys: ['c'], pad: ['B'] }, crouch: { keys: [' '] }, dodge: { pad: ['A'] } };
  assert.equal((await ask('PUT', '/v1/binds', { binds }, token)).status, 200);
  assert.deepEqual((await ask('GET', '/v1/binds', undefined, token)).body, { binds });
  const other = (await ask('POST', '/v1/guest')).body['token'] as string;
  assert.deepEqual((await ask('GET', '/v1/binds', undefined, other)).body, { binds: null }, "another's are their own");
  for (const refused of [
    { fly: { keys: ['w'] } },
    { jump: { keys: ['escape'] } },
    { jump: { pad: ['Q'] } },
    { jump: { keys: ['a', 'b', 'c', 'd'] } },
    'jump',
  ])
    assert.equal((await ask('PUT', '/v1/binds', { binds: refused }, token)).status, 400, JSON.stringify(refused));
  const huge = { binds: { jump: { keys: ['a'] } }, padding: 'x'.repeat(BINDS_MOST) };
  assert.equal((await ask('PUT', '/v1/binds', huge, token)).status, 400, 'past its size');
  assert.deepEqual((await ask('GET', '/v1/binds', undefined, token)).body, { binds }, 'what was kept stands');
});

test('the page reads the binds kept once signed in, keeps each change after a quiet, and plays on without the accounts', async () => {
  Object.assign(globalThis, { addEventListener: () => undefined });
  mock.timers.enable({ apis: ['setTimeout'] });
  const database = sqliteForTests();
  const kept = new Map<string, string>();
  const storage: Kept = {
    getItem: (key) => kept.get(key) ?? null,
    setItem: (key, value) => void kept.set(key, value),
    removeItem: (key) => void kept.delete(key),
  };
  const ask: typeof fetch = (input, init) =>
    handle(new Request(input, init), { database, now: () => 1, discord: null, pages: [] });
  const page = new LiveBinds();
  await keepBinds(new AccountLink('https://accounts.test/', storage, ask), page);
  assert.equal(page.now, DEFAULTS, 'none kept: the defaults');
  const swapped = rebind(DEFAULTS, { id: 'jump', device: 'keys', place: 0 }, 'c').binds ?? DEFAULTS;
  page.set(swapped);
  mock.timers.tick(KEEP_AFTER_MS);
  // The save goes as the quiet ends; it is answered a few turns of the event loop on.
  const until = performance.now() + 5000;
  while (!(await database.prepare('SELECT body FROM binds').first()) && performance.now() < until)
    await new Promise((resolve) => setImmediate(resolve));

  const another = new LiveBinds();
  await keepBinds(new AccountLink('https://accounts.test/', storage, ask), another);
  assert.deepEqual(another.now, swapped, 'the same account in another browser');

  const away: typeof fetch = () => Promise.reject(new Error('offline'));
  const offline = new LiveBinds();
  await keepBinds(new AccountLink('https://accounts.test/', { ...storage, getItem: () => null }, away), offline);
  assert.equal(offline.now, DEFAULTS, 'the accounts out of reach: the defaults');
  mock.timers.reset();
  delete (globalThis as Record<string, unknown>)['addEventListener'];
});
