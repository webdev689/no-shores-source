import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SHIP_PICTURE_TEXELS } from '../textures/shipPictures.ts';
import { DRESSES, SHIP_SIDES } from './dress.ts';
import { flagPictures } from './flagPictures.ts';

const texel = (rgba: Uint8Array, x: number, y: number) => [
  ...rgba.slice((y * SHIP_PICTURE_TEXELS + x) * 4, (y * SHIP_PICTURE_TEXELS + x) * 4 + 3),
];

test("each side's flag is her ground, a faction's bearing its emblem in the middle", () => {
  const flags = flagPictures();
  assert.equal(flags.length, SHIP_SIDES.length);
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
  assert.deepEqual(flagPictures()[3]?.rgba, flags[3]?.rgba, 'the same bytes every time');
});
