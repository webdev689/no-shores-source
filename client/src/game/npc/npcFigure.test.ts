import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Cards } from '../../player/cards.ts';
import type { Picture } from '../../player/picture.ts';
import { keeperFigure } from './npcFigure.ts';

/** Two texels drawn in a clear 4 by 4, at (1, 1) and (1, 2). */
const pixels = new Uint8ClampedArray(64);
for (const spot of [5, 9]) pixels.fill(255, spot * 4, spot * 4 + 4);
const PICTURE: Picture = { width: 4, height: 4, pixels };

/** A forge that fails its first `failures` drawings, and counts what it was asked. */
function forgeFailing(failures: number) {
  const asked = { count: 0 };
  const forge = {
    picture: () => (++asked.count <= failures ? Promise.reject(new Error('no forge')) : Promise.resolve(PICTURE)),
  } as unknown as Cards;
  return { forge, asked };
}

const settle = () => new Promise((done) => setTimeout(done));

test('a keeper figure whose drawing failed is asked for again a while on, and once drawn is grown by whole pixels', async () => {
  const { forge, asked } = forgeFailing(2);
  const build = (millis: number, still = false) => keeperFigure('tailor', forge, 200, 2, millis, still);
  assert.equal(build(0), null, 'nothing while it is drawn');
  await settle();
  assert.equal(build(500), null, 'a failure is not kept');
  assert.equal(asked.count, 2, 'nor asked again at once');
  assert.equal(build(2000), null, 'asked again a while on');
  await settle();
  assert.equal(asked.count, 4, 'the failed drawing was asked for again');
  const shown = build(2400);
  assert.ok(shown?.picture, 'drawn');
  assert.deepEqual(shown.picture.pixel, { width: 1, height: 2 }, 'trimmed to what it draws, texels kept whole');
  // 200 CSS pixels at 2 device pixels each fit 200 whole steps of the figure's two texels.
  assert.equal(shown.height, 200);
  assert.equal(shown.width, 100);
  assert.notEqual(build(3000)?.picture?.key, shown.picture.key, 'it breathes to its second frame');
  assert.equal(build(3000, true)?.picture?.key, 'keeper tailor 0', 'still with less motion');
  assert.equal(asked.count, 4, 'drawn once, then kept');
});
