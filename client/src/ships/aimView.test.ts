import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AIM_FLOATS, AIM_TONES, type AimDrawn, aimCorners, ARC, POST, ringStrength, STRIKE_HALF_M } from './aimView.ts';

/** A camera at the window's origin, 5.5 m up, looking north (south negative) along the flat, 65° high, 16 by 9. */
const FOCAL = 1 / Math.tan((65 * Math.PI) / 180 / 2);
const ASPECT = 16 / 9;
function camera() {
  const rows = [
    [FOCAL / ASPECT, 0, 0, 0],
    [0, 0, FOCAL, 0],
    [0, 0.001, 0, 0.3],
    [0, -1, 0, 0],
  ];
  const fromEye = new Float32Array(16);
  for (let row = 0; row < 4; row++)
    for (let column = 0; column < 4; column++) fromEye[column * 4 + row] = rows[row]?.[column] ?? 0;
  return { fromEye, eye: [0, 0, 5.5] as const };
}
/** Where a corner falls on a 1920 by 1080 picture, pixels. */
function pixel(corners: Float32Array, index: number): [number, number] {
  const { fromEye, eye } = camera();
  const point = [0, 1, 2].map((axis) => (corners[index * AIM_FLOATS + axis] ?? 0) - (eye[axis] ?? 0));
  const clip = [0, 1, 3].map((row) =>
    [0, 1, 2].reduce((sum, axis) => sum + (fromEye[axis * 4 + row] ?? 0) * (point[axis] ?? 0), fromEye[12 + row] ?? 0),
  );
  const [x = 0, y = 0, w = 1] = clip;
  return [((x / w) * 1920) / 2, ((y / w) * 1080) / 2];
}
const AIM: AimDrawn = {
  arcs: [
    [
      [2, -8, 3],
      [2, -9, 3],
      [2, -139, 3],
      [2, -140, 3],
    ],
  ],
  zone: [[2, -140, 0.1]],
  strikes: [],
  radius: 1.6,
  tone: 'laid',
};

test("an arc is a ribbon as wide on the screen beside the eye as at 140 m, DFO's share of the view's height", () => {
  const { corners, blended } = aimCorners(AIM, camera(), 0);
  // The ribbon's segments come after the ring (6) and the post (6): each 6 corners, its first two across its start.
  const first = blended + 6;
  const last = blended + 6 + 12;
  const across = (start: number, one: number, other: number) => {
    const [a, b] = [pixel(corners, start + one), pixel(corners, start + other)];
    return Math.hypot(a[0] - b[0], a[1] - b[1]);
  };
  const wanted = ARC.widthVh * 1080;
  assert.ok(Math.abs(across(first, 0, 1) - wanted) < 0.05 * wanted, `${across(first, 0, 1)} px beside her`);
  assert.ok(Math.abs(across(last, 3, 2) - wanted) < 0.05 * wanted, `${across(last, 3, 2)} px at 140 m`);
});

test("an arc's dashes are laid by the metres flown and march out along it as time goes", () => {
  const cornersAt = (time: number) => aimCorners(AIM, camera(), time);
  const start = cornersAt(0).blended + 6;
  const picX = (time: number, corner: number) => cornersAt(time).corners[(start + corner) * AIM_FLOATS + 3] ?? NaN;
  // The third segment starts 1 m + 130 m out: its far end 132 m flown.
  assert.ok(Math.abs(picX(0, 12 + 2) - 132 / ARC.dashM) < 1e-4);
  assert.ok(Math.abs(picX(1, 12 + 2) - (132 - ARC.dashSpeed) / ARC.dashM) < 1e-4, 'a second on it has marched 9 m out');
});

test('each landing is a ring flat on the sea, blended, and a post of light over it, added; a strike a mark', () => {
  const { corners, blended, added } = aimCorners({ ...AIM, strikes: [[1, -50, 2]] }, camera(), 0);
  assert.equal(blended, 6, 'one ring');
  assert.equal(added, 6 + 6 + 3 * 6, 'a post, a strike and three segments');
  const height = (index: number) => corners[index * AIM_FLOATS + 2] ?? NaN;
  assert.ok(
    [0, 1, 2, 3, 4, 5].every((index) => Math.abs(height(index) - 0.16) < 1e-6),
    'the ring lies flat',
  );
  const post = [6, 7, 8, 9, 10, 11].map(height);
  assert.ok(Math.abs(Math.max(...post) - (0.1 + 2 * POST.halfH)) < 1e-6 && Math.abs(Math.min(...post) - 0.1) < 1e-6);
});

test("the aim wears its tone's colours: brass laid, red hot, grey idle", () => {
  const colour = (tone: AimDrawn['tone']) => [...aimCorners({ ...AIM, tone }, camera(), 0).corners.slice(5, 9)];
  const close = (one: readonly number[], other: readonly number[]) =>
    one.every((value, index) => Math.abs(value - (other[index] ?? 0)) < 1e-6);
  assert.ok(close(colour('laid'), AIM_TONES.laid.zone));
  assert.ok(close(colour('hot'), AIM_TONES.hot.zone));
  assert.ok(close(colour('idle'), AIM_TONES.idle.zone));
});

test('a strike mark stands out of her side toward the eye, so her hull never hides half of it', () => {
  const strike = [1, -50, 2] as const;
  const { corners, blended } = aimCorners({ ...AIM, zone: [], strikes: [strike] }, camera(), 0);
  const { eye } = camera();
  const away = (point: readonly number[]) => Math.hypot(...[0, 1, 2].map((axis) => (point[axis] ?? 0) - eye[axis]));
  const middle = [0, 1, 2].map(
    (axis) => [0, 2].reduce((sum, corner) => sum + (corners[(blended + corner) * AIM_FLOATS + axis] ?? 0), 0) / 2,
  );
  assert.ok(
    Math.abs(away(strike) - away(middle) - STRIKE_HALF_M) < 1e-3,
    'its middle a half mark nearer than where it struck',
  );
});

test("a landing's ring is DFO's foam ring: brightest at 0.7 of its radius and broad, so it reads at 140 m", () => {
  assert.equal(ringStrength(0.7), 1);
  assert.ok(ringStrength(0.5) > 0.25 && ringStrength(0.9) > 0.25, 'lit across half its radius');
  assert.equal(ringStrength(0.4), 0);
  assert.equal(ringStrength(1.01), 0);
});

test("the grey a side shows while it cannot fire is DFO's, at DFO's strength", () => {
  assert.deepEqual(AIM_TONES.idle, {
    zone: [0.62, 0.64, 0.66, 0.3],
    arc: [0.62, 0.64, 0.66, 0.22],
    post: [0.6, 0.62, 0.64, 0.16],
    strike: [0.62, 0.64, 0.66, 0.35],
  });
});
