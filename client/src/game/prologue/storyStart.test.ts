import assert from 'node:assert/strict';
import { test } from 'node:test';
import { onceFetched } from './storyStart.ts';

test("the wreck's download is made once, and made again after one that failed", async () => {
  let calls = 0;
  const outcomes = [Promise.reject(new Error('lost')), Promise.resolve('drawn')];
  const drawn = onceFetched(() => {
    calls += 1;
    return outcomes.shift() ?? Promise.resolve('again');
  });
  await assert.rejects(drawn(), /lost/);
  assert.equal(await drawn(), 'drawn', 'asked again, fetched again');
  assert.equal(await drawn(), 'drawn');
  assert.equal(calls, 2, 'once it has come, never again');
});
