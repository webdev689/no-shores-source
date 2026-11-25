import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fakeBucket } from './botForTests.ts';
import { serveMedia } from './media.ts';

const PICTURE_ID = 'a'.repeat(32);

test('pictures: a kept picture may be cached for a day at most, so one removed stops showing by the next', async () => {
  const bucket = fakeBucket();
  await bucket.put(`media/${PICTURE_ID}`, new Uint8Array([1, 2, 3]), { httpMetadata: { contentType: 'image/png' } });
  const served = await serveMedia(bucket, `/v1/media/${PICTURE_ID}.png`);
  assert.equal(served.status, 200);
  const cache = String(served.headers.get('cache-control'));
  assert.doesNotMatch(cache, /immutable/);
  const life = Number(/max-age=(\d+)/.exec(cache)?.[1] ?? Infinity);
  assert.ok(life <= 86_400, cache);
  await bucket.delete(`media/${PICTURE_ID}`);
  assert.equal((await serveMedia(bucket, `/v1/media/${PICTURE_ID}.png`)).status, 404);
});
