import { strict as assert } from 'node:assert';
import { mock, test } from 'node:test';
import { ForgeStore, RETRY_AFTER_MS, pictureRange } from './store.ts';

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
