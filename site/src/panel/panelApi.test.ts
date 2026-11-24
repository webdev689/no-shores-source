import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BOT_ORIGIN,
  BOT_ORIGIN_KEY,
  LOCAL_BOT_ORIGIN,
  PENDING_OUT_KEY,
  SIGNING_KEY,
  SIGNING_TTL_MS,
  type StorageLike,
  TOKEN_KEY,
  createPanelApi,
} from './panelApi.ts';

/** A storage as a browser's, with what it holds open to the test. */
function memoryStorage(): StorageLike & { items: Map<string, string> } {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
    removeItem: (key) => void items.delete(key),
  };
}

/** A storage and a fetch for the API client: each path answers its status and body, and every call is kept. */
function apiWorld(answers: Record<string, [number, unknown]> = {}) {
  const store = memoryStorage();
  const asked: Array<{ url: string; init: RequestInit }> = [];
  const fetchFn = async (url: string, init: RequestInit): Promise<Response> => {
    asked.push({ url, init });
    const [status, body] = answers[new URL(url).pathname] ?? [404, { error: 'route' }];
    return new Response(JSON.stringify(body), { status });
  };
  const authOf = (index: number): string | undefined =>
    (asked.at(index)?.init.headers as Record<string, string> | undefined)?.authorization;
  return { store, asked, fetchFn, authOf };
}
const LONG_TOKEN = 'T'.repeat(43);

test('the ticket becomes a session kept for this tab alone, sent as a bearer header; a 401 forgets it', async () => {
  const world = apiWorld({
    '/v1/auth/exchange': [200, { token: LONG_TOKEN }],
    '/v1/panel/me': [401, { error: 'auth' }],
  });
  const tab = memoryStorage();
  const api = createPanelApi({ store: world.store, tab, fetchFn: world.fetchFn });
  assert.equal(api.signedIn(), false);
  api.beginSignIn();
  await api.exchange('ticket');
  assert.equal(tab.items.get(TOKEN_KEY), LONG_TOKEN);
  assert.equal(world.store.items.size, 0, "the storage the site's other pages share holds nothing of it");
  assert.equal(createPanelApi({ store: world.store, tab, fetchFn: world.fetchFn }).signedIn(), true, 'a reload');
  const otherTab = createPanelApi({ store: world.store, tab: memoryStorage(), fetchFn: world.fetchFn });
  assert.equal(otherTab.signedIn(), false, 'another tab signs in for itself');
  await api.call('GET', '/v1/panel/me');
  assert.equal(world.authOf(-1), `Bearer ${LONG_TOKEN}`);
  assert.equal(api.signedIn(), false);
  assert.equal(tab.items.has(TOKEN_KEY), false);
});

test('a ticket is traded only by the tab that began its sign-in, with no session sent, and a refusal lets go of nothing', async () => {
  const world = apiWorld({ '/v1/auth/exchange': [401, { error: 'ticket' }] });
  const tab = memoryStorage();
  let clock = 1_000_000;
  tab.items.set(TOKEN_KEY, 'S'.repeat(43));
  const api = createPanelApi({ store: world.store, tab, fetchFn: world.fetchFn, now: () => clock });
  // a link someone else sent: this tab began no sign-in, so its ticket is not traded and nothing is asked
  assert.equal((await api.exchange('their-ticket')).ok, false);
  assert.equal(world.asked.length, 0);
  assert.equal(tab.items.get(TOKEN_KEY), 'S'.repeat(43), 'and nobody is signed out by it');
  api.beginSignIn();
  await api.exchange('bad-ticket');
  assert.equal(world.authOf(0), undefined, 'the trade carries no session');
  assert.equal(tab.items.get(TOKEN_KEY), 'S'.repeat(43), 'a refusal keeps the session there was');
  assert.equal(tab.getItem(SIGNING_KEY), null, 'a begun sign-in is used once');
  api.beginSignIn();
  clock += SIGNING_TTL_MS + 1;
  assert.equal((await api.exchange('late-ticket')).ok, false, 'one begun long ago is not traded');
  assert.equal(world.asked.length, 1);
});

test('a 401 lets go only of the session it carried, and a sign-out the bot did not hear is told at the next load', async () => {
  let release = (): void => {};
  const tab = memoryStorage();
  const sent: string[] = [];
  const slowFetch = async (url: string, init: RequestInit): Promise<Response> => {
    const path = new URL(url).pathname;
    sent.push((init.headers as Record<string, string>).authorization ?? '');
    if (path === '/v1/panel/me') await new Promise<void>((resolve) => (release = resolve));
    if (path === '/v1/auth/exchange') return new Response(JSON.stringify({ token: 'B'.repeat(43) }), { status: 200 });
    return new Response(JSON.stringify({ error: 'auth' }), { status: 401 });
  };
  tab.items.set(TOKEN_KEY, 'A'.repeat(43));
  const api = createPanelApi({ store: null, tab, fetchFn: slowFetch });
  // a call carrying the old session is on its way while the person signs in again as someone else
  const refused = api.call('GET', '/v1/panel/me');
  api.beginSignIn();
  await api.exchange('ticket');
  release();
  await refused;
  assert.equal(api.signedIn(), true);
  assert.equal(tab.items.get(TOKEN_KEY), 'B'.repeat(43), 'the new session stays');
  const offline = async (): Promise<Response> => {
    throw new Error('offline');
  };
  const away = createPanelApi({ store: null, tab, fetchFn: offline });
  await away.signOut();
  assert.equal(tab.items.has(TOKEN_KEY), false, 'signed out here at once');
  assert.equal(tab.items.get(PENDING_OUT_KEY), 'B'.repeat(43), 'kept to tell the bot');
  const next = createPanelApi({ store: null, tab, fetchFn: slowFetch });
  await next.finishSignOut();
  assert.equal(sent.at(-1), `Bearer ${'B'.repeat(43)}`);
  assert.equal(tab.items.has(PENDING_OUT_KEY), false);
});

test("the bot's address is the Worker's unless the page is on this machine; an unreachable bot is an answer, not a throw", async () => {
  const world = apiWorld();
  assert.equal(BOT_ORIGIN, 'https://noshores-bot.mackcothran.workers.dev');
  world.store.setItem(BOT_ORIGIN_KEY, 'http://localhost:9000');
  assert.equal(
    createPanelApi({ store: world.store, fetchFn: world.fetchFn }).base,
    BOT_ORIGIN,
    'a live page ignores it',
  );
  assert.equal(
    createPanelApi({ store: world.store, fetchFn: world.fetchFn, local: true }).base,
    'http://localhost:9000',
  );
  world.store.setItem(BOT_ORIGIN_KEY, 'javascript:alert(1)');
  assert.equal(createPanelApi({ store: world.store, fetchFn: world.fetchFn, local: true }).base, LOCAL_BOT_ORIGIN);
  const offline = async (): Promise<Response> => {
    throw new Error('offline');
  };
  const api = createPanelApi({ store: world.store, fetchFn: offline });
  const answer = await api.call('GET', '/v1/panel/me');
  assert.deepEqual([answer.ok, answer.status, answer.ok ? '' : answer.body.error], [false, 0, 'offline']);
  assert.equal(api.signInUrl('/panel/'), `${BOT_ORIGIN}/v1/auth/discord?to=%2Fpanel%2F`);
});

test('a tab whose storage is refused or missing trades no ticket, and says the browser blocks what sign-in needs', async () => {
  const refuse = (): never => {
    throw new Error('denied');
  };
  const refusing: StorageLike = { getItem: refuse, setItem: refuse, removeItem: refuse };
  const readOnly: StorageLike = { getItem: () => null, setItem: refuse, removeItem: refuse };
  const world = apiWorld({ '/v1/auth/exchange': [200, { token: LONG_TOKEN }] });
  for (const tab of [refusing, readOnly, null]) {
    const api = createPanelApi({ store: world.store, tab, fetchFn: world.fetchFn });
    api.beginSignIn();
    const answer = await api.exchange('ticket');
    assert.deepEqual([answer.ok, answer.ok ? '' : answer.body.error], [false, 'storage']);
    assert.equal(api.signedIn(), false);
  }
  assert.equal(world.asked.length, 0, 'the ticket is never sent');
});

test('a file is sent as it is, with its own type; anything else as JSON', async () => {
  const world = apiWorld({ '/v1/panel/g/1/media': [200, { url: 'https://bot.example/a.png' }] });
  const api = createPanelApi({ store: world.store, tab: null, fetchFn: world.fetchFn });
  const file = new Blob(['png'], { type: 'image/png' });
  const answer = await api.call<{ url: string }>('POST', '/v1/panel/g/1/media', file);
  assert.equal(answer.ok && answer.body.url, 'https://bot.example/a.png');
  assert.equal(world.asked[0]?.init.body, file);
  assert.equal((world.asked[0]?.init.headers as Record<string, string>)['content-type'], 'image/png');
  await api.call('PUT', '/v1/panel/g/1/m/core', { rev: 1 });
  assert.equal(world.asked[1]?.init.body, '{"rev":1}');
});
