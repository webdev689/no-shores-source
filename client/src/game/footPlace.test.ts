import assert from 'node:assert/strict';
import { test } from 'node:test';
import { closedIfThrown } from './footPlace.ts';

test('a trip that fails after its room joined lets the link go; one that succeeds keeps it', async () => {
  let closed = 0;
  const link = { close: () => closed++ };
  await assert.rejects(
    closedIfThrown(link, () => Promise.reject(new Error('the land failed to come'))),
    /the land failed to come/,
  );
  assert.equal(closed, 1, 'let go as it failed');
  assert.equal(await closedIfThrown(link, () => Promise.resolve('here')), 'here');
  assert.equal(closed, 1, 'kept while it holds');
});
