import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type Deps, handle } from './accounts.ts';
import { HOLD_MS, characters } from './characters.ts';
import type { DiscordApp } from './discord.ts';
import { NO_ONES_PASSWORD, hashPassword, passwordMatches } from './secrets.ts';
import { sqliteForTests } from './sqliteForTests.ts';

const API = 'https://accounts.test';
const PAGE = 'https://lattymoy.github.io';

/** A world of accounts on a fresh database, its clock where the test sets it. */
function accounts(discord: DiscordApp | null = null) {
  const clock = { now: 1_000_000 };
  const deps: Deps = { database: sqliteForTests(), now: () => clock.now, discord, pages: [PAGE] };
  const ask = async (method: string, path: string, body?: unknown, token?: string, headers: HeadersInit = {}) => {
    const response = await handle(
      new Request(`${API}${path}`, {
        method,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          'CF-Connecting-IP': '203.0.113.9',
          ...headers,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
      deps,
    );
    const text = await response.text();
    const isJson = response.headers.get('Content-Type') === 'application/json';
    return {
      status: response.status,
      body: (isJson ? JSON.parse(text) : { text }) as Record<string, unknown>,
      response,
    };
  };
  return { deps, clock, ask };
}

test('a password is kept salted and matches only itself; the password kept for no one matches nothing', async () => {
  const kept = await hashPassword('correct horse');
  assert.match(kept, /^pbkdf2-sha256\$100000\$/);
  assert.notEqual(kept, await hashPassword('correct horse'), 'each salt is its own');
  assert.equal(await passwordMatches('correct horse', kept), true);
  assert.equal(await passwordMatches('correct horsf', kept), false);
  assert.equal(await passwordMatches('', NO_ONES_PASSWORD), false);
  assert.equal(await passwordMatches('x', 'pbkdf2-sha256$900000$AA==$AA=='), false, 'past what a Worker derives');
});

test('a guest is an account from the first visit, and may take a username and password to sign in with', async () => {
  const { ask } = accounts();
  const guest = await ask('POST', '/v1/guest');
  assert.equal(guest.status, 200);
  const token = guest.body['token'] as string;
  assert.match(token, /^[0-9a-f]{64}$/);
  assert.deepEqual((await ask('GET', '/v1/me', undefined, token)).body['account'], guest.body['account']);
  assert.equal((guest.body['account'] as { guest: boolean }).guest, true);
  assert.equal((await ask('GET', '/v1/me', undefined, 'f'.repeat(64))).status, 401);

  assert.equal((await ask('POST', '/v1/register', { username: 'x', password: 'long enough' }, token)).status, 400);
  assert.equal((await ask('POST', '/v1/register', { username: 'Mariner', password: 'short' }, token)).status, 400);
  const named = await ask('POST', '/v1/register', { username: 'Mariner', password: 'long enough' }, token);
  assert.equal(named.status, 200);
  assert.deepEqual(named.body['account'], { ...(guest.body['account'] as object), username: 'Mariner', guest: false });
  assert.equal((await ask('POST', '/v1/register', { username: 'Other', password: 'long enough' }, token)).status, 409);

  const another = (await ask('POST', '/v1/guest')).body['token'] as string;
  const taken = await ask('POST', '/v1/register', { username: 'MARINER', password: 'long enough' }, another);
  assert.equal(taken.status, 409, 'a username is one however it is typed');

  assert.equal((await ask('POST', '/v1/login', { username: 'mariner', password: 'wrong one!' })).status, 401);
  assert.equal((await ask('POST', '/v1/login', { username: 'nobody', password: 'long enough' })).status, 401);
  const back = await ask('POST', '/v1/login', { username: 'mariner', password: 'long enough' });
  assert.equal(back.status, 200);
  assert.notEqual(back.body['token'], token, 'a new session for a new browser');
  assert.deepEqual(back.body['account'], named.body['account']);

  await ask('POST', '/v1/logout', undefined, back.body['token'] as string);
  assert.equal((await ask('GET', '/v1/me', undefined, back.body['token'] as string)).status, 401);
  assert.equal((await ask('GET', '/v1/me', undefined, token)).status, 200, 'the other session holds');
});

test('one address is slowed: new guests per hour, and guesses at one username', async () => {
  const { ask, clock } = accounts();
  for (let made = 0; made < 10; made++) assert.equal((await ask('POST', '/v1/guest')).status, 200);
  assert.equal((await ask('POST', '/v1/guest')).status, 429);
  clock.now += 60 * 60_000;
  const token = (await ask('POST', '/v1/guest')).body['token'] as string;
  await ask('POST', '/v1/register', { username: 'Mariner', password: 'long enough' }, token);
  for (let guess = 0; guess < 10; guess++)
    assert.equal((await ask('POST', '/v1/login', { username: 'Mariner', password: `guess ${guess}!` })).status, 401);
  assert.equal((await ask('POST', '/v1/login', { username: 'Mariner', password: 'long enough' })).status, 429);
});

test('the API answers any page, and nothing it does not know', async () => {
  const { ask } = accounts();
  const preflight = await ask('OPTIONS', '/v1/guest');
  assert.equal(preflight.status, 204);
  assert.equal(preflight.response.headers.get('Access-Control-Allow-Origin'), '*');
  assert.equal((await ask('GET', '/v1/nothing')).status, 404);
  assert.deepEqual((await ask('GET', '/v1/health')).body, { ok: true, discord: false });
  assert.equal((await ask('GET', `/v1/discord/start?back=${PAGE}/`)).status, 503, 'no keys, no Discord');
});

test('one room at a time holds a character; a claim waits for another to let go, then takes it', async () => {
  const { deps, clock, ask } = accounts();
  const token = (await ask('POST', '/v1/guest')).body['token'] as string;
  const waited: number[] = [];
  const kept = characters(deps.database, deps.now, (millis) => {
    waited.push(millis);
    clock.now += millis;
    return Promise.resolve();
  });
  assert.equal(await kept.claim('0'.repeat(64), 'room-a:1'), null, 'no session, no character');
  const first = await kept.claim(token, 'room-a:1');
  assert.ok(first);
  assert.equal(first.body, null, 'none kept yet');
  assert.equal(await kept.save(first.account, 'room-a:1', '{"xp":5}'), true);

  // A second room waits three seconds for the first to let go, then takes the character anyway.
  const second = await kept.claim(token, 'room-b:1');
  assert.deepEqual(second, { account: first.account, body: '{"xp":5}' });
  assert.equal(
    waited.reduce((sum, millis) => sum + millis, 0),
    3000,
  );
  assert.equal(await kept.save(first.account, 'room-a:1', '{"xp":6}'), false, 'the first room learns it went');
  assert.equal(await kept.release(first.account, 'room-a:1', '{"xp":6}'), false);

  // Let go with a last save, the next claim takes it at once.
  assert.equal(await kept.release(first.account, 'room-b:1', '{"xp":9}'), true);
  waited.length = 0;
  assert.deepEqual(await kept.claim(token, 'room-a:2'), { account: first.account, body: '{"xp":9}' });
  assert.deepEqual(waited, []);

  // A hold its room stopped saving lapses.
  clock.now += HOLD_MS + 1;
  assert.deepEqual(await kept.claim(token, 'room-c:1'), { account: first.account, body: '{"xp":9}' });
  assert.deepEqual(waited, []);
});

test('Discord signs in, links a guest, and keeps one Discord account to one account', async () => {
  const discordUser = { id: '80351110224678912' };
  const app: DiscordApp = {
    id: 'app-id',
    secret: 'app-secret',
    fetch: (input) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.endsWith('/oauth2/token')) return Promise.resolve(Response.json({ access_token: 'granted' }));
      if (url.endsWith('/users/@me')) return Promise.resolve(Response.json(discordUser));
      return Promise.resolve(new Response(null, { status: 404 }));
    },
  };
  const { ask } = accounts(app);
  const goTo = async (ticket?: string) => {
    const started = await ask('GET', `/v1/discord/start?back=${PAGE}/game/${ticket ? `&ticket=${ticket}` : ''}`);
    assert.equal(started.status, 302);
    const to = new URL(started.response.headers.get('Location') ?? '');
    assert.equal(to.origin + to.pathname, 'https://discord.com/oauth2/authorize');
    assert.equal(to.searchParams.get('redirect_uri'), `${API}/v1/discord/callback`);
    const state = to.searchParams.get('state') ?? '';
    const cookie = (started.response.headers.get('Set-Cookie') ?? '').split(';')[0] ?? '';
    return { state, cookie };
  };
  const comeBack = async (state: string, cookie: string, code = 'a-code') => {
    const came = await ask('GET', `/v1/discord/callback?code=${code}&state=${state}`, undefined, undefined, {
      Cookie: cookie,
    });
    assert.equal(came.status, 302);
    const back = new URL(came.response.headers.get('Location') ?? '');
    assert.equal(back.origin + back.pathname, `${PAGE}/game/`);
    return new URLSearchParams(back.hash.slice(1));
  };

  assert.equal((await ask('GET', '/v1/discord/start?back=https://elsewhere.test/')).status, 400);

  // A guest's ticket links their Discord to them.
  const guest = (await ask('POST', '/v1/guest')).body['token'] as string;
  const ticket = (await ask('POST', '/v1/discord/ticket', undefined, guest)).body['ticket'] as string;
  const linking = await goTo(ticket);
  assert.equal((await comeBack(linking.state, linking.cookie)).get('discord'), 'linked');
  const linked = (await ask('GET', '/v1/me', undefined, guest)).body['account'] as { discord: boolean; id: string };
  assert.equal(linked.discord, true);

  // Signing in with it from anywhere comes to that account.
  const signing = await goTo();
  const session = (await comeBack(signing.state, signing.cookie)).get('session') ?? '';
  assert.equal(((await ask('GET', '/v1/me', undefined, session)).body['account'] as { id: string }).id, linked.id);

  // A state is used once, and only in the browser that began it.
  assert.equal((await ask('GET', `/v1/discord/callback?code=c&state=${signing.state}`)).status, 400);
  const stolen = await goTo();
  assert.equal((await comeBack(stolen.state, 'overlook_discord=someone-else')).get('discord'), 'failed');

  // A new Discord account with no ticket becomes a new account.
  discordUser.id = '41771983423143937';
  const fresh = await goTo();
  const newSession = (await comeBack(fresh.state, fresh.cookie)).get('session') ?? '';
  const newAccount = (await ask('GET', '/v1/me', undefined, newSession)).body['account'] as { id: string };
  assert.notEqual(newAccount.id, linked.id);
});
