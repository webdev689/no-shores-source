import { strict as assert } from 'node:assert';
import { mock, test } from 'node:test';
import {
  BLOCK_BYTES,
  ForgeStore,
  PackBlocks,
  RETRY_AFTER_MS,
  joinedRange,
  pictureRange,
  stripAt,
} from './store.ts';

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
  const asked: (RequestCache | undefined)[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (unused: string, init?: RequestInit) => {
    asked.push(init?.cache);
    return new Response(new Uint8Array(12), { status: 206, headers: { 'content-range': 'bytes 0-11/800000' } });
  }) as typeof fetch;
  try {
    const where = { url: 'https://renders.example/packs/second.webp', range: 'bytes=100-149', type: 'image/webp' };
    await assert.rejects(stripAt(where), new RegExp(`sent 12 of ${BLOCK_BYTES} bytes`));
    assert.deepEqual(asked, ['default', 'reload'], 'once as asked, then past the cache');
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('pictures that lie in one block of a pack come in one request, and one across two blocks takes both', async () => {
  const pack = Uint8Array.from({ length: BLOCK_BYTES * 2 + 100 }, (unused, index) => index % 251);
  const asked: string[] = [];
  const read = (url: string, range: readonly [number, number]) => {
    asked.push(range.join('-'));
    const bytes = pack.slice(range[0], range[1] + 1).buffer;
    return Promise.resolve({ bytes, total: pack.length });
  };
  const blocks = new PackBlocks(read);
  const url = 'https://renders.example/packs/first.webp';
  const one = new Uint8Array(await blocks.bytes(url, 10, 19));
  const two = new Uint8Array(await blocks.bytes(url, 500, 599));
  assert.deepEqual([...one], [...pack.slice(10, 20)]);
  assert.deepEqual([...two], [...pack.slice(500, 600)]);
  assert.deepEqual(asked, [`0-${BLOCK_BYTES - 1}`], 'both from the first block, read once');
  const across = new Uint8Array(await blocks.bytes(url, BLOCK_BYTES - 5, BLOCK_BYTES * 2 + 50));
  assert.deepEqual([...across], [...pack.slice(BLOCK_BYTES - 5, BLOCK_BYTES * 2 + 51)]);
  assert.equal(asked.length, 3, 'the second and the last, shorter, block');
});

test('a pack sent whole for a block is read from its start', async () => {
  const pack = Uint8Array.from({ length: BLOCK_BYTES + 1000 }, (unused, index) => index % 7);
  const blocks = new PackBlocks(() => Promise.resolve({ bytes: pack.slice().buffer, total: pack.length }));
  const offset = BLOCK_BYTES + 600;
  const read = new Uint8Array(await blocks.bytes('https://renders.example/packs/whole.webp', offset, offset + 9));
  assert.deepEqual([...read], [...pack.slice(offset, offset + 10)]);
});

test('a strip and its depth side by side in one pack are one range, split where the first ends', () => {
  const place = (range: string, url = 'pack.webp', type = 'image/webp') => ({ url, range, type });
  assert.deepEqual(joinedRange(place('bytes=100-199'), place('bytes=200-349')), {
    where: place('bytes=100-349'),
    oneFirst: true,
    split: 100,
  });
  assert.deepEqual(joinedRange(place('bytes=200-349'), place('bytes=100-199')), {
    where: place('bytes=100-349'),
    oneFirst: false,
    split: 100,
  });
  assert.equal(joinedRange(place('bytes=100-199'), place('bytes=201-349')), null, 'a gap between them');
  assert.equal(joinedRange(place('bytes=100-199'), place('bytes=200-349', 'other.webp')), null, 'another pack');
  assert.equal(
    joinedRange(place('bytes=100-199'), place('bytes=200-349', 'pack.webp', 'image/png')),
    null,
    'another kind',
  );
});
