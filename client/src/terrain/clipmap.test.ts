import assert from 'node:assert/strict';
import { test } from 'node:test';
import { viewPlanes } from '../frustum.ts';
import {
  CLIPMAP_LEVELS,
  CLIPMAP_QUADS,
  CLIPMAP_SECTORS,
  clipmapLevels,
  finestSpacing,
  quadOrder,
  ringDraws,
  UNDER_FINER,
} from './clipmap.ts';

test("each ring lies on the next ring's grid, holds the finer one whole, and keeps a margin round it", () => {
  for (const [x, y, finest] of [
    [622_664.37, 357_500.81, 0.25],
    [1_234.5, 98_765.25, 8],
    [-3.2, 7.9, 0.5],
  ] as const) {
    const levels = clipmapLevels(x, y, finest);
    assert.equal(levels.length, CLIPMAP_LEVELS);
    assert.equal(levels[0]?.hole, null);
    for (const [index, level] of levels.entries()) {
      assert.equal(level.spacing, finest * 2 ** index);
      for (const axis of [0, 1] as const) {
        const steps = level.corner[axis] / (2 * level.spacing);
        assert.ok(Math.abs(steps - Math.round(steps)) < 1e-9, "its corner is on the next ring's grid");
        const eye = axis === 0 ? x : y;
        const centre = level.corner[axis] + (CLIPMAP_QUADS / 2) * level.spacing;
        assert.ok(Math.abs(eye - centre) <= 2 * level.spacing, 'it is centred on the eye to a step');
      }
      if (index === 0) continue;
      const hole = level.hole ?? [-1, -1];
      for (const start of hole) {
        assert.ok(Number.isInteger(start), 'the finer ring sits on whole quads');
        assert.ok(start >= 20 && start + CLIPMAP_QUADS / 2 <= CLIPMAP_QUADS - 20, `a margin round it: ${start}`);
      }
    }
  }
});

test('the finest ring is a quarter metre for a walker and doubles as the eye climbs', () => {
  assert.equal(finestSpacing(1.7), 0.25);
  assert.equal(finestSpacing(600), 8);
  assert.equal(finestSpacing(-30), 0.5, 'a diver below the surface');
  assert.ok(finestSpacing(100_000) >= 2048);
});

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

const ORDER = quadOrder();

test('every quad is drawn once in the order, sector by sector, those always under the finer ring last', () => {
  assert.deepEqual(
    [...ORDER.quads].sort((one, other) => one - other),
    Array.from({ length: CLIPMAP_QUADS ** 2 }, (unused, quad) => quad),
  );
  const [first, last] = UNDER_FINER;
  const under = (quad: number) => {
    const [column, row] = [quad % CLIPMAP_QUADS, Math.floor(quad / CLIPMAP_QUADS)];
    return column >= first && column < last && row >= first && row < last;
  };
  const round = ORDER.starts[CLIPMAP_SECTORS] ?? 0;
  assert.equal(round, CLIPMAP_QUADS ** 2 - (last - first) ** 2);
  ORDER.quads.forEach((quad, place) => assert.equal(under(quad), place >= round, `quad ${quad}`));
  for (let sector = 0; sector < 2 * CLIPMAP_SECTORS; sector++) {
    assert.ok((ORDER.starts[sector + 1] ?? 0) > (ORDER.starts[sector] ?? 0), `sector ${sector} holds quads`);
    const [column, row, lastColumn, lastRow] = ORDER.spans.subarray(sector * 4, sector * 4 + 4);
    for (let place = ORDER.starts[sector] ?? 0; place < (ORDER.starts[sector + 1] ?? 0); place++) {
      const quad = ORDER.quads[place] ?? 0;
      const [atColumn, atRow] = [quad % CLIPMAP_QUADS, Math.floor(quad / CLIPMAP_QUADS)];
      assert.ok(atColumn >= column! && atColumn <= lastColumn! && atRow >= row! && atRow <= lastRow!);
    }
  }
});

test('the quads every coarser ring leaves out lie under the finer ring wherever the eye stands', () => {
  for (const [x, y, finest] of [
    [622_664.37, 357_500.81, 0.25],
    [1_234.5, 98_765.25, 8],
    [-3.2, 7.9, 0.5],
    [0.124, -0.126, 0.25],
  ] as const)
    for (const level of clipmapLevels(x, y, finest).slice(1)) {
      const [holeColumn = 0, holeRow = 0] = level.hole ?? [];
      for (const start of [holeColumn, holeRow]) {
        assert.ok(start <= UNDER_FINER[0] && start + CLIPMAP_QUADS / 2 >= UNDER_FINER[1], `${start} at ${x}, ${y}`);
      }
    }
});

/** The quads each ring draws, as a set of quad numbers a ring, from `ringDraws`' draws. */
function drawnQuads(draws: readonly number[]): Set<number>[] {
  const rings = Array.from({ length: CLIPMAP_LEVELS }, () => new Set<number>());
  for (let draw = 0; draw < draws.length; draw += 4) {
    const [first = 0, count = 0, firstRing = 0, ringCount = 0] = draws.slice(draw, draw + 4);
    for (let ring = firstRing; ring < firstRing + ringCount; ring++)
      for (let place = first; place < first + count; place++) rings[ring]?.add(ORDER.quads[place] ?? 0);
  }
  return rings;
}

test('a ring draws every quad of it that shows, and leaves out those behind the eye', () => {
  const eye = [1_234.5, 8_765.25, 40] as const;
  const heights = [-30, 120] as const;
  for (const [yaw, pitch] of [
    [0, 0.1],
    [2.4, 0.5],
    [-1.1, -0.2],
  ] as const) {
    const matrix = lookingAlong(yaw, pitch);
    const rings = clipmapLevels(eye[0], eye[1], finestSpacing(eye[2] - heights[0]));
    const draws = ringDraws(viewPlanes(matrix), rings, eye, heights, ORDER);
    const drawn = drawnQuads(draws);
    let left = 0;
    for (const [index, ring] of rings.entries())
      for (let quad = 0; quad < CLIPMAP_QUADS ** 2; quad++) {
        const [column, row] = [quad % CLIPMAP_QUADS, Math.floor(quad / CLIPMAP_QUADS)];
        const shows = [0, 0.5, 1].some((east) =>
          [0, 0.5, 1].some((south) =>
            heights.some((height) =>
              onScreen(matrix, [
                ring.corner[0] - eye[0] + (column + east) * ring.spacing,
                ring.corner[1] - eye[1] + (row + south) * ring.spacing,
                height - eye[2],
              ]),
            ),
          ),
        );
        const under = index > 0 && ORDER.quads.indexOf(quad) >= (ORDER.starts[CLIPMAP_SECTORS] ?? 0);
        if (shows && !under) assert.ok(drawn[index]?.has(quad), `ring ${index} quad ${column}, ${row} shows`);
        if (!drawn[index]?.has(quad)) left++;
      }
    assert.ok(left > CLIPMAP_LEVELS * CLIPMAP_QUADS ** 2 * 0.4, `${left} quads left out`);
    assert.ok(draws.length / 4 <= CLIPMAP_LEVELS * 3, `${draws.length / 4} draws`);
  }
});

test('a view across the bearing where the sectors begin draws each ring in two runs, one either side of it', () => {
  // The sectors start due west: looking west, the first sectors and the last are both in view, in every ring that
  // lies within the far plane (60 km).
  const eye = [500.5, 700.25, 20] as const;
  const rings = clipmapLevels(eye[0], eye[1], 0.5);
  const draws = ringDraws(viewPlanes(lookingAlong(-Math.PI / 2, 0.05)), rings, eye, [-10, 60], ORDER);
  const round = ORDER.starts[CLIPMAP_SECTORS] ?? 0;
  const within = rings.filter((ring) => CLIPMAP_QUADS * ring.spacing < 60_000).length;
  assert.ok(within >= 10);
  for (let ring = 1; ring < within; ring++) {
    const runs = [];
    for (let draw = 0; draw < draws.length; draw += 4)
      if ((draws[draw + 2] ?? 0) <= ring && ring < (draws[draw + 2] ?? 0) + (draws[draw + 3] ?? 0))
        runs.push([draws[draw] ?? 0, (draws[draw] ?? 0) + (draws[draw + 1] ?? 0)]);
    assert.equal(runs.length, 2, `ring ${ring}: ${JSON.stringify(runs)}`);
    assert.equal(runs[0]?.[0], 0, 'one from the first sector on');
    assert.equal(runs[1]?.[1], round, 'one up to the last sector round the finer ring');
  }
});
