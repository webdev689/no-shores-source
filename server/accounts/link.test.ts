import assert from 'node:assert/strict';
import { test } from 'node:test';
// The browser's own side of the accounts, against the Worker's rules on a real database.
import { AccountLink, type Kept, LIVE_ACCOUNTS } from '../../client/src/network/accounts.ts';
import { handle } from './accounts.ts';
import { sqliteForTests } from './sqliteForTests.ts';

function browser(clock = { now: 7_000_000 }) {
  const database = sqliteForTests();
  const kept = new Map<string, string>();
  const storage: Kept = {
    getItem: (key) => kept.get(key) ?? null,
    setItem: (key, value) => void kept.set(key, value),
    removeItem: (key) => void kept.delete(key),
  };
  const ask: typeof fetch = (input, init) =>
    handle(new Request(input, init), { database, now: () => clock.now, discord: null, pages: ['https://page.test'] });
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
  storage.setItem('overlook.session@https://accounts.test', 'f'.repeat(64));
  assert.equal((await link.session())?.guest, true, 'a session gone is a new guest');
});

test('a page takes back only a code from Discord, never a session, and asks Discord with its ticket and nonce', async () => {
  const { link, storage } = browser();
  assert.equal(link.takeFrom('#discord=failed'), 'failed');
  assert.equal(link.said, 'Discord sign-in did not finish.');
  assert.equal(link.takeFrom('#nothing'), null);
  assert.equal(link.takeFrom(`#session=${'a'.repeat(64)}`), null, 'a session in the address is never taken');
  assert.equal(link.token, null);
  await link.session();
  const held = link.token;
  const to = new URL(await link.discord('https://page.test/game/'));
  assert.equal(to.pathname, '/v1/discord/start');
  assert.equal(to.searchParams.get('back'), 'https://page.test/game/');
  assert.match(to.searchParams.get('ticket') ?? '', /^[0-9a-f]{64}$/);
  assert.equal(to.searchParams.get('nonce'), storage.getItem('overlook.discord'), 'the tab keeps its nonce');
  assert.equal(link.takeFrom(`#discord=done&code=${'d'.repeat(64)}`), 'came back');
  await link.session();
  assert.equal(link.said, 'This sign-in has run out. Start it again from the game.', 'an unknown code takes nothing');
  assert.equal(link.token, held, 'and the session held stays');
});

test("the deployed accounts' session is kept apart from any other accounts'", () => {
  const { storage } = browser();
  const live = new AccountLink(LIVE_ACCOUNTS, storage);
  storage.setItem('overlook.session', 'e'.repeat(64));
  const local = new AccountLink('http://127.0.0.1:8788', storage);
  assert.equal(live.token, 'e'.repeat(64));
  assert.equal(local.token, null, "a dev server's accounts never see the live token");
});

test('accounts that cannot be reached leave the player signed out', async () => {
  const link = new AccountLink('https://accounts.test', { getItem: () => null, setItem() {}, removeItem() {} }, () =>
    Promise.reject(new TypeError('offline')),
  );
  assert.equal(await link.session(), null);
  assert.equal(await link.login('someone', 'long enough'), 'The accounts could not be reached.');
});

test('a page told its sign-in lapsed says so and plays on as a guest; one may sign out everywhere', async () => {
  const clock = { now: 7_000_000 };
  const { link } = browser(clock);
  await link.session();
  assert.equal(await link.logoutEverywhere(), 'A guest has no way back in. Add a username or Discord first.');
  assert.ok(link.token, 'and the guest is kept');
  await link.register('Wayfarer', 'long enough');
  clock.now += 31 * 24 * 60 * 60_000;
  const after = await link.session();
  assert.equal(after?.guest, true);
  assert.equal(link.said, 'Your sign-in lapsed after 30 days away. Sign in again.');
  const back = await link.login('wayfarer', 'long enough');
  assert.equal(typeof back === 'string' ? back : back.username, 'Wayfarer');
  assert.equal(await link.logoutEverywhere(), null);
  assert.equal(link.token, null, 'signed out here too');
});

test('a session asked for twice at once makes one guest, kept by both', async () => {
  const { link } = browser();
  const [first, second] = await Promise.all([link.session(), link.session()]);
  assert.ok(first?.guest);
  assert.equal(second?.id, first.id);
  assert.equal((await link.session())?.id, first.id, 'and the next visit is the same guest');
});

test('Find a Company is reached by WebSocket at the accounts the page keeps its session with', () => {
  assert.equal(browser().link.finderAt('node-krakens-grotto'), 'wss://accounts.test/v1/find/node-krakens-grotto');
  const local = new AccountLink('http://127.0.0.1:8788', browser().storage);
  assert.equal(local.finderAt('node-x--elite'), 'ws://127.0.0.1:8788/v1/find/node-x--elite');
});
