import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AMMO_BOX } from './dropPictures.ts';
import { MARK_FLOATS, ditherCode } from './marks.ts';
import { HIDDEN_SHARE, MIN_RAD, MOST, REACH_M, WIDTH_M, marksHidden, marksSeen } from './marksOver.ts';

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

test('a beating mark swells and eases back, a mark that does not beat keeps its width, and both hold under reduced motion', () => {
  const picture = AMMO_BOX;
  const widths = (beating: boolean, holding: boolean) =>
    [0, 0.2, 0.4, 0.6, 0.8, 1].map((seconds) =>
      widthOf(marksSeen([{ picture, at: [0, 0, 2], beating }], [0, -3, 2], seconds, holding)),
    );
  const swelling = widths(true, false);
  assert.ok(Math.max(...swelling) > Math.min(...swelling) * 1.1, 'it swells');
  assert.ok(Math.min(...swelling) > WIDTH_M * 0.95, 'never narrower than at rest');
  for (const still of [widths(false, false), widths(true, true)])
    assert.ok(Math.max(...still) - Math.min(...still) < 1e-9, 'still');
});

test('a mark seen through what hides it is laid flat and faded, measured from the eye, and fades further at its end', () => {
  const picture = AMMO_BOX;
  const marked = [{ picture, at: [5, 0, 2] as const }];
  const eye = [5, -10, 2] as const;
  const seen = marksSeen(marked, eye, 0, true);
  const hidden = [...marksHidden(marked, eye, 0)];
  const opacities = hidden.filter((unused, index) => index % MARK_FLOATS === 6);
  assert.ok(opacities.length > 0 && opacities.every((opacity) => Math.abs(opacity - HIDDEN_SHARE) < 1e-6), 'faded');
  const alongSeen = new Set(seen.filter((unused, index) => index % MARK_FLOATS === 1).map((y) => y.toFixed(4)));
  const along = new Set(hidden.filter((unused, index) => index % MARK_FLOATS === 1).map((y) => y.toFixed(4)));
  assert.ok(alongSeen.size > 1 && along.size === 1, 'laid flat, in one plane, where a whole mark stacks its layers');
  const across = hidden.filter((unused, index) => index % MARK_FLOATS === 0);
  assert.ok(Math.min(...across) > -1 && Math.max(...across) < 1, 'measured from the eye');
  const far = [...marksHidden(marked, [5, -(REACH_M - 1), 2], 0)].filter((unused, index) => index % MARK_FLOATS === 6);
  assert.ok(
    far.every((opacity) => opacity > 0 && opacity < HIDDEN_SHARE),
    'fading further at its end',
  );
});

test("a mark's copy for the hidden pass lies nearer the eye than any layer of the whole mark, so never behind it", () => {
  const marked = [{ picture: AMMO_BOX, at: [5, 0, 2] as const }];
  const eye = [5, -10, 2] as const;
  // Looking north along y: each vertex's depth is how far north of the eye it lies.
  const depths = (vertices: ArrayLike<number>, from: number) =>
    Array.from(vertices).flatMap((value, index) => (index % MARK_FLOATS === 1 ? [value - from] : []));
  const whole = depths(marksSeen(marked, eye, 0, true), eye[1]);
  const copy = depths(marksHidden(marked, eye, 0), 0);
  assert.ok(Math.max(...copy) < Math.min(...whole), `${Math.max(...copy)} against ${Math.min(...whole)}`);
});
