import assert from 'node:assert/strict';
import { test } from 'node:test';
import { viewPlanes } from '../frustum.ts';
import { arcOf, BAND_RINGS, type Disc, discDraws, ringRadius } from './surfaceDisc.ts';

/** A camera's matrix for points measured from the eye, as the game's: bearing `yaw` (0 north, a quarter turn east),
 *  `pitch` down, 60 degrees high on a wide screen, its depth reversed (1 at 0.25 m, 0 at 60 km). */
function lookingAlong(yaw: number, pitch: number): Float32Array {
  const [near, far, focal, aspect] = [0.25, 60_000, 1 / Math.tan(Math.PI / 6), 16 / 9];
  const forward = [Math.cos(pitch) * Math.sin(yaw), -Math.cos(pitch) * Math.cos(yaw), -Math.sin(pitch)];
  const right = [Math.cos(yaw), Math.sin(yaw), 0];
  const up = [Math.sin(pitch) * Math.sin(yaw), -Math.sin(pitch) * Math.cos(yaw), Math.cos(pitch)];
  const [depthScale, depthOffset] = [near / (far - near), (near * far) / (far - near)];
  const rows = [
    [...right.map((value) => (value * focal) / aspect), 0],
    [...up.map((value) => value * focal), 0],
    [...forward.map((value) => -value * depthScale), depthOffset],
    [...forward, 0],
  ];
  return Float32Array.from({ length: 16 }, (unused, index) => rows[index % 4]?.[Math.floor(index / 4)] ?? 0);
}

/** Whether a point measured from the eye lands inside what the matrix draws. */
function onScreen(matrix: Float32Array, point: readonly number[]): boolean {
  const [across = 0, upward = 0, depth = 0, w = 0] = [0, 1, 2, 3].map((row) =>
    [0, 1, 2, 3].reduce((sum, column) => sum + (matrix[column * 4 + row] ?? 0) * (point[column] ?? 1), 0),
  );
  return w > 0 && Math.abs(across) <= w && Math.abs(upward) <= w && depth >= 0 && depth <= w;
}

const DISC: Disc = { inner: 0.8, outer: 60_000, rings: 220, segments: 192 };

/** Whether a draw covers the quad of `row` and `segment`. */
const covers = (draws: readonly number[], row: number, segment: number): boolean => {
  for (let draw = 0; draw < draws.length; draw += 4) {
    const [first = 0, count = 0, firstRow = 0, rows = 0] = draws.slice(draw, draw + 4);
    const round = (segment - first + DISC.segments) % DISC.segments;
    if (row >= firstRow && row < firstRow + rows && round < count) return true;
  }
  return false;
};

test("an arc is the shortest run round the circle that holds every sector seen, over the circle's start too", () => {
  const seen = (marks: string) => [...marks].map((mark) => mark === 'x');
  assert.equal(arcOf(seen('......')), null);
  assert.deepEqual(arcOf(seen('xxxxxx')), [0, 6]);
  assert.deepEqual(arcOf(seen('..xx..')), [2, 2]);
  assert.deepEqual(arcOf(seen('x....x')), [5, 2], 'across the start: from the last on into the first');
  assert.deepEqual(arcOf(seen('xx..xx')), [4, 4]);
  assert.deepEqual(arcOf(seen('.x.x....')), [1, 3], 'a gap inside the arc is drawn over');
});

test("a ring lies where the shader's ring_radius lays it", () => {
  assert.equal(ringRadius(DISC, 0), 0);
  assert.equal(ringRadius(DISC, 1), DISC.inner);
  assert.ok(Math.abs(ringRadius(DISC, DISC.rings) - DISC.outer) < 1e-6);
  const growth = (DISC.outer / DISC.inner) ** (1 / (DISC.rings - 1));
  assert.ok(Math.abs(ringRadius(DISC, 50) - DISC.inner * growth ** 49) < 1e-9);
});

test('every quad of the disc with a corner on screen is drawn, and most of those behind are not', () => {
  for (const [yaw, pitch, eyeAbove] of [
    [0.3, 0.25, 12],
    [2.9, 0.6, 40],
    [-1.7, 0.02, 2],
    [1, 1.3, 300],
  ] as const) {
    const matrix = lookingAlong(yaw, pitch);
    const levels = [-eyeAbove - 3, -eyeAbove + 3] as const;
    const draws = discDraws(viewPlanes(matrix), DISC, levels, 3);
    assert.ok(draws.length / 4 <= Math.ceil(DISC.rings / BAND_RINGS), `${draws.length / 4} draws`);
    let drawn = 0;
    for (let row = 0; row < DISC.rings; row++)
      for (let segment = 0; segment < DISC.segments; segment++) {
        const shows = [0, 1].some((outward) =>
          [0, 1].some((round) =>
            levels.some((level) => {
              const radius = ringRadius(DISC, DISC.rings - 1 - row + outward);
              const bearing = ((segment + round) / DISC.segments) * 2 * Math.PI;
              return onScreen(matrix, [Math.cos(bearing) * radius, Math.sin(bearing) * radius, level]);
            }),
          ),
        );
        const covered = covers(draws, row, segment);
        if (shows) assert.ok(covered, `${yaw}, ${pitch}: row ${row} segment ${segment} shows`);
        if (covered) drawn++;
      }
    if (pitch < 1) assert.ok(drawn < DISC.rings * DISC.segments * 0.6, `${yaw}, ${pitch}: ${drawn} quads drawn`);
  }
});

test('a view looking up from inland draws no water at all', () => {
  const levels = [-305, -295] as const;
  assert.deepEqual(discDraws(viewPlanes(lookingAlong(0.4, -0.8)), DISC, levels, 3), []);
});

test('a view across the bearing where the segments begin draws one arc running on past the last into the first', () => {
  // Segment 0 points east: looking east, the far bands' arcs start before it and run on past it.
  const draws = discDraws(viewPlanes(lookingAlong(Math.PI / 2, 0.1)), DISC, [-23, -17], 3);
  const [first = 0, count = 0] = draws;
  assert.ok(first > DISC.segments / 2 && first + count > DISC.segments, `${first} on ${count}`);
  assert.ok(covers(draws, 0, 0) && covers(draws, 0, DISC.segments - 1));
  assert.ok(!covers(draws, 0, DISC.segments / 2), 'west, behind the eye, is left out');
});
