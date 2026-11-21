import assert from 'node:assert/strict';
import { test } from 'node:test';
import { vestigePicture } from './dropPictures.ts';
import { MARK_FLOATS } from './marks.ts';
import { MIN_RAD, MOST, REACH_M, WIDTH_M, marksSeen } from './marksOver.ts';

/** The widest a laid mark stands across, metres, from its vertices. */
const widthOf = (vertices: readonly number[]): number => {
  const across = vertices.filter((unused, index) => index % MARK_FLOATS === 0);
  return Math.max(...across) - Math.min(...across);
};

test('a mark is WIDTH_M across near, never narrower on the screen than MIN_RAD far, faded at the end of its reach', () => {
  const picture = vestigePicture(4);
  const over = [0, 0, 2] as const;
  const seen = (far: number) => marksSeen([{ picture, at: over }], [0, -far, 2], 0, true);
  assert.ok(Math.abs(widthOf(seen(3)) - WIDTH_M) < 0.05, 'WIDTH_M across, near');
  const far = 25;
  assert.ok(Math.abs(widthOf(seen(far)) - 2 * far * Math.tan(MIN_RAD)) < 0.1, 'wider far off, so it still shows');
  const opacities = (vertices: readonly number[]) => vertices.filter((unused, index) => index % MARK_FLOATS === 6);
  assert.ok(
    opacities(seen(10)).every((opacity) => opacity === 1),
    'whole within the reach',
  );
  assert.ok(
    opacities(seen(REACH_M - 1)).every((opacity) => opacity > 0 && opacity < 1),
    'fading at its end',
  );
  assert.deepEqual(seen(REACH_M + 1), [], 'none past it');
});

test('a mark bobs on a phase of its own, holds still under reduced motion, and only the nearest are laid', () => {
  const picture = vestigePicture(0);
  const one = [{ picture, at: [0, 0, 2] as const }];
  assert.notDeepEqual(marksSeen(one, [0, -5, 2], 0, false), marksSeen(one, [0, -5, 2], 0.25, false));
  assert.deepEqual(marksSeen(one, [0, -5, 2], 0, true), marksSeen(one, [0, -5, 2], 0.25, true), 'held still');
  const each = marksSeen(one, [0, -5, 2], 0, true).length;
  const many = Array.from({ length: MOST + 4 }, (unused, place) => ({ picture, at: [place * 0.5, 0, 2] as const }));
  assert.equal(marksSeen(many, [0, -5, 2], 0, true).length, MOST * each, `the nearest ${MOST}`);
});
