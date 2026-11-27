import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DROPPED, type GearDrop, type GearItem } from '../network/gearMessages.ts';
import type { PixelPicture } from './dropPictures.ts';
import { PILLAR_M } from './dropLight.ts';
import { DropsShown, PIXEL_M, markPicture } from './drops.ts';
import { KINDS } from '../player/gear.ts';
import { PX_PER_M } from '../player/figures.ts';
import { VESTIGE_M, lyingPicture, lyingPixelM } from './itemDrops.ts';
import { MARK_FLOATS } from './marks.ts';

const EYE = [0, 0, 1.6] as const;
const REST = [0, -8, 0.5] as const;

/** A picture of `width` by `height` pixels, a margin of `margin` clear all round a block of two colours. */
function picture(width: number, height: number, margin: number) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let row = margin; row < height - margin; row++)
    for (let across = margin; across < width - margin; across++)
      pixels.set(across < width / 2 ? [200, 10, 10, 255] : [10, 10, 200, 255], (row * width + across) * 4);
  return { width, height, pixels };
}

const SWORD = { kind: 2, rarity: 3, level: 9, name: 0 } as unknown as GearItem;
const lying = (fields: Partial<GearDrop>): GearDrop => ({
  id: 5,
  rarity: 3,
  slot: 0,
  at: REST,
  kind: DROPPED.item,
  from: REST,
  flying: 0,
  tier: 0,
  poured: false,
  item: SWORD,
  ...fields,
});

test("an item's picture lies as a drop's: cropped to what it draws, its longest side a Vestige's frame", () => {
  const laid = lyingPicture(picture(40, 12, 2));
  assert.deepEqual([laid.rows.length, laid.rows[0]?.length], [8, 36], 'its clear margin cut away');
  assert.equal(laid.colours.length, 2, 'each colour once');
  assert.ok(
    laid.rows.every((row) => /^a{18}b{18}$/.test(row)),
    'each pixel its colour, in place',
  );
  assert.ok(Math.abs(36 * (laid.pixelM ?? PIXEL_M) - VESTIGE_M) < 1e-9, 'as long as a Vestige is tall');
  const upright = lyingPicture(picture(10, 30, 0));
  assert.ok(Math.abs(30 * (upright.pixelM ?? PIXEL_M) - VESTIGE_M) < 1e-9, 'a tall piece as tall as a Vestige');
  const clear = lyingPicture({ width: 3, height: 3, pixels: new Uint8ClampedArray(36) });
  assert.equal(clear.rows.length, 0, 'nothing drawn, nothing laid');
});

test("an armour piece lies at its worn size, not stretched to a weapon's length", () => {
  const helm = picture(24, 20, 2);
  const laid = lyingPicture(helm, lyingPixelM(KINDS.indexOf('head')));
  assert.equal(laid.pixelM, 1 / PX_PER_M, "its pixel the figure's, so it is drawn twice as large as worn");
  assert.deepEqual([laid.rows.length, laid.rows[0]?.length], [16, 20], 'still cropped');
  for (const kind of ['head', 'torso', 'arms', 'legs', 'cloak'] as const)
    assert.equal(lyingPixelM(KINDS.indexOf(kind)), 1 / PX_PER_M, kind);
  for (const kind of ['sword', 'bow', 'pistolet', 'greatsword'] as const)
    assert.equal(lyingPixelM(KINDS.indexOf(kind)), undefined, `${kind} keeps a Vestige's length`);
});

test("an item at rest is its own picture in its rarity's light, and lands in its rarity for its sound", () => {
  const laid: PixelPicture = lyingPicture(picture(20, 6, 0));
  const asked: GearItem[] = [];
  const drops = new DropsShown(
    (item) => {
      asked.push(item);
      return laid;
    },
    () => true,
  );
  const flying = lying({ flying: 94 });
  const first = drops.frame([flying], 0, EYE);
  assert.deepEqual(asked, [SWORD], 'its picture asked of the item itself');
  assert.ok(first.marks.length > 0, 'its picture in flight');
  const rested = drops.frame([flying], 10, EYE);
  assert.deepEqual(
    rested.landed.map((landing) => landing.rarity),
    [3],
    'it lands as a Vestige of its rarity does, for its sound',
  );
  const unseen = new DropsShown(
    () => null,
    () => true,
  ).frame([lying({})], 10, EYE);
  assert.ok(unseen.marks.length > 0, 'its picture not drawn yet: its light alone');
  assert.ok(rested.marks.length > unseen.marks.length, 'drawn, its picture in its light');
  assert.ok(PILLAR_M[3] > PILLAR_M[0], 'a rarer pillar taller');
});

test('an item turns as it hovers: its picture narrows edge on, and shows its other face mirrored', () => {
  const laid = lyingPicture(picture(20, 6, 0));
  const span = (across: number) => {
    const out: number[] = [];
    markPicture(out, laid, [0, 0, 0], [0, -5, 0], 1, 1, across);
    const eastings = out.filter((unused, index) => index % MARK_FLOATS === 0);
    return [Math.min(...eastings), Math.max(...eastings)];
  };
  const [left, right] = span(1);
  const [edgeLeft, edgeRight] = span(0);
  assert.ok(Math.abs(edgeRight - edgeLeft) < 1e-9 && right - left > 0.5, 'edge on, no width; face on, its length');
  const facing = (across: number) => {
    const out: number[] = [];
    markPicture(out, laid, [0, 0, 0], [0, -5, 0], 1, 1, across);
    // The first colour, red, laid first: which side it stands on.
    return out[0] ?? 0;
  };
  assert.ok(Math.sign(facing(1)) === -Math.sign(facing(-1)), 'turned round, mirrored');
});
