import { strict as assert } from 'node:assert';
import { mock, test } from 'node:test';
import { ForgeStore, RETRY_AFTER_MS, pictureRange, rangeLength, stripAt } from './store.ts';

const manifest = { base: 'https://renders.example/', index: 'index/a.json', tables: {} };
const index = {
  packs: ['packs/first.webp', 'packs/second.webp'],
  pictures: { 'forge/layers/male/body_idle.png': [1, 100, 50, 'image/webp'] as const },
};

test('a picture is read from its pack by its byte range, the last byte included', () => {
  assert.deepEqual(pictureRange(manifest, index, 'forge/layers/male/body_idle.png'), {
    url: 'https://renders.example/packs/second.webp',
    range: 'bytes=100-149',
    type: 'image/webp',
  });
});

test('a picture the index does not hold has no range', () => {
  assert.equal(pictureRange(manifest, index, 'forge/layers/male/nothing_idle.png'), null);
});

test('a strip that failed to arrive is asked for again only after a while, not on every frame', async () => {
  const asked: string[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string) => {
    asked.push(url);
    return url.endsWith('index/a.json') ? Response.json(index) : new Response('', { status: 503 });
  }) as typeof fetch;
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const store = await ForgeStore.open(manifest);
    const path = 'forge/layers/male/body_idle.png';
    for (let frame = 0; frame < 3; frame++) await store.strip(path).catch(() => null);
    assert.equal(asked.length, 2, 'the index, then the strip once');
    mock.timers.tick(RETRY_AFTER_MS);
    await store.strip(path).catch(() => null);
    assert.equal(asked.length, 3, 'asked again after the wait');
  } finally {
    mock.timers.reset();
    globalThis.fetch = realFetch;
  }
});

test('a range cut short is fetched again past the cache, and still short it fails rather than decode a part', async () => {
  assert.equal(rangeLength('bytes=100-149'), 50);
  const asked: (RequestCache | undefined)[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (unused: string, init?: RequestInit) => {
    asked.push(init?.cache);
    return new Response(new Uint8Array(12), { status: 206 });
  }) as typeof fetch;
  try {
    const where = { url: 'https://renders.example/packs/second.webp', range: 'bytes=100-149', type: 'image/webp' };
    await assert.rejects(stripAt(where), /sent 12 of 50 bytes/);
    assert.deepEqual(asked, [undefined, 'reload'], 'once as asked, then past the cache');
  } finally {
    globalThis.fetch = realFetch;
  }
});
