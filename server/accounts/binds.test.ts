import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
// The page's side of the binds against the Worker's rules on a real database.
import { KEEP_AFTER_MS, keepBinds } from '../../client/src/game/bindsKept.ts';
import { AccountLink, type Kept } from '../../client/src/network/accounts.ts';
import { BIND_IDS, DEFAULTS, rebind } from '../../client/src/player/binds.ts';
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
  for (const refused of ['jump', ['jump'], null])
    assert.equal((await ask('PUT', '/v1/binds', { binds: refused }, token)).status, 400, JSON.stringify(refused));
  const huge = { binds: { jump: { keys: ['a'] } }, padding: 'x'.repeat(BINDS_MOST) };
  assert.equal((await ask('PUT', '/v1/binds', huge, token)).status, 400, 'past its size');
  assert.deepEqual((await ask('GET', '/v1/binds', undefined, token)).body, { binds }, 'what was kept stands');
});

test('a page of another build keeps what this one knows of its binds, and the rest is left out', async () => {
  const { ask } = accounts();
  const token = (await ask('POST', '/v1/guest')).body['token'] as string;
  const binds = {
    fly: { keys: ['w'] },
    jump: { keys: ['escape'], pad: ['B'] },
    dodge: { pad: ['Q'] },
    crouch: { keys: ['a', 'b', 'c', 'd'] },
    use: { keys: ['mouse0'] },
    heal: { keys: ['mouse5'] },
    ready: { keys: ['h'] },
  };
  assert.equal((await ask('PUT', '/v1/binds', { binds }, token)).status, 200);
  const kept = { jump: { pad: ['B'] }, ready: { keys: ['h'] } };
  assert.deepEqual((await ask('GET', '/v1/binds', undefined, token)).body, { binds: kept });
});

test('every control bound anew to the longest names fits the body with room to spare', async () => {
  const { ask } = accounts();
  const token = (await ask('POST', '/v1/guest')).body['token'] as string;
  const full = (id: string) => ({
    keys: ['pagedown', 'arrowright', 'capslock'],
    pad: id === 'forward' ? ['LS up', 'Start hold', 'View hold'] : ['Start hold', 'View hold', 'Right+Start'],
  });
  const binds = Object.fromEntries(BIND_IDS.map((id) => [id, full(id)]));
  const body = JSON.stringify({ binds });
  assert.ok(body.length < BINDS_MOST * 0.75, `${body.length} of ${BINDS_MOST}`);
  assert.equal((await ask('PUT', '/v1/binds', JSON.parse(body), token)).status, 200);
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
