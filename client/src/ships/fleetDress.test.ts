import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EMBLEMS } from '../plus/emblemArt.ts';
import { SHIP_PARTS, SHIP_PICTURE_TEXELS } from '../textures/shipPictures.ts';
import { colourOf, SHIP_SIDES } from './dress.ts';
import { DEVICES, shapeInks, signInks } from './flagDevices.ts';
import { flagPicture, flagPictures } from './flagPictures.ts';
import { DRESS_PARTS, FLAG_DESIGNS, SHIP_DRESSES, emblemFlagLayer, paintedOf, sidePainted } from './fleetDress.ts';

const number = (id: string) => SHIP_DRESSES.findIndex((entry) => entry.id === id);
const FIRST_FLAG = SHIP_PARTS.length;

test('the dresses read whole: one start a part, every part one the wire numbers, every device drawn', () => {
  for (const part of DRESS_PARTS) {
    const starts = SHIP_DRESSES.filter((entry) => entry.part === part && entry.source.kind === 'start');
    assert.equal(starts.length, 1, part);
    assert.equal(starts[0]?.colour === null, part !== 'flag', `${part}'s start is as built, but the flag's own blue`);
  }
  for (const entry of SHIP_DRESSES) {
    assert.ok((DRESS_PARTS as readonly string[]).includes(entry.part), entry.id);
    if (entry.colour) assert.match(entry.colour, /^#[0-9a-f]{6}$/, entry.id);
    if (entry.ink) assert.match(entry.ink, /^#[0-9a-f]{6}$/, entry.id);
    if (entry.part === 'canvas' && entry.device) assert.equal(entry.device, 'cloths', entry.id);
    if (entry.part === 'flag' && entry.device && entry.device !== 'emblem')
      assert.ok(DEVICES.includes(entry.device), entry.id);
  }
});

test("a ship's four dresses paint its hull, stripe and canvas, its cloths turn about, and fly its flag", () => {
  const plain = paintedOf(
    [number('bare_timber'), number('unbanded'), number('plain_canvas'), number('overlook_flag')],
    0,
  );
  assert.deepEqual([plain.hull, plain.stripe, plain.canvas, plain.ink], [null, null, null, null], 'as built');
  assert.equal(
    plain.flagLayer,
    FIRST_FLAG + FLAG_DESIGNS.findIndex((design) => design.id === 'overlook_flag') + SHIP_SIDES.length,
  );
  const dressed = paintedOf(
    [number('oxblood'), number('gold_leaf'), number('harbour_cloths'), number('red_saltire')],
    0,
  );
  assert.deepEqual(dressed.hull, colourOf('#6e2a22'));
  assert.deepEqual(dressed.stripe, colourOf('#d4ae55'));
  assert.deepEqual([dressed.canvas, dressed.ink], [colourOf('#f0ebdf'), colourOf('#2f5d9a')]);
  const saltire = FLAG_DESIGNS.findIndex((design) => design.id === 'red_saltire');
  assert.equal(dressed.flagLayer, FIRST_FLAG + SHIP_SIDES.length + saltire);
  // One not of its part, or none, is drawn as built.
  const wrong = paintedOf([number('red_saltire'), 9_999], 0);
  assert.deepEqual([wrong.hull, wrong.stripe, wrong.canvas], [null, null, null]);
  assert.equal(sidePainted('tithe').flagLayer, FIRST_FLAG + SHIP_SIDES.indexOf('tithe'));
});

test('a flag bearing its player’s emblem flies the flag of the emblem they wear', () => {
  const flown = (emblem: number) => paintedOf([0, 0, 0, number('your_emblem')], emblem).flagLayer;
  assert.equal(flown(3), emblemFlagLayer(3));
  assert.notEqual(flown(3), flown(4));
  assert.equal(flown(9_999), emblemFlagLayer(0), "an emblem it does not know flies Overlook's");
  assert.equal(flagPictures().length, SHIP_SIDES.length + FLAG_DESIGNS.length + EMBLEMS.length);
  const last = flagPicture(emblemFlagLayer(EMBLEMS.length - 1), FIRST_FLAG);
  assert.equal(last?.width, SHIP_PICTURE_TEXELS, 'every emblem has its flag among the ship pictures');
});

test('each flag is painted the same every time, its device in its ink over its ground', () => {
  const [first, again] = [flagPictures(), flagPictures()];
  assert.equal(first, again, 'painted once');
  const cross = flagPicture(paintedOf([0, 0, 0, number('harbour_cross')], 0).flagLayer, FIRST_FLAG);
  assert.ok(cross);
  const texelAt = (x: number, y: number) => [
    ...(cross?.rgba.slice((y * SHIP_PICTURE_TEXELS + x) * 4, (y * SHIP_PICTURE_TEXELS + x) * 4 + 3) ?? []),
  ];
  const middle = SHIP_PICTURE_TEXELS >> 1;
  // The cross's bar runs through the middle row; a corner is its blue ground.
  assert.ok((texelAt(middle, middle)[0] ?? 0) > 180, `white on the bar: ${texelAt(middle, middle)}`);
  assert.ok((texelAt(2, 2)[2] ?? 0) > (texelAt(2, 2)[0] ?? 0), `blue in its corner: ${texelAt(2, 2)}`);
});

test('a shape inks where it lies on the flag, and a sign inks its own pixels in the middle', () => {
  assert.equal(shapeInks('bar', 0.5, 0.5), true);
  assert.equal(shapeInks('bar', 0.5, 0.1), false);
  assert.equal(shapeInks('quarters', 0.2, 0.2), false);
  assert.equal(shapeInks('quarters', 0.8, 0.2), true);
  assert.equal(shapeInks('star', 0.5, 0.5), true);
  assert.equal(shapeInks('star', 0.05, 0.05), false);
  assert.equal(shapeInks('anchor', 0.5, 0.5), null, 'a sign is no shape');
  assert.equal(signInks('cross', 32, 32, 64), null, 'a shape is no sign');
  const inked = Array.from({ length: 64 * 64 }, (unused, texel) =>
    signInks('anchor', texel % 64, Math.floor(texel / 64), 64),
  );
  assert.ok(inked.filter(Boolean).length > 40, 'the anchor inks its pixels');
  assert.equal(signInks('anchor', 0, 0, 64), false, 'and leaves its corner the ground');
});
