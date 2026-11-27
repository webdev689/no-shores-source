import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chartLines, drawChart, OLD_CHART_SHARE } from './chart.ts';

/** A square island 100 km a side, its town on its west coast, the storm 24 km out to its west. */
const ISLAND: readonly (readonly [number, number])[] = [
  [0, 0],
  [100_000, 0],
  [100_000, 100_000],
  [0, 100_000],
];
const TOWN = [0, 50_000] as const;
const STORM = [-24_000, 50_000] as const;
const ANCHORAGE = [-800, 50_000] as const;

test('the chart draws the coast as it is, and the old chart’s coast short of it past the town', () => {
  const lines = chartLines(ISLAND, TOWN, STORM, ANCHORAGE);
  assert.deepEqual(lines.coast, ISLAND, 'the coast as the world has it');
  const [west, east] = [lines.old[0], lines.old[1]];
  assert.deepEqual(west, [0, 0], 'it agrees with the coast at the town’s side');
  assert.ok(east, 'every point of the coast has its old one');
  assert.ok(Math.abs(east[0] - 100_000 * OLD_CHART_SHARE) < 1e-6, 'the far coast lies past the old chart’s');
  assert.equal(east[1], 0, 'drawn short along the way from the town, not across it');
  assert.ok(
    OLD_CHART_SHARE < 1 && OLD_CHART_SHARE > 0.7,
    'short enough to see, not so short it reads as another island',
  );
  assert.deepEqual(lines.course, [STORM, ANCHORAGE], 'the course from the storm to the harbour’s anchorage');
});

test('the chart fits its coasts and its course inside the parchment, whatever its size', () => {
  const lines = chartLines(ISLAND, TOWN, STORM, ANCHORAGE);
  for (const [width, height] of [
    [600, 400],
    [300, 500],
  ] as const) {
    const drawn: [number, number][] = [];
    const pen = (x: number, y: number) => void drawn.push([x, y]);
    const context = new Proxy(
      { moveTo: pen, lineTo: pen },
      { get: (made, key) => Reflect.get(made, key) ?? (() => 0) },
    );
    drawChart(lines, context as unknown as OffscreenCanvasRenderingContext2D, width, height);
    assert.ok(drawn.length >= ISLAND.length * 2 + 2, 'both coasts and the course are drawn');
    for (const [x, y] of drawn) assert.ok(x >= 0 && x <= width && y >= 0 && y <= height, `${x}, ${y} on the parchment`);
  }
});
