import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { Strip } from '../forge/compose.ts';
import { type DyeTable, PaletteSnap, type Rgb } from '../forge/dyes.ts';
import {
  type FrameSource,
  type FramesTable,
  type Wielded,
  FramePainter,
  layByDepth,
  layerPath,
  looksAsked,
  runPicture,
  weaponPicture,
  wholePath,
  wieldedOf,
} from './fpFrames.ts';

/** Sixteen greys darkest first, the band every metal is rendered in, and each test metal laid on its own hue. */
const band: Rgb[] = Array.from({ length: 16 }, (_unused, step) => [step * 16 + 8, step * 16 + 8, step * 16 + 8]);
const hue = (red: number, green: number, blue: number): Rgb[] =>
  band.map(([grey]) => [
    Math.round((grey * red) / 255),
    Math.round((grey * green) / 255),
    Math.round((grey * blue) / 255),
  ]);
const dyes: DyeTable = {
  palette: [[0, 0, 0], ...band, [255, 0, 0], [0, 0, 255], ...hue(255, 0, 0), ...hue(0, 255, 0), ...hue(0, 0, 255)],
  clothing: {},
  armour: { Steel: band, Iron: hue(255, 0, 0), Ebony: hue(0, 255, 0), Daedric: hue(0, 0, 255) },
};
const painter = new FramePainter(dyes, new PaletteSnap(dyes.palette));

/** A one-row strip: a colour a texel, clear where null. */
function strip(texels: readonly (readonly [number, number, number] | null)[]): Strip {
  const data = new Uint8Array(texels.length * 4);
  texels.forEach((texel, index) => {
    if (texel) data.set([...texel, 255], index * 4);
  });
  return { width: texels.length, height: 1, data };
}

function sourceOf(strips: Record<string, Strip>, placed: readonly string[]): FrameSource & { asked: string[] } {
  const frames: FramesTable = Object.fromEntries(placed.map((path) => [path, { at: [100, 50] as const }]));
  const asked: string[] = [];
  return {
    asked,
    frames,
    dyes,
    painter,
    strip: (path) => {
      asked.push(path);
      return Promise.resolve(strips[path] ?? null);
    },
  };
}

const grey = (step: number) => band[step] ?? [0, 0, 0];

/** The weapon a layer names, which every layer here does. */
function wield(layer: string | null): Wielded {
  const wielded = wieldedOf(layer);
  if (!wielded) throw new Error(`${layer} is no weapon`);
  return wielded;
}
const pixelAt = (pixels: Uint8Array, texel: number) => [...pixels.subarray(texel * 4, texel * 4 + 4)];

test('a weapon layer names its kind, metal, make and bow type; empty hands are fists', () => {
  assert.deepEqual(wieldedOf('sword_iron'), { kind: 'sword', metal: 'Iron', make: 'Iron', bow: null });
  assert.deepEqual(wieldedOf('sword_orcish_short_l'), {
    kind: 'sword',
    metal: 'Orcish',
    make: 'OrcishShort',
    bow: null,
  });
  assert.deepEqual(wieldedOf('bow_short_elven'), { kind: 'bow', metal: 'Elven', make: 'Elven', bow: 'Short' });
  assert.equal(wieldedOf('bow_long_iron')?.bow, 'Long');
  assert.deepEqual(wieldedOf('axe'), { kind: 'axe', metal: null, make: null, bow: null });
  assert.equal(wieldedOf(null)?.kind, 'fists');
  assert.equal(wieldedOf('crossbow_iron'), null);
});

test('pictures are named by file, record, frame and look; a left hand asks its own twins first', () => {
  assert.equal(wholePath('WEAPON04', 0, 0, 'Left'), 'forge/WEAPON04/WEAPON04.CIF_0-0_Left.png');
  assert.equal(wholePath('WEAPON05', 3, 2, null), 'forge/WEAPON05/WEAPON05.CIF_3-2.png');
  assert.equal(
    layerPath('WEAPON02', 1, 2, 'hand', 'Iron', true),
    'forge/WEAPON02/layers/WEAPON02.CIF_1-2_hand_Iron_z.png',
  );
  assert.deepEqual(looksAsked('Iron', false), ['Iron', null]);
  assert.deepEqual(looksAsked('Iron', true), ['IronLeft', 'Left', 'Iron', null]);
  assert.deepEqual(looksAsked(null, true), ['Left', null]);
});

test('greys go to the nearest band step of the metal, other colours to the palette, half-clear texels clear', () => {
  const pixels = painter.paint(
    {
      width: 3,
      height: 1,
      data: new Uint8Array([200, 200, 200, 255, 250, 10, 10, 255, 9, 9, 9, 100]),
    },
    dyes.armour.Iron ?? null,
  );
  assert.deepEqual(pixelAt(pixels, 0), [...(dyes.armour.Iron?.[12] ?? []), 255]);
  const snapped = pixelAt(pixels, 1);
  assert.ok(dyes.palette.some((colour) => colour.join() === snapped.slice(0, 3).join()));
  assert.deepEqual([snapped[1], snapped[2], snapped[3]], [0, 0, 255]);
  assert.equal(pixels[11], 0);
});

test('a metal with no frame of its own falls back to the shared frame, dyed by its metal and placed', async () => {
  const shared = wholePath('WEAPON05', 1, 0, null);
  const source = sourceOf({ [shared]: strip([grey(15), null]) }, [shared]);
  const picture = await weaponPicture(
    source,
    { kind: 'mace', metal: 'Ebony', make: 'Ebony', bow: null },
    none,
    1,
    0,
    false,
  );
  assert.deepEqual(source.asked, [wholePath('WEAPON05', 1, 0, 'Ebony'), shared]);
  assert.deepEqual(picture?.at, [100, 50]);
  assert.deepEqual(pixelAt(picture?.pixels ?? new Uint8Array(), 0), [...(dyes.armour.Ebony?.[15] ?? []), 255]);
  assert.equal(picture?.pixels[7], 0);
});

const none = { hands: null, feet: null };

test('a kick wears the boots and a punch the gauntlets; bare fists take iron, a guild set its own colours', async () => {
  const kick = wholePath('WEAPON10', 1, 0, 'Daedric');
  const punch = wholePath('WEAPON10', 2, 0, 'Fighters');
  const bare = wholePath('WEAPON10', 2, 0, null);
  const source = sourceOf({ [kick]: strip([grey(4)]), [punch]: strip([grey(4)]), [bare]: strip([grey(4)]) }, [
    kick,
    punch,
    bare,
  ]);
  const fists = wield(null);
  const worn = { hands: 'Fighters', feet: 'Daedric' };
  const kicked = await weaponPicture(source, fists, worn, 1, 0, false);
  const punched = await weaponPicture(source, fists, worn, 2, 0, false);
  const barehanded = await weaponPicture(source, fists, none, 2, 0, false);
  assert.deepEqual(pixelAt(kicked?.pixels ?? new Uint8Array(), 0), [...(dyes.armour.Daedric?.[4] ?? []), 255]);
  assert.deepEqual(pixelAt(punched?.pixels ?? new Uint8Array(), 0), [...grey(4), 255]);
  assert.deepEqual(pixelAt(barehanded?.pixels ?? new Uint8Array(), 0), [...(dyes.armour.Iron?.[4] ?? []), 255]);
});

test('a dye worn takes the gauntlets and boots, whatever their set, and leaves bare fists and the blade', async () => {
  const punch = wholePath('WEAPON10', 2, 0, 'Fighters');
  const kick = wholePath('WEAPON10', 1, 0, 'Daedric');
  const bare = wholePath('WEAPON10', 2, 0, null);
  const plain = sourceOf({ [punch]: strip([grey(4)]), [kick]: strip([grey(4)]), [bare]: strip([grey(4)]) }, [
    punch,
    kick,
    bare,
  ]);
  const source = { ...plain, dye: dyes.armour.Ebony ?? null };
  const fists = wield(null);
  const worn = { hands: 'Fighters', feet: 'Daedric' };
  const green = [...(dyes.armour.Ebony?.[4] ?? []), 255];
  assert.deepEqual(
    pixelAt((await weaponPicture(source, fists, worn, 2, 0, false))?.pixels ?? new Uint8Array(), 0),
    green,
  );
  assert.deepEqual(
    pixelAt((await weaponPicture(source, fists, worn, 1, 0, false))?.pixels ?? new Uint8Array(), 0),
    green,
  );
  const barehanded = await weaponPicture(source, fists, none, 2, 0, false);
  assert.deepEqual(pixelAt(barehanded?.pixels ?? new Uint8Array(), 0), [...(dyes.armour.Iron?.[4] ?? []), 255]);
});

test('the nearer of hand and weapon shows where both are drawn, either alone where only it is', () => {
  const hand = new Uint8Array([1, 1, 1, 255, 1, 1, 1, 255, 1, 1, 1, 255, 0, 0, 0, 0]);
  const weapon = new Uint8Array([2, 2, 2, 255, 2, 2, 2, 255, 0, 0, 0, 0, 2, 2, 2, 255]);
  const handDepth = strip([[1, 0, 0], [0, 5, 0], [0, 0, 0], null]);
  const weaponDepth = strip([[0, 200, 0], [0, 6, 0], null, [9, 9, 0]]);
  const laid = layByDepth(hand, handDepth, weapon, weaponDepth);
  assert.deepEqual(
    [0, 1, 2, 3].map((texel) => laid[texel * 4]),
    [2, 1, 1, 2],
  );
});

test('a layered blade marks only its blade', () => {
  const hand = new Uint8Array([1, 1, 1, 255, 1, 1, 1, 255, 0, 0, 0, 0]);
  const weapon = new Uint8Array([2, 2, 2, 255, 2, 2, 2, 255, 2, 2, 2, 255]);
  const handDepth = strip([[0, 1, 0], [0, 9, 0], null]);
  const weaponDepth = strip([
    [0, 5, 0],
    [0, 5, 0],
    [0, 5, 0],
  ]);
  const mask = new Uint8Array(3);
  layByDepth(hand, handDepth, weapon, weaponDepth, mask);
  assert.deepEqual([...mask], [0, 1, 1], 'the hand over its grip, the blade nearer, the blade alone');
});

test('a sword lays its hand and blade by depth, each in its own colours; without both layers it draws whole', async () => {
  const layerAt = (layer: 'hand' | 'weapon', look: string | null, depth = false) =>
    layerPath('WEAPON04', 0, 0, layer, look, depth);
  const strips = {
    [layerAt('hand', 'Daedric')]: strip([grey(8), grey(8)]),
    [layerAt('hand', 'Daedric', true)]: strip([
      [0, 10, 0],
      [0, 10, 0],
    ]),
    [layerAt('weapon', 'Iron')]: strip([grey(8), null]),
    [layerAt('weapon', 'Iron', true)]: strip([[0, 5, 0], null]),
  };
  const source = sourceOf(strips, [layerAt('hand', 'Daedric'), layerAt('weapon', 'Iron')]);
  const sword = wield('sword_iron');
  const picture = await weaponPicture(source, sword, { hands: 'Daedric', feet: null }, 0, 0, false);
  assert.deepEqual(pixelAt(picture?.pixels ?? new Uint8Array(), 0), [...(dyes.armour.Iron?.[8] ?? []), 255]);
  assert.deepEqual(pixelAt(picture?.pixels ?? new Uint8Array(), 1), [...(dyes.armour.Daedric?.[8] ?? []), 255]);

  const whole = wholePath('WEAPON04', 0, 0, 'Iron');
  const halfSource = sourceOf({ [layerAt('hand', 'Daedric')]: strip([grey(8)]), [whole]: strip([grey(2)]) }, [whole]);
  const drawnWhole = await weaponPicture(halfSource, sword, { hands: 'Daedric', feet: null }, 0, 0, true);
  assert.ok(halfSource.asked.includes(whole));
  assert.deepEqual(pixelAt(drawnWhole?.pixels ?? new Uint8Array(), 0), [...(dyes.armour.Iron?.[2] ?? []), 255]);
});

test('a bow is laid under the hands that hold it, in the gauntlets worn', async () => {
  const bow = wholePath('WEAPON09', 0, 3, 'LongIron');
  const hands = wholePath('WEAPON09', 0, 3, 'HandsDaedric');
  const source = sourceOf({ [bow]: strip([grey(6), grey(6)]), [hands]: strip([null, grey(6)]) }, [bow, hands]);
  const wielded = wield('bow_long_iron');
  const picture = await weaponPicture(source, wielded, { hands: 'Daedric', feet: null }, 0, 3, false);
  assert.deepEqual(pixelAt(picture?.pixels ?? new Uint8Array(), 0), [...(dyes.armour.Iron?.[6] ?? []), 255]);
  assert.deepEqual(pixelAt(picture?.pixels ?? new Uint8Array(), 1), [...(dyes.armour.Daedric?.[6] ?? []), 255]);
});

test('the running arm wears the gauntlets set, else the leather glove', async () => {
  const glove = '@art/run/RUN_0-3.png';
  const source = sourceOf({ [glove]: strip([grey(5)]) }, []);
  const picture = await runPicture(source, 'Ebony', 3);
  assert.deepEqual(source.asked, ['@art/run/RUN_0-3_Ebony.png', glove]);
  assert.deepEqual(picture?.at, [177, 100]);
});
