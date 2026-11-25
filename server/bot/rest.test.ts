import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type Fetch, WAIT_MAX_MS, createRest, logPath, reasonHeader, routeKey } from './rest.ts';

/** A clock that only moves when the rest door sleeps. */
function clock() {
  const held = { time: 1_000_000, slept: [] as number[] };
  return {
    held,
    now: () => held.time,
    sleep: async (millis: number) => {
      held.slept.push(millis);
      held.time += millis;
    },
  };
}

const answer = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(body === undefined ? '' : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

test('rest: route keys keep the channel, guild and webhook ids and fold every other', () => {
  assert.equal(
    routeKey('GET', '/channels/111111111111111111/messages/222222222222222222'),
    'GET /channels/111111111111111111/messages/:id',
  );
  assert.equal(
    routeKey('PUT', '/guilds/333333333333333333/members/444444444444444444/roles/555555555555555555'),
    'PUT /guilds/333333333333333333/members/:id/roles/:id',
  );
  assert.equal(
    routeKey('POST', '/webhooks/666666666666666666/secret-token-here'),
    'POST /webhooks/666666666666666666/:token',
  );
});

test('rest: a log line carries no id and no webhook token', () => {
  assert.equal(
    logPath('/webhooks/666666666666666666/secret-token-here/messages/@original'),
    '/webhooks/#/:token/messages/@original',
  );
  assert.equal(logPath('/guilds/333333333333333333/bans/444444444444444444?x=1'), '/guilds/#/bans/#');
});

test('rest: every call carries the bot token, the User-Agent and a JSON body; the reason goes in the audit header', async () => {
  const seen: Array<RequestInit | undefined> = [];
  const rest = createRest({
    token: 'tok',
    fetch: async (_url, init) => {
      seen.push(init);
      return answer(200, { ok: 1 });
    },
  });
  const done = await rest.put(
    '/guilds/333333333333333333/bans/444444444444444444',
    { delete_message_seconds: 0 },
    { reason: 'spam & scam' },
  );
  assert.equal(done.ok, true);
  const headers = (seen[0]?.headers ?? {}) as Record<string, string>;
  assert.equal(headers.authorization, 'Bot tok');
  assert.match(headers['user-agent'] ?? '', /^DiscordBot \(https:\/\/[^,]+, \d+\)$/);
  assert.equal(headers['x-audit-log-reason'], 'spam%20%26%20scam');
  assert.equal(seen[0]?.body, '{"delete_message_seconds":0}');
  assert.equal(reasonHeader('x'.repeat(600)).length, 512);
});

test('rest: no token answers down without calling Discord', async () => {
  let called = false;
  const rest = createRest({ token: '', fetch: async () => ((called = true), answer(200, {})) });
  const done = await rest.get('/users/@me');
  assert.equal(done.ok, false);
  assert.equal(!done.ok && done.down, true);
  assert.equal(called, false);
});

test('rest: a short 429 is waited out once and retried', async () => {
  const time = clock();
  let calls = 0;
  const rest = createRest({
    token: 'tok',
    now: time.now,
    sleep: time.sleep,
    fetch: async () => (++calls === 1 ? answer(429, { retry_after: 1.5, global: false }) : answer(200, { ok: 1 })),
  });
  const done = await rest.get('/channels/111111111111111111');
  assert.equal(done.ok, true);
  assert.equal(calls, 2);
  assert.deepEqual(time.held.slept, [1500]);
});

test('rest: a long 429 comes back as down with the wait, and the route waits before its next call', async () => {
  const time = clock();
  let calls = 0;
  const rest = createRest({
    token: 'tok',
    now: time.now,
    sleep: time.sleep,
    fetch: async () => (++calls, answer(429, { retry_after: 30 })),
  });
  const done = await rest.get('/channels/111111111111111111');
  assert.equal(done.ok, false);
  assert.deepEqual(done.ok ? [] : [done.down, done.retryAfterMs], [true, 30_000]);
  const again = await rest.get('/channels/111111111111111111');
  assert.equal(again.ok, false);
  assert.equal(calls, 1, 'the route is not asked again while it is limited');
});

test('rest: a global 429 holds every route', async () => {
  const time = clock();
  let calls = 0;
  const rest = createRest({
    token: 'tok',
    now: time.now,
    sleep: time.sleep,
    fetch: async () => (++calls, answer(429, { retry_after: WAIT_MAX_MS / 1000 + 10, global: true })),
  });
  await rest.get('/channels/1111111111111111111');
  const other = await rest.get('/guilds/2222222222222222222');
  assert.equal(other.ok, false);
  assert.equal(calls, 1);
});

test('rest: an empty bucket waits for its reset before calling', async () => {
  const time = clock();
  let calls = 0;
  const rest = createRest({
    token: 'tok',
    now: time.now,
    sleep: time.sleep,
    fetch: async () => (
      ++calls,
      answer(200, {}, { 'x-ratelimit-bucket': 'abc', 'x-ratelimit-remaining': '0', 'x-ratelimit-reset-after': '2' })
    ),
  });
  await rest.get('/channels/111111111111111111/messages');
  await rest.get('/channels/111111111111111111/messages');
  assert.equal(calls, 2);
  assert.deepEqual(time.held.slept, [2000]);
});

test('rest: one bucket id over two channels is counted for each apart - an empty one holds only its own channel', async () => {
  const time = clock();
  const rest = createRest({
    token: 'tok',
    now: time.now,
    sleep: time.sleep,
    fetch: async (url) =>
      answer(
        200,
        {},
        {
          'x-ratelimit-bucket': 'shared',
          'x-ratelimit-remaining': url.includes('111111111111111111') ? '0' : '4',
          'x-ratelimit-reset-after': '2',
        },
      ),
  });
  await rest.get('/channels/111111111111111111/messages');
  await rest.get('/channels/222222222222222222/messages');
  assert.deepEqual(time.held.slept, [], 'the other channel does not wait for the empty one');
  await rest.get('/channels/111111111111111111/messages');
  assert.deepEqual(time.held.slept, [2000], 'the empty one waits');
});

test("rest: a refusal says Discord's code; an unreachable Discord is down; neither throws or logs the token", async () => {
  const lines: string[] = [];
  const log = (line: string) => void lines.push(line);
  const refusing: Fetch = async () => answer(403, { code: 50013, message: 'Missing Permissions' });
  const refused = await createRest({ token: 'secret-tok', log, fetch: refusing }).del(
    '/guilds/333333333333333333/members/444444444444444444',
  );
  assert.deepEqual(refused.ok ? [] : [refused.status, refused.code, refused.down], [403, 50013, false]);
  const unreachable: Fetch = async () => {
    throw new Error('ECONNRESET secret-tok');
  };
  const gone = await createRest({ token: 'secret-tok', log, fetch: unreachable }).get('/users/@me');
  assert.deepEqual(gone.ok ? [] : [gone.down], [true]);
  assert.ok(lines.length >= 2);
  for (const line of lines) assert.doesNotMatch(line, /secret-tok/);
});
