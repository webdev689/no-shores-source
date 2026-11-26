import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Slot } from '../../network/characters.ts';
import type { Dress } from '../../player/dressing.ts';
import type { Picture } from '../../player/picture.ts';
import { SlotFigures, silhouetteOf, slotDress } from './slotFigures.ts';

const LOOK = { body: 'female', race: 'anole', tone: 0.5, hair: null };
const slotOf = (place: number, look: unknown = LOOK): Slot => ({
  slot: place,
  shown: null,
  pledge: null,
  look,
  place: null,
  prologue: true,
  saved: 0,
});
const picture = (red: number): Picture => ({
  width: 1,
  height: 1,
  pixels: new Uint8ClampedArray([red, 200, 100, 255]),
});

/** A forge that draws a picture for each dress asked, one at a time, writing down the order. */
function fakeForge() {
  const drawn: string[] = [];
  let drawing = 0;
  let most = 0;
  const forge = {
    wardrobe: () => null,
    picture: async (dress: Dress) => {
      drawing += 1;
      most = Math.max(most, drawing);
      drawn.push(dress.body);
      await new Promise((done) => setImmediate(done));
      drawing -= 1;
      return picture(dress.body === 'female' ? 10 : 20);
    },
  };
  return { forge, drawn, most: () => most };
}

const settle = async () => {
  for (let turn = 0; turn < 10; turn++) await new Promise((done) => setImmediate(done));
};

test('each slot is drawn in its own look, one picture at a time, and kept until what it shows changes', async () => {
  const { forge, drawn, most } = fakeForge();
  const figures = new SlotFigures(() => forge as never);
  assert.equal(figures.figureOf(0, slotOf(0)), null, 'none until drawn');
  assert.equal(figures.figureOf(1, slotOf(1, { body: 'male', race: 'human', tone: 0.5, hair: null })), null);
  await settle();
  assert.equal(figures.figureOf(0, slotOf(0))?.pixels[0], 10);
  assert.deepEqual(drawn, ['female', 'male'], 'a broken look is the first look');
  assert.equal(most(), 1, 'one at a time');
  figures.figureOf(0, slotOf(0));
  assert.equal(drawn.length, 2, 'kept');
});

test('an empty slot shows the first look in shadow; a dress is its look and the pieces it wears', async () => {
  const { forge } = fakeForge();
  const figures = new SlotFigures(() => forge as never);
  figures.figureOf(3, null);
  await settle();
  const shadow = figures.figureOf(3, null);
  assert.deepEqual([...(shadow?.pixels ?? [])], [26, 29, 36, 255]);
  assert.deepEqual([...silhouetteOf(picture(9)).pixels], [26, 29, 36, 255], 'its alpha kept');
  assert.equal(slotDress(forge, slotOf(0)).body, 'female');
  assert.equal(new SlotFigures(() => null).figureOf(0, slotOf(0)), null, 'nothing before the forge opens');
});
