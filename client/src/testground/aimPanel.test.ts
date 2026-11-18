import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AIM } from '../player/playerCamera.ts';
import { aimLine, aimPlaceOf } from './aimPanel.ts';

test("the aim's kept place reads back, each number held to its slider, and anything else is the game's own", () => {
  const own = { shoulder: AIM.shoulder, back: AIM.back, up: AIM.up, thirdZoom: AIM.thirdZoom };
  assert.deepEqual(aimPlaceOf(JSON.stringify({ shoulder: -0.3, back: 2.5, up: 0.4, thirdZoom: 1.3 })), {
    shoulder: -0.3,
    back: 2.5,
    up: 0.4,
    thirdZoom: 1.3,
  });
  assert.deepEqual(aimPlaceOf(JSON.stringify({ shoulder: 9, back: -1, up: 'high' })), {
    ...own,
    shoulder: 1.5,
    back: 0,
  });
  assert.deepEqual(aimPlaceOf(null), own);
  assert.deepEqual(aimPlaceOf('not a place'), own);
  assert.equal(
    aimLine(own),
    `shoulder: ${AIM.shoulder}, back: ${AIM.back}, up: ${AIM.up}, thirdZoom: ${AIM.thirdZoom}`,
  );
});
