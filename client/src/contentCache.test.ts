import assert from 'node:assert/strict';
import { test } from 'node:test';
import { contentBytes, totalOfRange, trimStored } from './contentCache.ts';

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
