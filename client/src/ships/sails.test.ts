import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gaffTrim, SAIL_COLUMNS, SAIL_ROWS, SailRig, type SailCorners, sailWind, windOff } from './sails.ts';

// The Sloop's two, as her export measured them.
const STAY: SailCorners = { kind: 'stay', tack: [5.417, 0, 1.551], clew: [1.726, 0, 1.755], head: [-0.05, 0, 4.495] };
const GAFF: SailCorners = {
  kind: 'gaff',
  tack: [-0.059, 0, 1.409],
  clew: [-2.859, 0, 1.491],
  throat: [-0.077, 0, 3.509],
  peak: [-2.377, 0, 4.391],
};
const middle = (canvas: Float32Array): number[] => {
  const point = (Math.floor(SAIL_ROWS / 2) * SAIL_COLUMNS + Math.floor(SAIL_COLUMNS / 2)) * 3;
  return [canvas[point] ?? Number.NaN, canvas[point + 1] ?? Number.NaN, canvas[point + 2] ?? Number.NaN];
};
const sailFor = (rig: SailRig, seconds: number, offDeg: number, set = true): void => {
  for (let tick = 0; tick < seconds * 60; tick++) rig.step(1 / 60, { offDeg, set }, tick / 60);
};

test("a sail's wind is Come Sail Away's: a gaff fullest square to the wind, a staysail with it astern", () => {
  assert.deepEqual(
    [45, 90, 135, -90].map((off) => sailWind('gaff', off)),
    [0.5, 1, 0.5, -1],
  );
  assert.deepEqual(
    [90, 180, -90].map((off) => sailWind('stay', off)),
    [0.25, 0, -0.25],
  );
  assert.ok(Math.abs(sailWind('stay', 1) - 1) < 0.01);
});

test('a gaff is trimmed square off before the wind, to 45 degrees with it abeam and home by 150 off it', () => {
  assert.deepEqual([10, 90, 120, 150, -90].map(gaffTrim), [85, 45, 22.5, 0, -45]);
});

test('with the wind abeam her gaff swings to leeward and both sails belly there', () => {
  const rig = new SailRig([STAY, GAFF]);
  sailFor(rig, 5, 90);
  assert.equal(rig.sails[1]?.trimDeg, 45);
  const [stay, gaff] = rig.canvas();
  assert.ok(stay && gaff);
  // Abeam, Come Sail Away's staysail draws a quarter full.
  assert.ok((middle(stay)[1] ?? 0) > 0.1, 'the staysail fills to starboard');
  assert.ok((middle(gaff)[1] ?? 0) > 0.8, 'the gaff lies out to starboard');
  sailFor(rig, 5, -90);
  assert.ok(
    (middle(rig.canvas()[1] ?? new Float32Array())[1] ?? 0) < -0.8,
    'and across to port when the wind comes round',
  );
});

test('in the wind’s eye a sail flaps, never filling', () => {
  const rig = new SailRig([GAFF]);
  for (let tick = 0; tick < 600; tick++) {
    rig.step(1 / 60, { offDeg: 175, set: true }, tick / 60);
    assert.ok(Math.abs(rig.sails[0]?.wind ?? 1) <= 0.25 + 1e-9);
  }
});

test('struck, her sails furl over two seconds, the gaff home on its luff', () => {
  const rig = new SailRig([GAFF]);
  sailFor(rig, 5, 90);
  sailFor(rig, 1, 90, false);
  const half = middle(rig.canvas()[0] ?? new Float32Array());
  sailFor(rig, 3, 90, false);
  const furled = middle(rig.canvas()[0] ?? new Float32Array());
  assert.equal(rig.sails[0]?.trimDeg, 0);
  assert.ok((furled[0] ?? 0) > -0.4, 'brailed in near the mast');
  assert.ok((half[0] ?? 0) < (furled[0] ?? 0), 'still coming in a second on');
});

test("the wind's way off her bow is to starboard positive, whichever way round the compass", () => {
  assert.equal(windOff(0, Math.PI / 2), 90);
  assert.equal(windOff(Math.PI / 2, 0), -90);
  assert.ok(Math.abs(windOff(0.1, 2 * Math.PI - 0.1) - (-0.2 * 180) / Math.PI) < 1e-9);
});

// The Brig's fore course, as her export measured it.
const COURSE: SailCorners = {
  kind: 'square',
  foot_port: [8.8679, -5.9, 4.5826],
  foot_starboard: [8.8679, 5.9, 4.5826],
  head_port: [8.5711, -5.65, 12.8833],
  head_starboard: [8.5711, 5.65, 12.8833],
};
const pointAt = (canvas: Float32Array, row: number, column: number): number[] => {
  const point = (row * SAIL_COLUMNS + column) * 3;
  return [canvas[point] ?? Number.NaN, canvas[point + 1] ?? Number.NaN, canvas[point + 2] ?? Number.NaN];
};
const near = (point: readonly number[], to: readonly number[]): boolean =>
  point.every((value, axis) => Math.abs(value - (to[axis] ?? Number.NaN)) < 1e-4);

test("a square sail's canvas lies between its four corners, its foot below and its head along the yard", () => {
  const rig = new SailRig([COURSE]);
  const flat = rig.sails[0]?.flat ?? new Float32Array();
  const top = SAIL_ROWS - 1;
  assert.ok(near(pointAt(flat, 0, 0), COURSE.foot_port));
  assert.ok(near(pointAt(flat, 0, SAIL_COLUMNS - 1), COURSE.foot_starboard));
  assert.ok(near(pointAt(flat, top, 0), COURSE.head_port));
  assert.ok(near(pointAt(flat, top, SAIL_COLUMNS - 1), COURSE.head_starboard));
});

test('a square sail set bellies forward, fullest with the wind astern, and stays laced to its yard', () => {
  const belly = (offDeg: number): number => {
    const rig = new SailRig([COURSE]);
    sailFor(rig, 5, offDeg);
    const canvas = rig.canvas()[0] ?? new Float32Array();
    const flat = rig.sails[0]?.flat ?? new Float32Array();
    const top = SAIL_ROWS - 1;
    assert.ok(near(pointAt(canvas, top, 3), pointAt(flat, top, 3)), 'its head stays on the yard');
    assert.ok(near(pointAt(canvas, 0, 0), COURSE.foot_port), 'its clews stay sheeted home');
    return (middle(canvas)[0] ?? 0) - (middle(flat)[0] ?? 0);
  };
  const [astern, abeam] = [belly(0), belly(90)];
  assert.ok(astern > 0.9, `${astern}`);
  assert.ok(abeam > 0.3 && abeam < astern, `${abeam}`);
  assert.deepEqual(
    [0, 90, 180].map((off) => sailWind('square', off)),
    [1, 0.5, 0],
  );
});

test('a square sail furled is gathered up to its yard', () => {
  const rig = new SailRig([COURSE]);
  sailFor(rig, 5, 0, false);
  const canvas = rig.canvas()[0] ?? new Float32Array();
  const drop = COURSE.head_port[2] - COURSE.foot_port[2];
  for (let point = 2; point < canvas.length; point += 3)
    assert.ok((canvas[point] ?? 0) > COURSE.head_port[2] - drop * 0.12, `${canvas[point]}`);
});
