import assert from 'node:assert/strict';
import { test } from 'node:test';
import { siteOfWorld } from './siteNames.ts';

test("a site reads its node's name and its island's own resource; one the world lacks reads its id", () => {
  const siteOf = siteOfWorld([{ id: 'gull-cove-outpost', name: 'Gull Cove Landing', continent: 'continent-1' }]);
  assert.deepEqual(siteOf('gull-cove-outpost'), { name: 'Gull Cove Landing', island: 'Brineglass' });
  assert.deepEqual(siteOf('far-rocks-outpost'), { name: 'Far Rocks', island: 'island goods' });
});
