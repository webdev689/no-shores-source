import assert from 'node:assert/strict';
import { test } from 'node:test';
import { devStart } from './wreckDevStart.ts';

test('a page under development begins the wreck at the wisp, the bow or the Storm as its address asks', () => {
  assert.deepEqual(devStart('?prologue=wreck&wisp=1'), { stage: 'wisp', wispInto: 0 });
  assert.deepEqual(devStart('?prologue=wreck&wisp=9'), { stage: 'wisp', wispInto: 8 });
  assert.deepEqual(devStart('?prologue=wreck&bow=1'), { stage: 'bow', wispInto: 0 });
  assert.deepEqual(devStart('?prologue=wreck&lash=1'), { stage: 'storm', wispInto: 0 });
  assert.equal(devStart('?prologue=wreck'), null);
  assert.equal(devStart('?prologue=wreck&wisp=0'), null);
});
