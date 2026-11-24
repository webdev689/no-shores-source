import assert from 'node:assert/strict';
import { type TestContext, test } from 'node:test';
import { contentBytes, fetchRetried, totalOfRange, trimStored } from './contentCache.ts';

test('a range answer says the whole file it was cut from', () => {
  assert.equal(totalOfRange('bytes 0-99/833356'), 833356);
  assert.equal(totalOfRange(null), null);
  assert.equal(totalOfRange('bytes 0-99/*'), null);
});

test('over its limit, the storage lets go of the files kept longest ago until it is a tenth under', async () => {
  const kept = new Map(['a', 'b', 'c', 'd'].map((name) => [name, 100]));
  const store = {
    keys: () => Promise.resolve([...kept.keys()].map((name) => ({ url: name }) as Request)),
    match: (request: Request) =>
      Promise.resolve(new Response('', { headers: { 'x-size': String(kept.get(request.url) ?? 0) } })),
    delete: (request: Request) => Promise.resolve(kept.delete(request.url)),
  };
  await trimStored(store, 400, 1000);
  assert.equal(kept.size, 4, 'within its limit, nothing goes');
  await trimStored(store, 1100, 1000);
  assert.deepEqual([...kept.keys()], ['c', 'd'], 'the two kept first go, bringing it to 900');
});

test('a range the server sends whole is taken whole; one short is fetched past the cache, then fails', async (context) => {
  const answers = [
    new Response(new Uint8Array(10), { status: 200 }),
    new Response(new Uint8Array(3), { status: 206, headers: { 'content-range': 'bytes 0-2/50' } }),
    new Response(new Uint8Array(3), { status: 206, headers: { 'content-range': 'bytes 0-2/50' } }),
  ];
  const asked: (RequestCache | undefined)[] = [];
  context.mock.method(globalThis, 'fetch', (url: string, init?: RequestInit) => {
    asked.push(init?.cache);
    return Promise.resolve(answers.shift());
  });
  assert.deepEqual(await contentBytes('https://r2/whole.bin', [0, 4]).then(({ total }) => total), 10);
  await assert.rejects(contentBytes('https://r2/short.bin', [0, 9]), /sent 3 of 10 bytes/);
  assert.deepEqual(asked, ['default', 'default', 'reload']);
});

/** A fetch answering each of `answers` in turn (an error thrown as a network failure), and the waits it was given. */
function flaky(context: TestContext, answers: (Response | Error)[]) {
  let asked = 0;
  context.mock.method(globalThis, 'fetch', () => {
    asked++;
    const answer = answers.shift();
    return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);
  });
  const waits: number[] = [];
  const wait = (seconds: number) => (waits.push(seconds), Promise.resolve());
  return { waits, wait, asked: () => asked };
}

test('a fetch failing for a while (a network error, a 429, a 5xx) is asked again after a growing wait', async (context) => {
  const tooMany = new Response(null, { status: 429, headers: { 'retry-after': '2' } });
  const answers = [new TypeError('fetch failed'), new Response(null, { status: 503 }), tooMany];
  const { waits, wait } = flaky(context, [...answers, new Response(new Uint8Array(4), { status: 200 })]);
  const answer = await fetchRetried('https://r2/a.bin', {}, wait);
  assert.deepEqual([answer.status, (await answer.arrayBuffer()).byteLength], [200, 4]);
  assert.deepEqual(waits, [0.5, 1.5, 2], 'the server’s Retry-After taken for its own');
});

test('a Retry-After is waited no longer than ten seconds; a 404 is not asked again; a lasting failure is given up', async (context) => {
  const long = flaky(context, [new Response(null, { status: 429, headers: { 'retry-after': '600' } }), new Response()]);
  assert.equal((await fetchRetried('https://r2/b.bin', {}, long.wait)).status, 200);
  assert.deepEqual(long.waits, [10]);
  context.mock.restoreAll();
  const missing = flaky(context, [new Response(null, { status: 404 })]);
  assert.equal((await fetchRetried('https://r2/c.bin', {}, missing.wait)).status, 404);
  assert.deepEqual([missing.asked(), missing.waits], [1, []]);
  context.mock.restoreAll();
  const down = flaky(
    context,
    Array.from({ length: 5 }, () => new Response(null, { status: 502 })),
  );
  assert.equal((await fetchRetried('https://r2/d.bin', {}, down.wait)).status, 502);
  assert.deepEqual([down.asked(), down.waits], [4, [0.5, 1.5, 4]]);
  context.mock.restoreAll();
  const offline = flaky(
    context,
    Array.from({ length: 4 }, () => new TypeError('fetch failed')),
  );
  await assert.rejects(fetchRetried('https://r2/e.bin', {}, offline.wait), /fetch failed/);
});
