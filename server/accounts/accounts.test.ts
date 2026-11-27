import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addressKey, guestKey } from '../address.ts';
import { HOLD_MS, characters } from './characters.ts';
import { SESSION_IDLE_MS } from './database.ts';
import { backTo } from './discord.ts';
import { NO_ONES_PASSWORD, hashPassword, passwordMatches } from './secrets.ts';
import { PAGE, accounts } from './accountsForTests.ts';

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

test("sign-ins are slowed at Cloudflare by address first, before the database or a password's hash is reached", async () => {
  const { deps, ask } = accounts();
  const token = (await ask('POST', '/v1/guest')).body['token'] as string;
  await ask('POST', '/v1/register', { username: 'Mariner', password: 'long enough' }, token);
  // Cloudflare's binding, stubbed: two sign-ins a key, and the database's statements counted.
  const counted = new Map<string, number>();
  const signIns = {
    limit: ({ key }: { key: string }) => {
      counted.set(key, (counted.get(key) ?? 0) + 1);
      return Promise.resolve({ success: (counted.get(key) ?? 0) <= 2 });
    },
  };
  const { database } = deps;
  let statements = 0;
  const counting = { ...database, prepare: (sql: string) => ((statements += 1), database.prepare(sql)) };
  Object.assign(deps, { signIns, database: counting });
  const signIn = (address: string) =>
    ask('POST', '/v1/login', { username: 'Mariner', password: 'long enough' }, undefined, {
      'CF-Connecting-IP': address,
    });
  assert.equal((await signIn('2001:db8:4c:1::1')).status, 200);
  assert.equal((await signIn('2001:db8:4c:1::2')).status, 200, 'the same /64');
  const before = statements;
  const slowed = await signIn('2001:db8:4c:1::3');
  assert.deepEqual([slowed.status, slowed.body['error']], [429, 'Too many sign-ins from here. Wait a minute.']);
  assert.equal(statements, before, 'refused before the database is asked');
  assert.equal((await signIn('2001:db8:4c:2::1')).status, 200, 'another network');
  assert.deepEqual([...counted.keys()], ['2001:db8:4c:1::/64', '2001:db8:4c:2::/64']);
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

test('one room at a time holds a character; a claim waits for another to let go, takes it, and says from where', async () => {
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
  assert.equal(first.from, null, 'held nowhere before');
  assert.equal(await kept.save(first.account, 'room-a:1', '{"xp":5}', '{"aurem":5}'), true);

  // A second room waits three seconds for the first to let go, then takes the character anyway.
  const second = await kept.claim(token, 'room-b:1');
  assert.deepEqual(second, {
    account: first.account,
    body: '{"xp":5}',
    vault: '{"aurem":5}',
    from: 'room-a',
    name: null,
    tag: null,
  });
  assert.equal(
    waited.reduce((sum, millis) => sum + millis, 0),
    3000,
  );
  assert.equal(
    await kept.save(first.account, 'room-a:1', '{"xp":6}', '{"aurem":6}'),
    false,
    'the first room learns it went',
  );
  assert.equal(await kept.release(first.account, 'room-a:1', '{"xp":6}', '{"aurem":6}'), false);
  assert.equal((await kept.look(token))?.vault, '{"aurem":5}', 'a room that no longer holds it writes no vault');

  // Let go with a last save, the next claim takes it at once.
  assert.equal(await kept.release(first.account, 'room-b:1', '{"xp":9}', '{"aurem":9}'), true);
  waited.length = 0;
  assert.deepEqual(await kept.claim(token, 'room-a:2'), {
    account: first.account,
    body: '{"xp":9}',
    vault: '{"aurem":9}',
    from: 'room-b',
    name: null,
    tag: null,
  });
  assert.deepEqual(waited, []);

  // A hold its room stopped saving lapses.
  clock.now += HOLD_MS + 1;
  assert.deepEqual(await kept.claim(token, 'room-c:1'), {
    account: first.account,
    body: '{"xp":9}',
    vault: '{"aurem":9}',
    from: 'room-a',
    name: null,
    tag: null,
  });
  assert.deepEqual(waited, []);

  // Let go untouched (its gate shut), it was never in that room: the next claim comes from the room before.
  assert.equal(await kept.release(first.account, 'room-c:1', null, null), true);
  assert.equal((await kept.look(token))?.from, 'room-a');
  assert.equal((await kept.claim(token, 'room-d:1'))?.from, 'room-a');
});

test('limits are kept by address, an IPv6 address by its /64; a name no account can hold is never kept', async () => {
  assert.equal(addressKey('203.0.113.9'), '203.0.113.9');
  assert.equal(addressKey('2001:db8:85a3:0042:1000:8a2e:370:7334'), '2001:db8:85a3:42::/64');
  assert.equal(addressKey('2001:DB8::1'), addressKey('2001:db8:0:0:ffff::9'), 'one network, one count');
  const { ask } = accounts();
  const long = 'x'.repeat(5000);
  assert.equal(
    (await ask('POST', '/v1/login', { username: long, password: 'long enough' })).status,
    400,
    'too long a body',
  );
  assert.equal((await ask('POST', '/v1/login', { username: 'no such name!', password: 'long enough' })).status, 401);
});

test('guesses at one username from many addresses meet a ceiling, but one address cannot lock it alone', async () => {
  const { ask } = accounts();
  const token = (await ask('POST', '/v1/guest')).body['token'] as string;
  await ask('POST', '/v1/register', { username: 'Mariner', password: 'long enough' }, token);
  const from = (address: string) => ({ 'CF-Connecting-IP': address });
  for (let guess = 0; guess < 10; guess++)
    await ask(
      'POST',
      '/v1/login',
      { username: 'Mariner', password: `guess ${guess}!` },
      undefined,
      from('198.51.100.1'),
    );
  const locked = await ask(
    'POST',
    '/v1/login',
    { username: 'Mariner', password: 'long enough' },
    undefined,
    from('198.51.100.1'),
  );
  assert.equal(locked.status, 429, 'the guessing address is slowed');
  const owner = await ask(
    'POST',
    '/v1/login',
    { username: 'Mariner', password: 'long enough' },
    undefined,
    from('198.51.100.2'),
  );
  assert.equal(owner.status, 200, 'the owner, elsewhere, still signs in');
});

test('a Discord sign-in comes back only to a page under a listed one, by origin and path', () => {
  const pages = ['https://lattymoy.github.io/no-shores-source/'];
  assert.equal(
    backTo('https://lattymoy.github.io/no-shores-source/?room=live#x', pages),
    'https://lattymoy.github.io/no-shores-source/?room=live',
  );
  assert.equal(
    backTo('https://lattymoy.github.io/no-shores-source', pages),
    'https://lattymoy.github.io/no-shores-source',
  );
  assert.equal(backTo('https://lattymoy.github.io/daggerfall-js-source/', pages), null, "another project's page");
  assert.equal(backTo('https://lattymoy.github.io/no-shores-sourced/', pages), null);
  assert.equal(backTo('https://evil.example/no-shores-source/', pages), null);
  assert.equal(backTo('javascript:alert(1)', pages), null);
});

test('a session with a way back in lapses after 30 days unseen; a guest in use never lapses; all may be signed out', async () => {
  const { deps, clock, ask } = accounts();
  const kept = characters(deps.database, deps.now, () => Promise.resolve());
  const guest = (await ask('POST', '/v1/guest')).body['token'] as string;
  const named = (await ask('POST', '/v1/guest')).body['token'] as string;
  await ask('POST', '/v1/register', { username: 'Mariner', password: 'long enough' }, named);
  const elsewhere = (await ask('POST', '/v1/login', { username: 'Mariner', password: 'long enough' })).body[
    'token'
  ] as string;

  clock.now += SESSION_IDLE_MS - 1;
  assert.equal((await ask('GET', '/v1/me', undefined, named)).status, 200, 'seen within the month');
  clock.now += SESSION_IDLE_MS - 1;
  assert.equal((await ask('GET', '/v1/me', undefined, named)).status, 200, 'each sight keeps it a month more');
  clock.now += SESSION_IDLE_MS + 1;
  const lapsed = await ask('GET', '/v1/me', undefined, named);
  assert.deepEqual(
    [lapsed.status, lapsed.body['error']],
    [401, 'Your sign-in lapsed after 30 days away. Sign in again.'],
  );
  assert.equal((await ask('GET', '/v1/me', undefined, named)).body['error'], 'Not signed in.', 'and is gone');
  assert.equal(await kept.claim(elsewhere, 'room-a:1'), null, 'no room takes a lapsed session');
  assert.ok(await kept.claim(guest, 'room-a:2'), "a guest's token is its only way back, and never lapses");
  assert.equal((await ask('GET', '/v1/me', undefined, guest)).status, 200);

  const again = (await ask('POST', '/v1/login', { username: 'Mariner', password: 'long enough' })).body[
    'token'
  ] as string;
  const other = (await ask('POST', '/v1/login', { username: 'Mariner', password: 'long enough' })).body[
    'token'
  ] as string;
  assert.equal((await ask('POST', '/v1/logout/everywhere', undefined, guest)).status, 409, 'a guest would be lost');
  assert.equal((await ask('POST', '/v1/logout/everywhere', undefined, again)).status, 200);
  assert.equal((await ask('GET', '/v1/me', undefined, other)).status, 401, 'every session ends');
  assert.equal((await ask('GET', '/v1/me', undefined, again)).status, 401);
});

test('a write that fails is answered as JSON with the usual headers: 409 when another ask changed its rows', async (t) => {
  const logged = t.mock.method(console, 'error', () => undefined);
  const { ask, deps } = accounts();
  const named = async (username: string) => {
    const token = (await ask('POST', '/v1/guest')).body['token'] as string;
    await ask('POST', '/v1/register', { username, password: 'long enough' }, token);
    return token;
  };
  const [ada, ben] = [await named('Ada'), await named('Ben')];
  await ask('POST', '/v1/social/guild/found', { name: 'Oaks', tag: 'OAK' }, ada);
  await ask('POST', '/v1/social/guild/invite', { name: 'Ben' }, ada);
  // The guild ends between Ben's accepting being read and his joining being written.
  const { database } = deps;
  const ending = (sql: string) => {
    const statement = database.prepare(sql);
    if (!sql.includes('INSERT OR IGNORE INTO guild_members')) return statement;
    return {
      ...statement,
      bind: (...values: unknown[]) => ({
        ...statement.bind(...values),
        run: async () => {
          await database.prepare('DELETE FROM guilds').run();
          return statement.bind(...values).run();
        },
      }),
    };
  };
  Object.assign(deps, { database: { prepare: ending } });
  const raced = await ask('POST', '/v1/social/guild/accept', { tag: 'OAK' }, ben);
  assert.deepEqual(
    [raced.status, raced.body],
    [409, { error: 'Someone else changed that at the same moment. Try again.' }],
  );
  assert.equal(raced.response.headers.get('Access-Control-Allow-Origin'), '*');
  const broken = () => {
    throw new Error('the database is not answering');
  };
  Object.assign(deps, { database: { prepare: broken } });
  const failed = await ask('POST', '/v1/guest');
  assert.deepEqual([failed.status, failed.body], [500, { error: 'Something went wrong. Try again.' }]);
  assert.equal(failed.response.headers.get('Access-Control-Allow-Origin'), '*');
  assert.equal(logged.mock.callCount(), 2, 'each is logged');
});

test('new guests are 10 an hour from one address and 500 an hour from everywhere at once', async () => {
  const { clock, ask } = accounts();
  const from = (address: string) => ask('POST', '/v1/guest', undefined, undefined, { 'CF-Connecting-IP': address });
  for (let network = 0; network < 50; network += 1) {
    for (let each = 0; each < 10; each += 1) assert.equal((await from(`198.51.100.${network}`)).status, 200);
  }
  assert.equal((await from('198.51.100.0')).status, 429, "one address's ten");
  const everywhere = await from('192.0.2.7');
  assert.deepEqual([everywhere.status, everywhere.body['error']], [429, 'Too many new guests.'], 'the 501st anywhere');
  clock.now += 60 * 60_000;
  assert.equal((await from('192.0.2.7')).status, 200, 'the next hour');
});

test('a guest unused for 30 days is deleted with its character as the next guest is made; one in use is kept', async () => {
  const { deps, clock, ask } = accounts();
  const kept = characters(deps.database, deps.now, () => Promise.resolve());
  const guest = async () => (await ask('POST', '/v1/guest')).body['token'] as string;
  const away = await guest();
  const claimed = await kept.claim(away, 'room-a:1');
  assert.ok(claimed);
  assert.equal(await kept.save(claimed.account, 'room-a:1', '{"xp":5}', '{}'), true);
  assert.equal(await kept.release(claimed.account, 'room-a:1', '{"xp":5}', '{}'), true);
  const gone = await guest();
  await ask('POST', '/v1/logout', undefined, gone);
  const playing = await guest();
  const named = await guest();
  await ask('POST', '/v1/register', { username: 'Mariner', password: 'long enough' }, named);
  const rows = async (table: string) =>
    (await deps.database.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>())?.n;

  clock.now += SESSION_IDLE_MS - 60_000;
  assert.equal((await ask('GET', '/v1/me', undefined, playing)).status, 200);
  clock.now += 60_000 + 1;
  await guest();
  assert.equal((await ask('GET', '/v1/me', undefined, away)).body['error'], 'Not signed in.', '30 days away');
  assert.equal(await rows('characters'), 0, 'its character with it');
  assert.equal((await ask('GET', '/v1/me', undefined, playing)).status, 200, 'seen within the month');
  assert.equal(await rows('accounts'), 3, 'the one in use, the named and the new: the signed-out guest went too');
  assert.equal((await ask('POST', '/v1/login', { username: 'Mariner', password: 'long enough' })).status, 200);
});

test("new guests from IPv6 are counted by the /48, so one tunnel's many networks make ten an hour, not ten each", async () => {
  const { ask } = accounts();
  const from = (address: string) => ask('POST', '/v1/guest', undefined, undefined, { 'CF-Connecting-IP': address });
  for (let network = 0; network < 10; network += 1) {
    assert.equal((await from(`2001:db8:4c::${network.toString(16)}:0:0:1`)).status, 200, `the /64 ${network}`);
  }
  assert.equal((await from('2001:db8:4c:ff::1')).status, 429, 'another /64 of the same /48');
  assert.equal((await from('2001:db8:4d::1')).status, 200, 'another /48');
  assert.equal(guestKey('2001:db8:4c:ff::1'), '2001:db8:4c::/48');
  assert.equal(guestKey('203.0.113.9'), '203.0.113.9', 'an IPv4 address whole');
});
