import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Cards } from '../../player/cards.ts';
import { type Dress, plainDress } from '../../player/dressing.ts';
import type { Picture } from '../../player/picture.ts';
import { horseOf, unhorsed } from './appearanceDisplay.ts';

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

test("the horse is one picture whatever the rider's dye; the figure one whatever the coat and barding", async () => {
  const { forge, asked } = countingForge();
  await horseOf(forge, horse('dun'));
  await horseOf(forge, horse('dun', 'coral'));
  assert.equal(asked.length, 1, 'a new dye composes no new horse');
  const armoured = horse('dun');
  await horseOf(forge, { ...armoured, outfit: { ...armoured.outfit, armour: { cuirass: 'steel' } } });
  await horseOf(forge, { ...armoured, race: 'anole' });
  assert.equal(asked.length, 1, "the rider's armour and race compose no new horse");
  await horseOf(forge, { ...armoured, outfit: { ...armoured.outfit, barding: 'dawnfire' } });
  assert.equal(asked.length, 2, 'a barding does');
  const figure = unhorsed({ ...horse('dun'), outfit: { ...horse('dun').outfit, barding: 'dawnfire' } });
  assert.deepEqual(figure, unhorsed(horse('grey')), 'the figure kept for one coat serves another');
});

test('the pictures kept let go of the least lately shown, not the first asked', async () => {
  const { forge, asked } = countingForge();
  const first = horse('palomino');
  await horseOf(forge, first, 0);
  for (let view = 1; view <= 96; view++) {
    await horseOf(forge, horse('black'), view);
    if (view % 10 === 0) await horseOf(forge, first, 0);
  }
  const before = asked.length;
  await horseOf(forge, first, 0);
  assert.equal(asked.length, before, 'the horse shown all along is still kept');
});

test('a request that fails lets go of its own picture only, never a newer one asked under its name', async () => {
  let fail: (error: Error) => void = () => undefined;
  const failing = () => new Promise<Picture | null>((_resolve, reject) => (fail = reject));
  const { forge, asked } = countingForge(failing);
  const dress = horse('white');
  const failed = horseOf(forge, dress, 4);
  const failNow = fail;
  // The failing request is pushed out by 96 others, then asked again under the same name.
  for (let view = 100; view < 196; view++) void horseOf(forge, horse('dun'), view);
  void horseOf(forge, dress, 4);
  failNow(new Error('lost'));
  assert.equal(await failed, null);
  const before = asked.length;
  void horseOf(forge, dress, 4);
  assert.equal(asked.length, before, 'the newer request is kept');
});
