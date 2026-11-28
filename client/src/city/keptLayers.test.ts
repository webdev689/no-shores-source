import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keptLayers } from './keptLayers.ts';

test('painted layers are kept for the next city, and the least lately worn go first past the most kept', () => {
  const kept = keptLayers(2);
  const layer = (shade: number) => [new Uint8Array([shade])];
  kept.set('stone', layer(1));
  kept.set('slate', layer(2));
  assert.equal(kept.get('stone')?.[0]?.[0], 1, 'worn again by the next city');
  kept.set('thatch', layer(3));
  assert.equal(kept.get('slate'), undefined, 'the least lately worn is let go');
  assert.deepEqual(
    ['stone', 'thatch'].map((key) => kept.get(key)?.[0]?.[0]),
    [1, 3],
  );
  kept.set('stone', layer(4));
  kept.set('slate', layer(2));
  assert.equal(kept.get('thatch'), undefined, 'painting one kept again makes it the latest');
  assert.equal(kept.get('stone')?.[0]?.[0], 4);
});
