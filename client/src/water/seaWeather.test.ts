import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { WeatherSwell } from '../rules/watersRules.ts';
import { gridShare, SEA_GRID, SeaWeather } from './seaWeather.ts';

/** A door whose swell stands 1 high everywhere but east of x = 0, where it stands a quarter as high; it counts asks. */
function door() {
  const asked = { swells: 0, grids: 0 };
  const swell = (x: number): WeatherSwell => ({
    waves: [],
    fullDepthM: 15,
    goneDepthM: 1,
    bearing: 0,
    wind: [5, 0],
    state: 0.4,
    open: 1,
    harbour: 0,
    height: x > 0 ? 0.25 : 1,
  });
  return {
    asked,
    rules: {
      seaSwell: ([x]: readonly [number, number]) => {
        asked.swells++;
        return swell(x);
      },
      seaHeights: (corner: readonly [number, number], cellM: number, columns: number, rows: number) => {
        asked.grids++;
        return Float32Array.from({ length: columns * rows }, (_value, index) =>
          corner[0] + ((index % columns) + 0.5) * cellM > 0 ? 0.25 : 1,
        );
      },
    },
  };
}

test('the page draws the swell round its view as high as the weather and the shelter make it', () => {
  const { rules } = door();
  const swell = new SeaWeather(rules, () => 1_790_000_000).follow([-10_000, 0], 5_000, 0);
  assert.equal(swell.grid.cells, SEA_GRID.cells);
  assert.equal(swell.grid.cellM, (2 * 5_000) / SEA_GRID.cells);
  assert.equal(swell.shelterAt?.(-12_000, 0), 1);
  // The grid reaches 5 km either side: by its east edge, held there.
  const east = gridShare(swell.grid, -5_000, 0);
  assert.ok(east <= 1 && east >= 0.25);
  const lee = new SeaWeather(rules).follow([2_000, 0], 4_000, 0);
  assert.equal(lee.shelterAt?.(3_000, 0), 1, "the view's middle is its own measure");
  assert.ok((lee.shelterAt?.(-1_900, 0) ?? 0) > 1, 'west of the lee the swell stands higher');
});

test('the swell is asked again every few seconds, or once the view moves or grows', () => {
  const { rules, asked } = door();
  const weather = new SeaWeather(rules);
  weather.follow([0, 0], 8_000, 0);
  weather.follow([10, 0], 8_000, 0.5);
  assert.equal(asked.swells, 1);
  weather.follow([10, 0], 8_000, SEA_GRID.refreshS);
  assert.equal(asked.swells, 2);
  weather.follow([5_000, 0], 8_000, 0.1);
  assert.equal(asked.swells, 3, 'moved');
  weather.follow([5_000, 0], 40_000, 0.1);
  assert.equal(asked.swells, 4, 'grown');
  assert.equal(asked.grids, 4);
});

test("one cell's odd fetch is smoothed into the cells round it, never a lone square", () => {
  const middle = Math.floor(SEA_GRID.cells / 2) * SEA_GRID.cells + Math.floor(SEA_GRID.cells / 2);
  const rules = {
    seaSwell: (): WeatherSwell => ({
      waves: [],
      fullDepthM: 15,
      goneDepthM: 1,
      bearing: 0,
      wind: [5, 0],
      state: 0.4,
      open: 1,
      harbour: 0,
      height: 1,
    }),
    seaHeights: (_corner: readonly [number, number], _cellM: number, columns: number, rows: number) =>
      Float32Array.from({ length: columns * rows }, (_value, index) => (index === middle ? 10 : 1)),
  };
  const { shares } = new SeaWeather(rules).follow([0, 0], 8_000, 0).grid;
  assert.equal(shares[middle], 2);
  assert.equal(shares[middle + 1], 2);
  assert.equal(shares[middle + 2], 1);
});
