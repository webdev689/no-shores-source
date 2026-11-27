import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { DiscordApp } from './discord.ts';
import { API, PAGE, accounts } from './accountsForTests.ts';

const NONCE = 'b'.repeat(64);
const OTHER_NONCE = 'c'.repeat(64);

/** A Discord app that answers for whichever Discord user the test sets. */
function discordAs(user: { id: string }): DiscordApp {
  return {
    id: 'app-id',
    secret: 'app-secret',
    fetch: (input) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.endsWith('/oauth2/token')) return Promise.resolve(Response.json({ access_token: 'granted' }));
      if (url.endsWith('/users/@me')) return Promise.resolve(Response.json(user));
      return Promise.resolve(new Response(null, { status: 404 }));
    },
  };
}

/** Accounts with Discord, and the steps of a sign-in: to Discord, back to the page with a code, and the code taken. */
function world() {
  const user = { id: '80351110224678912' };
  const { ask, clock } = accounts(discordAs(user));
  const goTo = async (nonce = NONCE, ticket?: string) => {
    const started = await ask(
      'GET',
      `/v1/discord/start?back=${PAGE}/game/&nonce=${nonce}${ticket ? `&ticket=${ticket}` : ''}`,
    );
    assert.equal(started.status, 302);
    const to = new URL(started.response.headers.get('Location') ?? '');
    assert.equal(to.origin + to.pathname, 'https://discord.com/oauth2/authorize');
    assert.equal(to.searchParams.get('redirect_uri'), `${API}/v1/discord/callback`);
    const cookie = (started.response.headers.get('Set-Cookie') ?? '').split(';')[0] ?? '';
    return { state: to.searchParams.get('state') ?? '', cookie };
  };
  const comeBack = async (state: string, cookie: string) => {
    const came = await ask('GET', `/v1/discord/callback?code=a-code&state=${state}`, undefined, undefined, {
      Cookie: cookie,
    });
    assert.equal(came.status, 302);
    const back = new URL(came.response.headers.get('Location') ?? '');
    assert.equal(back.origin + back.pathname, `${PAGE}/game/`);
    return new URLSearchParams(back.hash.slice(1));
  };
  const take = (code: string, nonce = NONCE, token?: string) =>
    ask('POST', '/v1/discord/finish', { code, nonce }, token);
  const through = async (nonce = NONCE, ticket?: string) => {
    const { state, cookie } = await goTo(nonce, ticket);
    const came = await comeBack(state, cookie);
    assert.equal(came.get('discord'), 'done');
    assert.equal(came.get('session'), null, 'no session travels in the address');
    return came.get('code') ?? '';
  };
  return { ask, clock, user, goTo, comeBack, take, through };
}

test('Discord signs in, links a guest, and keeps one Discord account to one account', async () => {
  const { ask, user, take, through } = world();
  assert.equal((await ask('GET', `/v1/discord/start?back=https://elsewhere.test/&nonce=${NONCE}`)).status, 400);
  assert.equal((await ask('GET', `/v1/discord/start?back=${PAGE}/`)).status, 400, 'no nonce, no sign-in');

  // A guest's ticket links their Discord to them, taken with their own session.
  const guest = (await ask('POST', '/v1/guest')).body['token'] as string;
  const ticket = (await ask('POST', '/v1/discord/ticket', undefined, guest)).body['ticket'] as string;
  const linking = await take(await through(NONCE, ticket), NONCE, guest);
  assert.equal(linking.status, 200);
  assert.equal(linking.body['linked'], true);
  // A ticket used, run out or never given is no plain sign-in: that would make a new account in the guest's place.
  for (const gone of [ticket, 'f'.repeat(64)])
    assert.equal((await ask('GET', `/v1/discord/start?back=${PAGE}/&nonce=${NONCE}&ticket=${gone}`)).status, 400);
  const linked = (await ask('GET', '/v1/me', undefined, guest)).body['account'] as { discord: boolean; id: string };
  assert.equal(linked.discord, true);

  // Signing in with it from anywhere comes to that account.
  const signedIn = await take(await through());
  assert.equal((signedIn.body['account'] as { id: string }).id, linked.id);
  assert.match(signedIn.body['token'] as string, /^[0-9a-f]{64}$/);

  // A new Discord account with no ticket becomes a new account.
  user.id = '41771983423143937';
  const fresh = await take(await through());
  assert.notEqual((fresh.body['account'] as { id: string }).id, linked.id);
});

test('a state is used once, in the browser that began it; a code is taken once, by the page that began it', async () => {
  const { ask, goTo, comeBack, take, through, clock } = world();
  const { state } = await goTo();
  assert.equal((await comeBack(state, 'overlook_discord=someone-else')).get('discord'), 'failed');
  assert.equal((await ask('GET', `/v1/discord/callback?code=c&state=${state}`)).status, 400, 'used once');

  const code = await through();
  assert.equal((await take(code, OTHER_NONCE)).status, 400, "another page's nonce takes nothing");
  assert.equal((await take(code)).status, 400, 'a code tried with the wrong nonce is spent');
  const late = await through();
  clock.now += 11 * 60_000;
  assert.equal((await take(late)).status, 400, 'a code lapses');
});

test("an attacker's ticket cannot link a victim's Discord to the attacker's account", async () => {
  const { ask, take, through } = world();
  const attacker = (await ask('POST', '/v1/guest')).body['token'] as string;
  const victim = (await ask('POST', '/v1/guest')).body['token'] as string;
  const ticket = (await ask('POST', '/v1/discord/ticket', undefined, attacker)).body['ticket'] as string;
  // The victim follows the attacker's link and approves Discord; their own page takes the code with its session.
  const code = await through(NONCE, ticket);
  assert.equal((await take(code, NONCE, victim)).status, 403);
  const attackers = (await ask('GET', '/v1/me', undefined, attacker)).body['account'] as { discord: boolean };
  assert.equal(attackers.discord, false, "the victim's Discord stays theirs");
});

test('tickets are limited per account, and states and codes past their time are let go', async () => {
  const { ask } = world();
  const guest = (await ask('POST', '/v1/guest')).body['token'] as string;
  for (let taken = 0; taken < 10; taken++)
    assert.equal((await ask('POST', '/v1/discord/ticket', undefined, guest)).status, 200);
  assert.equal((await ask('POST', '/v1/discord/ticket', undefined, guest)).status, 429);
});
