import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AMMO_BOX } from './dropPictures.ts';
import { MARK_FLOATS, ditherCode } from './marks.ts';
import { MIN_RAD, MOST, REACH_M, WIDTH_M, litMarksSeen, marksSeen } from './marksOver.ts';

/** The widest a laid mark stands across, metres, from its vertices. */
const widthOf = (vertices: readonly number[]): number => {
  const across = vertices.filter((unused, index) => index % MARK_FLOATS === 0);
  return Math.max(...across) - Math.min(...across);
};

test('a mark is WIDTH_M across near, never narrower on the screen than MIN_RAD far, faded at the end of its reach', () => {
  const picture = AMMO_BOX;
  const over = [0, 0, 2] as const;
  const seen = (far: number) => marksSeen([{ picture, at: over }], [0, -far, 2], 0, true);
  assert.ok(Math.abs(widthOf(seen(3)) - WIDTH_M) < 0.05, 'WIDTH_M across, near');
  const far = 25;
  assert.ok(Math.abs(widthOf(seen(far)) - 2 * far * Math.tan(MIN_RAD)) < 0.1, 'wider far off, so it still shows');
  const opacities = (vertices: readonly number[]) => vertices.filter((unused, index) => index % MARK_FLOATS === 6);
  assert.ok(
    opacities(seen(10)).every((opacity) => opacity === ditherCode(1)),
    'whole within the reach, by the code the light layer gives no light for, so it is never lit by its own brass',
  );
  assert.ok(
    opacities(seen(REACH_M - 1)).every((opacity) => opacity > 0 && opacity < 1),
    'fading at its end',
  );
  assert.deepEqual(seen(REACH_M + 1), [], 'none past it');
});

test('a picture with a pixel of its own is laid as wide as any other', () => {
  const own = { rows: ['aa', 'aa'], colours: ['#ff0000'], pixelM: 0.05 };
  const width = widthOf(marksSeen([{ picture: own, at: [0, 0, 2] }], [0, -3, 2], 0, true));
  assert.ok(Math.abs(width - WIDTH_M) < 0.05, `WIDTH_M across, near: ${width}`);
});

test('a mark bobs on a phase of its own, holds still under reduced motion, and only the nearest are laid', () => {
  const picture = AMMO_BOX;
  const one = [{ picture, at: [0, 0, 2] as const }];
  assert.notDeepEqual(marksSeen(one, [0, -5, 2], 0, false), marksSeen(one, [0, -5, 2], 0.25, false));
  assert.deepEqual(marksSeen(one, [0, -5, 2], 0, true), marksSeen(one, [0, -5, 2], 0.25, true), 'held still');
  const each = marksSeen(one, [0, -5, 2], 0, true).length;
  const many = Array.from({ length: MOST + 4 }, (unused, place) => ({ picture, at: [place * 0.5, 0, 2] as const }));
  assert.equal(marksSeen(many, [0, -5, 2], 0, true).length, MOST * each, `the nearest ${MOST}`);
});

test('a lit mark swells and eases back, an unlit one keeps its width, and both hold under reduced motion', () => {
  const picture = AMMO_BOX;
  const widths = (lit: boolean, holding: boolean) =>
    [0, 0.2, 0.4, 0.6, 0.8, 1].map((seconds) => {
      const mark = [{ picture, at: [0, 0, 2] as const, lit }];
      return widthOf((lit ? litMarksSeen : marksSeen)(mark, [0, -3, 2], seconds, holding));
    });
  const swelling = widths(true, false);
  assert.ok(Math.max(...swelling) > Math.min(...swelling) * 1.1, 'it swells');
  assert.ok(Math.min(...swelling) > WIDTH_M * 0.95, 'never narrower than at rest');
  for (const still of [widths(false, false), widths(true, true)])
    assert.ok(Math.max(...still) - Math.min(...still) < 1e-9, 'still');
});

test('a lit mark is laid apart: seen from everywhere, whole, every one of them, the farthest first', () => {
  const picture = AMMO_BOX;
  const lit = (where: readonly [number, number, number]) => ({ picture, at: where, lit: true });
  const far = REACH_M * 6;
  const unlit = { picture, at: [0, 4, 2] as const };
  const marks = [lit([0, 3, 2]), lit([0, far, 2]), unlit];
  assert.deepEqual(marksSeen(marks, [0, 0, 2], 0, true), marksSeen([unlit], [0, 0, 2], 0, true), 'only the unlit one');
  const seen = litMarksSeen(marks, [0, 0, 2], 0, true);
  const each = litMarksSeen([lit([0, 3, 2])], [0, 0, 2], 0, true).length;
  assert.equal(seen.length, 2 * each, 'both, the one far past the reach too');
  assert.ok(
    seen.filter((unused, index) => index % MARK_FLOATS === 6).every((opacity) => opacity === 1),
    'whole, with no ground dither',
  );
  const along = seen.filter((unused, index) => index % MARK_FLOATS === 1);
  assert.ok((along[0] ?? 0) > far / 2 && (along.at(-1) ?? far) < far / 2, 'the farthest laid first');
  const crowd = Array.from({ length: MOST + 4 }, (unused, place) => lit([place, 5, 2]));
  assert.equal(litMarksSeen(crowd, [0, 0, 2], 0, true).length, (MOST + 4) * each, 'none left out for crowding');
});
