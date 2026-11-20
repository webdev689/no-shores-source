import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  COSMETICS,
  bardingLayer,
  bardingLook,
  cosmeticOf,
  cosmeticRamp,
  hideShade,
  rampOf,
  wornCosmetic,
} from './cosmetics.ts';

test('a look of four colours, darkest first, is laid out as a 16-step ramp through each of them', () => {
  const ramp = rampOf(['#000000', '#303030', '#606060', '#f0f0f0']);
  assert.equal(ramp.length, 16);
  assert.deepEqual(ramp[0], [0, 0, 0]);
  assert.deepEqual(ramp[5], [48, 48, 48]);
  assert.deepEqual(ramp[10], [96, 96, 96]);
  assert.deepEqual(ramp[15], [240, 240, 240]);
  // Between two anchors, each step a share of the way.
  assert.deepEqual(ramp[1], [10, 10, 10]);
  for (let step = 1; step < 16; step++) assert.ok((ramp[step]?.[0] ?? 0) >= (ramp[step - 1]?.[0] ?? 0));
});

test('the catalogue: a start piece of each kind keeps its own colours, the rest have looks', () => {
  assert.equal(cosmeticRamp('own_colours'), null);
  assert.equal(cosmeticRamp('bay'), null);
  assert.equal(cosmeticRamp('nonsense'), null);
  assert.equal(cosmeticRamp('harbour_blue')?.length, 16);
  assert.equal(bardingLayer('bare'), null);
  assert.equal(bardingLayer('ember_plate'), 'horse_warhorse');
  assert.equal(bardingLayer('harbour_blue'), null, 'a dye is no barding');
  assert.equal(bardingLook('horse_dawnfire'), 'dawnfire');
  assert.equal(cosmeticOf('coral')?.kind, 'dye');
  assert.ok(COSMETICS.every((each, number) => cosmeticOf(each.id) === COSMETICS[number]));
});

test('the cosmetic worn of a kind, by its wire number: none for the start piece, a wrong kind or no such number', () => {
  const dye = COSMETICS.findIndex((each) => each.id === 'coral');
  const coat = COSMETICS.findIndex((each) => each.id === 'grey');
  const start = COSMETICS.findIndex((each) => each.id === 'own_colours');
  assert.equal(wornCosmetic(dye, 'dye'), 'coral');
  assert.equal(wornCosmetic(coat, 'coat'), 'grey');
  assert.equal(wornCosmetic(start, 'dye'), null);
  assert.equal(wornCosmetic(dye, 'coat'), null);
  assert.equal(wornCosmetic(9999, 'dye'), null);
  assert.equal(wornCosmetic(undefined, 'dye'), null);
});

test("a coat takes the horse's hide by its light, and leaves the tack, the blanket and the mane", () => {
  const ramp = rampOf(['#000000', '#000000', '#000000', '#ff0000']);
  const hide = [140, 100, 50];
  hideShade(hide, ramp);
  assert.equal(hide[1], 0, 'the hide is the coat now');
  assert.ok((hide[0] ?? 0) > 0);
  for (const [colour, what] of [
    [[120, 40, 40], 'the red blanket'],
    [[90, 55, 40], 'the saddle'],
    [[60, 60, 64], 'the grey mane'],
  ] as const) {
    const kept = [...colour];
    hideShade(kept, ramp);
    assert.deepEqual(kept, colour, what);
  }
});
