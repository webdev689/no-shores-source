import assert from 'node:assert/strict';
import { test } from 'node:test';
// The browser's own side of the accounts, against the Worker's rules on a real database.
import { AccountLink, type Kept } from '../../client/src/network/accounts.ts';
import { handle } from './accounts.ts';
import { sqliteForTests } from './sqliteForTests.ts';

function browser() {
  const database = sqliteForTests();
  const kept = new Map<string, string>();
  const storage: Kept = {
    getItem: (key) => kept.get(key) ?? null,
    setItem: (key, value) => void kept.set(key, value),
    removeItem: (key) => void kept.delete(key),
  };
  const ask: typeof fetch = (input, init) =>
    handle(new Request(input, init), { database, now: () => 7_000_000, discord: null, pages: ['https://page.test'] });
  return { storage, link: new AccountLink('https://accounts.test/', storage, ask) };
}

test('a page makes its player a guest once, keeps the session, and signs in and out with a username', async () => {
  const { link, storage } = browser();
  const guest = await link.session();
  assert.ok(guest?.guest);
  const token = link.token;
  assert.ok(token);
  assert.deepEqual(await link.session(), guest, 'the same guest on the next visit');
  assert.equal(
    await link.register('ab', 'long enough'),
    'A username is 3 to 20 letters, digits or underscores, starting with a letter.',
  );
  const named = await link.register('Wayfarer', 'long enough');
  assert.equal(typeof named === 'string' ? named : named.username, 'Wayfarer');
  await link.logout();
  assert.equal(link.token, null);
  const other = await link.session();
  assert.notEqual(other?.id, guest.id, 'signed out, a new guest');
  const back = await link.login('wayfarer', 'long enough');
  assert.equal(typeof back === 'string' ? back : back.id, guest.id);
  assert.notEqual(link.token, token, 'a new session');
  storage.setItem('overlook.session', 'f'.repeat(64));
  assert.equal((await link.session())?.guest, true, 'a session gone is a new guest');
});

test('a page takes back what Discord sent, and asks Discord with its ticket', async () => {
  const { link } = browser();
  assert.equal(link.takeFrom('#discord=linked'), 'linked');
  assert.equal(link.takeFrom('#nothing'), null);
  assert.equal(link.takeFrom(`#session=${'a'.repeat(64)}`), 'signed in');
  assert.equal(link.token, 'a'.repeat(64));
  await link.session();
  const to = new URL(await link.discord('https://page.test/game/'));
  assert.equal(to.pathname, '/v1/discord/start');
  assert.equal(to.searchParams.get('back'), 'https://page.test/game/');
  assert.match(to.searchParams.get('ticket') ?? '', /^[0-9a-f]{64}$/);
});

test('accounts that cannot be reached leave the player signed out', async () => {
  const link = new AccountLink('https://accounts.test', { getItem: () => null, setItem() {}, removeItem() {} }, () =>
    Promise.reject(new TypeError('offline')),
  );
  assert.equal(await link.session(), null);
  assert.equal(await link.login('someone', 'long enough'), 'The accounts could not be reached.');
});
