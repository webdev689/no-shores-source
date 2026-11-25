import assert from 'node:assert/strict';
import { test } from 'node:test';
import { toBareDomain } from './worker.ts';

test('www sends every address to the same path and query on the bare domain, for good', () => {
  const answer = toBareDomain(new Request('https://www.noshores.online/play/?at=overlook-social#x'));
  assert.equal(answer.status, 301);
  assert.equal(answer.headers.get('location'), 'https://noshores.online/play/?at=overlook-social#x');
  assert.equal(
    toBareDomain(new Request('https://www.noshores.online/')).headers.get('location'),
    'https://noshores.online/',
  );
});
