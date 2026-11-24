import assert from 'node:assert/strict';
import { test } from 'node:test';
import { countingGpu } from '../../gpuForTests.ts';
import { onceFetched } from './storyStart.ts';
import { type WreckDrawn, WreckScenery } from './wreckScenery.ts';
import type { WreckLayout } from './wreckLayout.ts';

const LAYOUT = { dry: [], zones: [] } as unknown as WreckLayout;

test('a wreck whose download failed is asked for again as the next beat that shows it begins, and waited for', async () => {
  let calls = 0;
  const drawn = onceFetched<WreckDrawn>(() => {
    calls += 1;
    return calls === 1 ? Promise.reject(new Error('lost')) : new Promise<WreckDrawn>(() => undefined);
  });
  const quiet = console.error;
  console.error = () => undefined;
  const scenery = new WreckScenery(countingGpu().gpu, drawn, LAYOUT, [0, 0]);
  await new Promise((resolve) => setTimeout(resolve, 0));
  console.error = quiet;
  assert.ok(!scenery.coming, 'the first download lost: the beat goes on over the sea');
  scenery.again();
  assert.ok(scenery.coming, 'the next beat waits for it again');
  assert.equal(calls, 2, 'fetched again');
  scenery.again();
  assert.equal(calls, 2, 'not again while it is on its way');
});
