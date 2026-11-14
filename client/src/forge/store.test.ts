import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { pictureRange } from './store.ts';

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
