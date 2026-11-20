import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Strip } from '../forge/compose.ts';
import type { StripWhere } from '../forge/store.ts';
import { AHEAD_AT_ONCE, type Places, StripFetcher } from './stripFetcher.ts';

const settled = () => new Promise((resolve) => setImmediate(resolve));
const decode = (bytes: ArrayBuffer): Promise<Strip> =>
  Promise.resolve({ width: bytes.byteLength, height: 1, data: new Uint8Array(bytes) });

/** A pack of `pairs` strips, each `size` bytes, each lying just before its depth, every pair `gap` bytes apart. */
function pack(pairs: number, size = 4, gap = 100): Places {
  const places: Record<string, StripWhere> = {};
  for (let pair = 0; pair < pairs; pair++) {
    const start = pair * (size * 2 + gap);
    const range = (first: number) => `bytes=${first}-${first + size - 1}`;
    places[`forge/layers/male/layer${pair}_idle.png`] = { url: 'pack.webp', range: range(start), type: 'image/webp' };
    places[`forge/layers/male/layer${pair}_idle_z.png`] = {
      url: 'pack.webp',
      range: range(start + size),
      type: 'image/webp',
    };
  }
  return places;
}

/** A fetch of ranges that answers each with its own first byte's number, and records what it was asked. */
function fetching(fail: (range: string, times: number) => boolean = () => false) {
  const asked: string[] = [];
  const fetchRange = (where: StripWhere) => {
    asked.push(where.range);
    const times = asked.filter((range) => range === where.range).length;
    if (fail(where.range, times)) return Promise.reject(new Error('cut off'));
    const [first = 0, last = 0] = where.range.replace('bytes=', '').split('-').map(Number);
    return Promise.resolve(Uint8Array.from({ length: last - first + 1 }, (_unused, index) => first + index).buffer);
  };
  return { asked, fetchRange };
}

test('a strip and its depth lying side by side come in one range, cut where the strip ends', async () => {
  const { asked, fetchRange } = fetching();
  const fetcher = new StripFetcher(fetchRange, decode);
  const places = pack(1);
  const strip = await fetcher.strip('forge/layers/male/layer0_idle.png', places);
  const depth = await fetcher.strip('forge/layers/male/layer0_idle_z.png', places);
  assert.deepEqual(asked, ['bytes=0-7']);
  assert.deepEqual([...(strip?.data ?? [])], [0, 1, 2, 3]);
  assert.deepEqual([...(depth?.data ?? [])], [4, 5, 6, 7]);
});

test('fetching ahead keeps as many fetches on their way as it may, a depth fetched with its strip taking no turn', async () => {
  const asked: string[] = [];
  const fetcher = new StripFetcher((where) => (asked.push(where.range), new Promise(() => undefined)), decode);
  fetcher.fetchAhead(pack(10));
  await settled();
  assert.equal(asked.length, AHEAD_AT_ONCE, 'each a strip and its depth together');
});

test('a strip fetched ahead that failed is fetched again for the frame that wants it, not held failed', async () => {
  const { asked, fetchRange } = fetching((_range, times) => times === 1);
  const fetcher = new StripFetcher(fetchRange, decode);
  const places = pack(1);
  fetcher.fetchAhead(places);
  await settled();
  await settled();
  const strip = await fetcher.strip('forge/layers/male/layer0_idle.png', places);
  assert.deepEqual([...(strip?.data ?? [])], [0, 1, 2, 3]);
  assert.ok(asked.length >= 3, `asked again: ${asked.join(' ')}`);
});

test('a joined range that fails falls back to each strip on its own', async () => {
  const { asked, fetchRange } = fetching((range) => range === 'bytes=0-7');
  const fetcher = new StripFetcher(fetchRange, decode);
  const places = pack(1);
  const depth = await fetcher.strip('forge/layers/male/layer0_idle_z.png', places);
  assert.deepEqual([...(depth?.data ?? [])], [4, 5, 6, 7]);
  assert.deepEqual(asked.slice(0, 1), ['bytes=0-7']);
  assert.ok(asked.includes('bytes=4-7'), asked.join(' '));
});

test('a strip already held is not fetched ahead again', async () => {
  const { asked, fetchRange } = fetching();
  const fetcher = new StripFetcher(fetchRange, decode);
  const places = pack(2);
  await fetcher.strip('forge/layers/male/layer0_idle.png', places);
  fetcher.fetchAhead(places);
  await settled();
  assert.deepEqual(asked, ['bytes=0-7', 'bytes=108-115']);
});

test('a strip the page said nothing of is none, and not kept as missing, since it may be drawn after all', async () => {
  const { asked, fetchRange } = fetching();
  const fetcher = new StripFetcher(fetchRange, decode);
  const places = pack(1);
  const path = 'forge/layers/male/layer0_idle.png';
  assert.equal(await fetcher.strip(path, {}), null);
  assert.ok(await fetcher.strip(path, places), 'drawn once the page says where it lies');
  assert.equal(asked.length, 1);
});
