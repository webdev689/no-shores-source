import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lengthwise, turnedBounds, weaponScale } from './weaponPicture.ts';

/** A picture `width` by `height` with the pixels `drawn` ([column, row]) opaque. */
function picture(width: number, height: number, drawn: readonly (readonly [number, number])[]): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (const [column, row] of drawn) pixels[(row * width + column) * 4 + 3] = 255;
  return pixels;
}
const line = (length: number, placed: (step: number) => readonly [number, number]) =>
  Array.from({ length }, (unused, step) => placed(step));

test('a blade standing upright is turned a quarter, its point to the right; one lying level stays', () => {
  const upright = picture(
    3,
    20,
    line(20, (step) => [1, step]),
  );
  assert.equal(lengthwise(3, 20, upright), Math.PI / 2);
  const level = picture(
    20,
    3,
    line(20, (step) => [step, 1]),
  );
  assert.equal(lengthwise(20, 3, level), 0);
  // A sword leaning a little from upright still takes the square quarter turn, so its pixels stay square.
  const leaning = picture(
    6,
    24,
    line(24, (step) => [Math.floor(step / 6), step]),
  );
  assert.equal(lengthwise(6, 24, leaning), Math.PI / 2);
});

test('a gun held slantwise is turned its own way so its high end, its muzzle, points right', () => {
  const rising = picture(
    20,
    20,
    line(20, (step) => [step, 19 - step]),
  );
  assert.ok(Math.abs(lengthwise(20, 20, rising) - Math.PI / 4) < 1e-9, 'lower left to upper right');
  const falling = picture(
    20,
    20,
    line(20, (step) => [step, step]),
  );
  assert.ok(Math.abs(lengthwise(20, 20, falling) - (3 * Math.PI) / 4) < 1e-9, 'upper left to lower right');
});

test('a picture not long and thin, a shield with its blade, stands as it is', () => {
  const round = picture(
    9,
    9,
    line(81, (step) => [step % 9, Math.floor(step / 9)]),
  );
  assert.equal(lengthwise(9, 9, round), 0);
  assert.equal(lengthwise(4, 4, picture(4, 4, [])), 0, 'nor one with nothing drawn');
});

test('a turned picture is fitted by the band its pixels fill, by whole pixels where its turn is square', () => {
  const upright = picture(
    3,
    20,
    line(20, (step) => [1, step]),
  );
  const [, , across, down] = turnedBounds(3, 20, upright, Math.PI / 2);
  assert.deepEqual([Math.round(across), Math.round(down)], [20, 1], 'one pixel thick, twenty long');
  const rising = picture(
    20,
    20,
    line(20, (step) => [step, 19 - step]),
  );
  const slant = turnedBounds(20, 20, rising, Math.PI / 4);
  assert.ok(slant[3] < 3 && slant[2] > 28, `a slant band, not its square: ${slant.join(', ')}`);
  assert.deepEqual(weaponScale(49, 12, 116, 36, 1, true), { scale: 2, crisp: true });
  assert.deepEqual(weaponScale(66, 4, 116, 36, 1, false), { scale: 116 / 66, crisp: false });
  assert.equal(weaponScale(13, 6, 116, 36, 1, true).scale, 4, 'never past four screen pixels to one');
});
