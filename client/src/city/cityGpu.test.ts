import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MODEL_INSTANCE_LAYOUT, originInstance } from './cityGpu.ts';

test('the instance every view draws its placed solids with holds every attribute the models pipeline reads', () => {
  const ends = MODEL_INSTANCE_LAYOUT.attributes.map((attribute) => {
    const floats = Number(/x(\d)$/.exec(attribute.format)?.[1] ?? 1);
    return attribute.offset + 4 * floats;
  });
  assert.equal(originInstance().byteLength, MODEL_INSTANCE_LAYOUT.arrayStride);
  assert.ok(Math.max(...ends) <= MODEL_INSTANCE_LAYOUT.arrayStride);
});
