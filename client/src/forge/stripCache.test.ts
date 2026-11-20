import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { Strip } from './compose.ts';
import { StripCache } from './stripCache.ts';

const strip = (bytes: number): Strip => ({ width: 1, height: 1, data: new Uint8ClampedArray(bytes) });

test('strips are kept up to a budget in bytes, the least lately asked for let go and fetched again if asked', async () => {
  const cache = new StripCache(10);
  const loads: string[] = [];
  const get = (path: string) =>
    cache.get(path, () => {
      loads.push(path);
      return Promise.resolve(strip(4));
    });
  await get('first');
  await get('second');
  await get('first');
  await get('third');
  assert.equal(cache.kept, 8, 'two of 4 bytes kept within 10');
  await get('first');
  await get('second');
  assert.deepEqual(loads, ['first', 'second', 'third', 'second'], 'the second, least lately asked for, was let go');
});

test('a strip still arriving is never let go, however far past the budget', async () => {
  const cache = new StripCache(4);
  let arrive: (value: Strip) => void = () => undefined;
  const waiting = cache.get('slow', () => new Promise((done) => (arrive = done)));
  await cache.get('big', () => Promise.resolve(strip(8)));
  let asked = 0;
  const again = cache.get('slow', () => {
    asked += 1;
    return Promise.resolve(strip(1));
  });
  assert.equal(asked, 0, 'the one arriving is the one asked for again');
  arrive(strip(2));
  assert.equal((await again)?.data.byteLength, 2);
  assert.equal(await waiting, await again);
});
