import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Cards } from '../../player/cards.ts';
import { type Dress, plainDress } from '../../player/dressing.ts';
import type { Picture } from '../../player/picture.ts';
import { displayNode, horseOf, unhorsed } from './appearanceDisplay.ts';

/** A forge that counts the pictures asked of it, each answered by `answer` (a picture by default). */
function countingForge(answer: () => Promise<Picture | null> = () => Promise.resolve(null)) {
  const asked: string[] = [];
  const forge = {
    picture: (dress: Dress) => {
      asked.push(JSON.stringify(dress));
      return answer();
    },
  } as unknown as Cards;
  return { forge, asked };
}
const horse = (coat: string, dye: string | null = null): Dress => ({
  ...plainDress('human', 0.3),
  outfit: { ...plainDress('human', 0.3).outfit, coat, dye },
});

test("the horse is one picture whatever the rider's dye; the figure one whatever the coat and barding", () => {
  const { forge, asked } = countingForge();
  horseOf(forge, horse('dun'));
  horseOf(forge, horse('dun', 'coral'));
  assert.equal(asked.length, 1, 'a new dye composes no new horse');
  const armoured = horse('dun');
  horseOf(forge, { ...armoured, outfit: { ...armoured.outfit, armour: { cuirass: 'steel' } } });
  horseOf(forge, { ...armoured, race: 'anole' });
  assert.equal(asked.length, 1, "the rider's armour and race compose no new horse");
  horseOf(forge, { ...armoured, outfit: { ...armoured.outfit, barding: 'dawnfire' } });
  assert.equal(asked.length, 2, 'a barding does');
  const figure = unhorsed({ ...horse('dun'), outfit: { ...horse('dun').outfit, barding: 'dawnfire' } });
  assert.deepEqual(figure, unhorsed(horse('grey')), 'the figure kept for one coat serves another');
});

test('the pictures kept let go of the least lately shown, not the first asked', () => {
  const { forge, asked } = countingForge();
  const first = horse('palomino');
  horseOf(forge, first, 0);
  for (let view = 1; view <= 96; view++) {
    horseOf(forge, horse('black'), view);
    if (view % 10 === 0) horseOf(forge, first, 0);
  }
  const before = asked.length;
  horseOf(forge, first, 0);
  assert.equal(asked.length, before, 'the horse shown all along is still kept');
});

test('a request that fails lets go of its own picture only, never a newer one asked under its name', async () => {
  let fail: (error: Error) => void = () => undefined;
  const failing = () => new Promise<Picture | null>((_resolve, reject) => (fail = reject));
  const { forge, asked } = countingForge(failing);
  const dress = horse('white');
  horseOf(forge, dress, 4);
  const failNow = fail;
  // The failing request is pushed out by 96 others, then asked again under the same name.
  for (let view = 100; view < 196; view++) horseOf(forge, horse('dun'), view);
  horseOf(forge, dress, 4);
  failNow(new Error('lost'));
  await new Promise((done) => setTimeout(done));
  const before = asked.length;
  horseOf(forge, dress, 4);
  assert.equal(asked.length, before, 'the newer request is kept');
});

test('the display draws the figure alone, standing clear of its frame at the top', async () => {
  const tall: Picture = {
    width: 10,
    height: 100,
    pixels: new Uint8ClampedArray(10 * 100 * 4).fill(255),
    root: [5, 99],
  };
  const { forge, asked } = countingForge(() => Promise.resolve(tall));
  const dress = plainDress('human', 0.987);
  displayNode(forge, dress, 300, 500, 0, true);
  await new Promise((done) => setTimeout(done));
  const node = displayNode(forge, dress, 300, 500, 0, true);
  assert.equal(asked.length, 1, 'one picture, no horse');
  const drawn = node?.children?.[0];
  const figure = drawn && typeof drawn === 'object' ? drawn.children?.[0] : null;
  const height = figure && typeof figure === 'object' ? Number(figure.height) : 0;
  assert.ok(height > 0 && height <= 450, `the figure stands within nine tenths of the display: ${height}`);
});
