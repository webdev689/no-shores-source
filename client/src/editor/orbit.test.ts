import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DISTANCE_LIMITS,
  PITCH_LIMITS,
  fitOrbit,
  panOrbit,
  pickTerrain,
  rayAt,
  rotateOrbit,
  viewProjection,
  zoomOrbit,
  type Orbit,
} from './orbit.ts';
import type { TerrainData } from './terrainView.ts';

const lookingNorth: Orbit = { targetX: 100_000, targetY: 100_000, targetZ: 0, yaw: 0, pitch: 0.6, distance: 50_000 };
const lookingEast: Orbit = { ...lookingNorth, yaw: Math.PI / 2 };

/** Where a world point lands in normalised device coordinates, and its depth. */
function project(matrix: Float32Array, x: number, y: number, z: number) {
  const clip = [0, 1, 2, 3].map(
    (row) => matrix[row] * x + matrix[4 + row] * y + matrix[8 + row] * z + matrix[12 + row],
  );
  const [clipX, clipY, clipZ, clipW] = clip as [number, number, number, number];
  return { x: clipX / clipW, y: clipY / clipW, depth: clipZ / clipW };
}

function close(actual: number, expected: number, tolerance: number, what: string) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${what}: ${actual} is not within ${tolerance} of ${expected}`);
}

/** A window of `width` by `height` one-kilometre cells, with the height of each cell from `heightAt`. */
function grid(width: number, height: number, heightAt: (column: number, row: number) => number): TerrainData {
  const heights = new Float32Array(width * height);
  for (let row = 0; row < height; row++) {
    for (let column = 0; column < width; column++) heights[row * width + column] = heightAt(column, row);
  }
  const cells = width * height;
  return { width, height, cellM: 1000, heights, lakes: new Float32Array(cells), marks: new Uint8Array(cells) };
}

test('the target is drawn at the centre of the screen, between the near and far planes', () => {
  const centre = project(viewProjection(lookingNorth, 1.5), 100_000, 100_000, 0);
  close(centre.x, 0, 1e-6, 'x');
  close(centre.y, 0, 1e-6, 'y');
  assert.ok(centre.depth > 0 && centre.depth < 1, `depth ${centre.depth}`);
});

test('the view is not mirrored: looking north, east is on the right and the far ground is higher', () => {
  const matrix = viewProjection(lookingNorth, 1.5);
  assert.ok(project(matrix, 101_000, 100_000, 0).x > 0, 'east of the target is right of centre');
  assert.ok(project(matrix, 99_000, 100_000, 0).x < 0, 'west of the target is left of centre');
  assert.ok(project(matrix, 100_000, 99_000, 0).y > 0, 'north of the target is above centre');
  assert.ok(project(matrix, 100_000, 100_000, 1_000).y > 0, 'up is up');
});

test('looking east, south is on the right', () => {
  assert.ok(project(viewProjection(lookingEast, 1.5), 100_000, 101_000, 0).x > 0);
});

test('a ray through the centre of the screen passes through the target', () => {
  const ray = rayAt(lookingNorth, 1.5, 0, 0);
  const reached = ray.direction.map((step, axis) => ray.origin[axis] + step * lookingNorth.distance);
  close(reached[0], 100_000, 1e-6, 'x');
  close(reached[1], 100_000, 1e-6, 'y');
  close(reached[2], 0, 1e-6, 'z');
});

test('a point along a ray projects back to the screen point the ray was cast through', () => {
  const ray = rayAt(lookingEast, 1.5, 0.4, -0.7);
  const along = ray.direction.map((step, axis) => ray.origin[axis] + step * 30_000);
  const back = project(viewProjection(lookingEast, 1.5), along[0], along[1], along[2]);
  close(back.x, 0.4, 1e-4, 'x');
  close(back.y, -0.7, 1e-4, 'y');
});

test('rotation keeps the pitch between the horizon and straight down', () => {
  assert.equal(rotateOrbit(lookingNorth, 0.5, 10).pitch, PITCH_LIMITS.highest);
  assert.equal(rotateOrbit(lookingNorth, 0.5, -10).pitch, PITCH_LIMITS.lowest);
  assert.equal(rotateOrbit(lookingNorth, 0.5, 0).yaw, 0.5);
});

test('zoom stops at its limits', () => {
  assert.equal(zoomOrbit(lookingNorth, 0.5).distance, 25_000);
  assert.equal(zoomOrbit(lookingNorth, 1e-9).distance, DISTANCE_LIMITS.closest);
  assert.equal(zoomOrbit(lookingNorth, 1e9).distance, DISTANCE_LIMITS.farthest);
});

test('dragging sideways moves the ground with the pointer', () => {
  const moved = panOrbit(lookingNorth, 40, 0, 600);
  const oldTarget = project(viewProjection(moved, 1), 100_000, 100_000, 0);
  close(oldTarget.x * 300, 40, 1e-3, 'pixels right of centre');
  close(oldTarget.y, 0, 1e-6, 'height on screen');
});

test('dragging down pulls the ground ahead toward the camera', () => {
  const moved = panOrbit(lookingNorth, 0, 30, 600);
  assert.ok(moved.targetY < lookingNorth.targetY, 'the target moved north, the way the camera looks');
  close(moved.targetX, lookingNorth.targetX, 1e-6, 'no sideways drift');
  const oldTarget = project(viewProjection(moved, 1), 100_000, 100_000, 0);
  close(-oldTarget.y * 300, 30, 3, 'pixels below centre');
});

test('the fitted view shows every corner of the window', () => {
  for (const [widthM, heightM, aspect] of [
    [300_000, 200_000, 1.5],
    [4_915_200, 3_072_000, 1.6],
    [1_000_000, 3_000_000, 0.8],
  ] as const) {
    const matrix = viewProjection(fitOrbit(widthM, heightM, aspect), aspect);
    for (const [x, y] of [
      [0, 0],
      [widthM, 0],
      [0, heightM],
      [widthM, heightM],
    ] as const) {
      const corner = project(matrix, x, y, 0);
      assert.ok(Math.abs(corner.x) < 1 && Math.abs(corner.y) < 1, `${widthM}x${heightM} corner ${x},${y}`);
    }
  }
});

test('a ray straight down picks the point beneath it on flat ground', () => {
  const flat = grid(100, 80, () => 250);
  const hit = pickTerrain({ origin: [42_300, 17_800, 9_000], direction: [0, 0, -1] }, flat, 3);
  assert.deepEqual(hit, { x: 42_300, y: 17_800 });
});

test('a slanted ray meets a slope where the line and the surface cross', () => {
  // Cell centres rise 10 m a cell eastward, so between them the ground is at x / 100 - 5 metres.
  const slope = grid(100, 20, (column) => 10 * column);
  const exaggeration = 2;
  const down = Math.SQRT1_2;
  const hit = pickTerrain({ origin: [0, 5_500, 3_000], direction: [down, 0, -down] }, slope, exaggeration);
  assert.ok(hit);
  // Solve 3000 - x = 2 * (x / 100 - 5) for x.
  close(hit.x, 3_010 / 1.02, 0.01, 'x');
  close(hit.y, 5_500, 1e-6, 'y');
});

test('the sea is picked at its surface, not on the seabed', () => {
  const sea = grid(50, 50, () => -800);
  const hit = pickTerrain({ origin: [0, 25_000, 2_000], direction: [Math.SQRT1_2, 0, -Math.SQRT1_2] }, sea, 1);
  assert.ok(hit);
  close(hit.x, 2_000, 0.01, 'x');
});

test('a ray that misses the window picks nothing', () => {
  const flat = grid(10, 10, () => 100);
  assert.equal(pickTerrain({ origin: [-5_000, 5_000, 2_000], direction: [-1, 0, 0] }, flat, 1), null);
  assert.equal(pickTerrain({ origin: [5_000, 5_000, 2_000], direction: [0, 0, 1] }, flat, 1), null);
  assert.equal(pickTerrain({ origin: [5_000, 5_000, 2_000], direction: [0.8, 0, 0.6] }, flat, 1), null);
});
