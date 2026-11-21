import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rampWall, retaining } from './cityBuild.ts';
import { groundPlates, plateSkirts } from './cityGround.ts';
import { emptyMesh } from './mesh.ts';
import { CELL_M, type CityPlan, type PlanCell, type Ramp, type Solid } from './plan.ts';

/** Two avenue cells side by side round (0, 0), the west at 20 m and the east at 30 m, and the ramp across their
 *  edge: 60 m along the road, 40.8 m across it, falling west. */
function rampedPlan(): CityPlan {
  const [west, north] = [-CELL_M, -CELL_M / 2];
  const cells: PlanCell[] = [
    { column: 0, row: 0, ground: 'level', level: 20, use: 'avenue' },
    { column: 1, row: 0, ground: 'level', level: 30, use: 'avenue' },
  ];
  const ramp: Ramp = {
    piece: 'ramp',
    bounds: [-30, -20.4, 30, 20.4],
    level: 20,
    fall: { east: 30 },
    slope: 10 / 60,
    line: [
      [30, 0, 30],
      [-30, 0, 20],
    ],
  };
  return {
    id: 'ramped',
    name: 'Ramped',
    motif: 'beacon',
    centre: [0, 0],
    grid: { west, north },
    cells,
    gates: [],
    harbour: null,
    landmark: [],
    works: [],
    social: { bounds: [0, 0, 0, 0], level: 30, ring: [], spawns: [], solids: [] },
    pads: [],
    ramps: [ramp],
  };
}

/** The plates' triangles, each its three corners (east, south). */
function triangles(tops: Float32Array): [number, number][][] {
  const found: [number, number][][] = [];
  for (let first = 0; first < tops.length; first += 9)
    found.push([0, 3, 6].map((corner) => [tops[first + corner], tops[first + corner + 1]] as [number, number]));
  return found;
}

const area = ([one, two, three]: [number, number][]): number =>
  Math.abs((two[0] - one[0]) * (three[1] - one[1]) - (three[0] - one[0]) * (two[1] - one[1])) / 2;

/** Whether a triangle holds a point, edges included. */
function inside([a, b, third]: [number, number][], [x, y]: [number, number]): boolean {
  const side = (from: [number, number], to: [number, number]) =>
    (to[0] - from[0]) * (y - from[1]) - (to[1] - from[1]) * (x - from[0]);
  const [one, two, three] = [side(a, b), side(b, third), side(third, a)];
  return (one >= 0 && two >= 0 && three >= 0) || (one <= 0 && two <= 0 && three <= 0);
}

test("the cells' plates are cut round a ramp and cover the rest of the cells", () => {
  const plan = rampedPlan();
  const found = triangles(groundPlates(plan, new Map(), [0], 1).tops);
  // The plates are drawn from the city's middle, which is where the ramp crosses the edge.
  for (const point of [
    [-29, 0],
    [0, 0],
    [29, 20],
    [10, -20],
  ] as [number, number][])
    assert.ok(!found.some((triangle) => inside(triangle, point)), `a plate over the ramp at ${point.join(',')}`);
  for (const point of [
    [-31, 0],
    [31, 0],
    [0, 21],
    [-90, -45],
    [90, 45],
  ] as [number, number][])
    assert.ok(
      found.some((triangle) => inside(triangle, point)),
      `no plate at ${point.join(',')}`,
    );
  const covered = found.reduce((sum, triangle) => sum + area(triangle), 0);
  assert.ok(Math.abs(covered - (2 * CELL_M * CELL_M - 60 * 40.8)) < 1e-3, `${covered}`);
});

test("a plate's skirt opens where a ramp crosses its edge", () => {
  const skirts = emptyMesh();
  plateSkirts(rampedPlan(), 3, { width: 64, height: 128 }, () => skirts);
  // The east cell's west side hangs down to the west cell's level, either side of the ramp and not across it.
  const spans: [number, number][] = [];
  for (let first = 0; first < skirts.positions.length; first += 12) {
    const souths = [1, 4, 7, 10].map((k) => skirts.positions[first + k]);
    const easts = [0, 3, 6, 9].map((k) => skirts.positions[first + k]);
    if (easts.every((x) => Math.abs(x) < 1e-9)) spans.push([Math.min(...souths), Math.max(...souths)]);
  }
  spans.sort((a, b) => a[0] - b[0]);
  const close = (a: number, b: number) => Math.abs(a - b) < 1e-6;
  assert.equal(spans.length, 2, JSON.stringify(spans));
  assert.ok(close(spans[0][0], -CELL_M / 2) && close(spans[0][1], -20.4), JSON.stringify(spans));
  assert.ok(close(spans[1][0], 20.4) && close(spans[1][1], CELL_M / 2), JSON.stringify(spans));
});

test("a ramp's walls wear the terrace's picture, its paving and what stands off it do not", () => {
  const onRamp = rampWall(rampedPlan());
  const block = (where: [number, number], material: Solid['material'], size: [number, number, number]): Solid => ({
    shape: 'block',
    at: [where[0], where[1], 18],
    size,
    turn: 0,
    lean: 0.1,
    roll: 0,
    material,
  });
  assert.ok(onRamp(block([0, 19.8], 'stone', [60, 1.2, 1.1])), 'its parapet');
  assert.ok(onRamp(block([-15, -19.8], 'stone', [30, 1.2, 25])), 'an embankment wall');
  assert.ok(!onRamp(block([0, 0], 'paving', [60, 40.8, 0.4])), 'its paving');
  assert.ok(!onRamp(block([0, 45], 'stone', [60, 1.2, 1.1])), 'a wall off the ramp');
});

test("a length of a terrace's wall a ramp cuts keeps the terrace's picture; a step square to the grid does not", () => {
  const block = (size: [number, number, number]): Solid => ({
    shape: 'block',
    at: [0, 0, 0],
    size,
    turn: -0,
    lean: 0,
    roll: 0,
    material: 'stone',
  });
  assert.ok(retaining(block([30.8, 1.2, 10.25])), 'a length beside a ramp');
  assert.ok(!retaining(block([52, 1, 0.4])), "a portico's step");
});
