import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type FakeElement, onFakePage, withMotionReduced } from '../../combat/page.test.ts';
import type { Cards } from '../../player/cards.ts';
import type { Picture } from '../../player/picture.ts';
import { keeperFigure } from './npcFigure.ts';

const PICTURE: Picture = { width: 2, height: 2, pixels: new Uint8ClampedArray(16).fill(255) };

/** A forge that fails its first `failures` drawings, and counts what it was asked. */
function forgeFailing(failures: number) {
  const asked = { count: 0 };
  const forge = {
    picture: () => (++asked.count <= failures ? Promise.reject(new Error('no forge')) : Promise.resolve(PICTURE)),
  } as unknown as Cards;
  return { forge, asked };
}

const settle = () => new Promise((done) => setTimeout(done));
const firstChild = (stand: HTMLElement) => (stand as unknown as FakeElement).children[0];

test('a keeper figure whose drawing failed is asked for again, and once drawn its canvases are reused', async () => {
  (globalThis as { devicePixelRatio?: number }).devicePixelRatio = 1;
  const { forge, asked } = forgeFailing(2);
  let readied = 0;
  const build = () =>
    withMotionReduced(true, () => onFakePage(() => keeperFigure('tailor', forge, 200, () => readied++)));
  assert.equal(firstChild(build()), undefined, 'nothing while it is drawn');
  await settle();
  assert.equal(readied, 0, 'a failure does not ask for the page again');
  build();
  await settle();
  assert.equal(asked.count, 4, 'the failed drawing was asked for again');
  assert.equal(readied, 1);
  const shown = firstChild(build());
  assert.ok(shown, 'drawn');
  assert.equal(firstChild(build()), shown, 'the same canvas, not composed again');
});
