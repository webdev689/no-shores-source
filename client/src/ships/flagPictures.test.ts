import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SHIP_PICTURE_TEXELS } from '../textures/shipPictures.ts';
import { DRESSES, SHIP_SIDES } from './dress.ts';
import { flagPictures } from './flagPictures.ts';

const texel = (rgba: Uint8Array, x: number, y: number) => [
  ...rgba.slice((y * SHIP_PICTURE_TEXELS + x) * 4, (y * SHIP_PICTURE_TEXELS + x) * 4 + 3),
];

test("each side's flag is its ground, a faction's bearing its emblem in the middle", () => {
  const flags = flagPictures().slice(0, SHIP_SIDES.length);
  assert.equal(flags.length, SHIP_SIDES.length, 'the sides first, the dresses and emblems after');
  flags.forEach((flag, index) => {
    const side = SHIP_SIDES[index] ?? 'player';
    const ground = DRESSES[side].flag.map((channel) => channel * 255);
    texel(flag.rgba, 1, 1).forEach((channel, place) => assert.ok(Math.abs(channel - (ground[place] ?? 0)) < 12, side));
    const differs = [...Array(SHIP_PICTURE_TEXELS).keys()].some((x) =>
      texel(flag.rgba, x, SHIP_PICTURE_TEXELS / 2).some(
        (channel, place) => Math.abs(channel - (ground[place] ?? 0)) > 40,
      ),
    );
    assert.equal(differs, DRESSES[side].emblem !== null, `${side}'s emblem across its middle`);
  });
  assert.deepEqual(flagPictures()[2]?.rgba, flags[2]?.rgba, 'the same bytes every time');
});

const luminance = (rgb: readonly number[]) => {
  const [red = 0, green = 0, blue = 0] = rgb.map((channel) => {
    const share = channel / 255;
    return share <= 0.03928 ? share / 12.92 : ((share + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
};
const contrast = (one: readonly number[], other: readonly number[]) => {
  const [low, high] = [luminance(one), luminance(other)].sort((a, b) => a - b);
  return ((high ?? 0) + 0.05) / ((low ?? 0) + 0.05);
};

test("the Grey Tithe's emblem stands out on its flag at fight range", () => {
  const flags = flagPictures();
  const groundOf = (side: (typeof SHIP_SIDES)[number]) =>
    texel(flags[SHIP_SIDES.indexOf(side)]?.rgba ?? new Uint8Array(), 1, 1);
  for (const side of ['tithe'] as const) {
    const flag = flags[SHIP_SIDES.indexOf(side)]?.rgba ?? new Uint8Array();
    const across = [...Array(SHIP_PICTURE_TEXELS).keys()].map((x) => texel(flag, x, SHIP_PICTURE_TEXELS / 2));
    const best = Math.max(...across.map((one) => contrast(one, groundOf(side))));
    assert.ok(best >= 3, `${side}'s emblem at ${best.toFixed(2)} : 1 on its ground`);
  }
});
