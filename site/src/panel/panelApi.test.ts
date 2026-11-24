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

test('the ticket becomes a stored session sent as a bearer header; a 401 forgets it', async () => {
  const world = apiWorld({
    '/v1/auth/exchange': [200, { token: LONG_TOKEN }],
    '/v1/panel/me': [401, { error: 'auth' }],
  });
  const api = createPanelApi({ store: world.store, tab: null, fetchFn: world.fetchFn });
  assert.equal(api.signedIn(), false);
  await api.exchange('ticket');
  assert.equal(world.store.items.get(TOKEN_KEY), LONG_TOKEN);
  await api.call('GET', '/v1/panel/me');
  assert.equal(world.authOf(-1), `Bearer ${LONG_TOKEN}`);
  assert.equal(api.signedIn(), false);
  assert.equal(world.store.items.has(TOKEN_KEY), false);
});

test('a ticket is traded only by the tab that began its sign-in, with no session sent, and a refusal lets go of nothing', async () => {
  const world = apiWorld({ '/v1/auth/exchange': [401, { error: 'ticket' }] });
  const tab = memoryStorage();
  let clock = 1_000_000;
  world.store.items.set(TOKEN_KEY, 'S'.repeat(43));
  const api = createPanelApi({ store: world.store, tab, fetchFn: world.fetchFn, now: () => clock });
  // a link someone else sent: this tab began no sign-in, so its ticket is not traded and nothing is asked
  assert.equal((await api.exchange('their-ticket')).ok, false);
  assert.equal(world.asked.length, 0);
  assert.equal(world.store.items.get(TOKEN_KEY), 'S'.repeat(43), 'and nobody is signed out by it');
  api.beginSignIn();
  await api.exchange('bad-ticket');
  assert.equal(world.authOf(0), undefined, 'the trade carries no session');
  assert.equal(world.store.items.get(TOKEN_KEY), 'S'.repeat(43), 'a refusal keeps the session there was');
  assert.equal(tab.getItem(SIGNING_KEY), null, 'a begun sign-in is used once');
  api.beginSignIn();
  clock += SIGNING_TTL_MS + 1;
  assert.equal((await api.exchange('late-ticket')).ok, false, 'one begun long ago is not traded');
  assert.equal(world.asked.length, 1);
});

test('a 401 lets go only of the session it carried, and a sign-out the bot did not hear is told at the next load', async () => {
  const world = apiWorld({ '/v1/panel/me': [401, { error: 'auth' }], '/v1/auth/logout': [200, { ok: true }] });
  world.store.items.set(TOKEN_KEY, 'A'.repeat(43));
  const api = createPanelApi({ store: world.store, tab: null, fetchFn: world.fetchFn });
  // another tab signs in as someone else while this tab's old session is refused
  world.store.items.set(TOKEN_KEY, 'B'.repeat(43));
  await api.call('GET', '/v1/panel/me');
  assert.equal(api.signedIn(), false);
  assert.equal(world.store.items.get(TOKEN_KEY), 'B'.repeat(43), "the other tab's session stays");
  const offline = async (): Promise<Response> => {
    throw new Error('offline');
  };
  const away = createPanelApi({ store: world.store, tab: null, fetchFn: offline });
  await away.signOut();
  assert.equal(world.store.items.has(TOKEN_KEY), false, 'signed out here at once');
  assert.equal(world.store.items.get(PENDING_OUT_KEY), 'B'.repeat(43), 'kept to tell the bot');
  const next = createPanelApi({ store: world.store, tab: null, fetchFn: world.fetchFn });
  await next.finishSignOut();
  assert.equal(world.authOf(-1), `Bearer ${'B'.repeat(43)}`);
  assert.equal(world.store.items.has(PENDING_OUT_KEY), false);
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

test('a browser that refuses storage still signs in for the page', async () => {
  const refuse = (): never => {
    throw new Error('denied');
  };
  const refusing: StorageLike = { getItem: refuse, setItem: refuse, removeItem: refuse };
  const world = apiWorld({ '/v1/auth/exchange': [200, { token: LONG_TOKEN }] });
  const api = createPanelApi({ store: refusing, tab: refusing, fetchFn: world.fetchFn });
  api.beginSignIn();
  await api.exchange('ticket');
  assert.equal(api.signedIn(), true);
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
