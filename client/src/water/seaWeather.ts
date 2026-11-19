// The sea by weather as the page draws it: the swell under the weather at the view's middle, from the room module's
// door (crates/room-wasm/src/sea_door.rs), and a grid of how high the swell stands round it, so the lee of land and a
// roadstead lie calmer than the open sea. Asked again every few seconds, or once the view has moved or grown.
import { type PortInfo, startWatersRules, type WatersRules, type WeatherSwell } from '../rules/watersRules.ts';
import type { ShelteredSwell } from './swell.ts';

type Point = readonly [number, number];

/** The grid round the view: cells a side; how often it is asked again, seconds; and how far the view may move, as a
 *  share of its reach, or grow, as a ratio, before it is asked at once. */
export const SEA_GRID = { cells: 32, refreshS: 2, moveShare: 0.125, growRatio: 2 } as const;
/** The nearest and farthest the grid reaches from the view's middle, metres: a harbour's 3 km close in, the lee of an
 *  island from the raised view. */
export const SEA_REACH_M = { least: 2_000, most: 80_000 } as const;

/** How high the swell stands over the grid as a share of the view's middle's, row by row from its north-west corner
 *  (world metres), each cell `cellM` wide. */
export interface SeaGrid {
  readonly corner: Point;
  readonly cellM: number;
  readonly cells: number;
  readonly shares: Float32Array;
}

/** The swell the page draws: the weather's at the view's middle, its wind, sea state and height there (a share of a
 *  moderate sea's), and the grid round it. */
export interface SeaSwell extends ShelteredSwell {
  readonly wind: Point;
  readonly state: number;
  readonly height: number;
  readonly grid: SeaGrid;
}

/** A grid's share at a world point, bilinear between its cells' middles, held at its edge. */
export function gridShare(grid: SeaGrid, x: number, y: number): number {
  const last = grid.cells - 1;
  const column = Math.min(last, Math.max(0, (x - grid.corner[0]) / grid.cellM - 0.5));
  const row = Math.min(last, Math.max(0, (y - grid.corner[1]) / grid.cellM - 0.5));
  const [left, top] = [Math.min(last - 1, Math.floor(column)), Math.min(last - 1, Math.floor(row))];
  const cell = (east: number, south: number) => grid.shares[(top + south) * grid.cells + left + east] ?? 1;
  const [across, down] = [column - left, row - top];
  const upper = cell(0, 0) + (cell(1, 0) - cell(0, 0)) * across;
  const lower = cell(0, 1) + (cell(1, 1) - cell(0, 1)) * across;
  return upper + (lower - upper) * down;
}

/** The sea by weather round a moving view, asked of the room module's door. */
export class SeaWeather {
  private readonly rules: Pick<WatersRules, 'seaSwell' | 'seaHeights'>;
  private readonly now: () => number;
  private kept: { swell: SeaSwell; centre: Point; reachM: number; sinceS: number } | null = null;

  /** `now` is world time, seconds since the Unix epoch. */
  constructor(rules: Pick<WatersRules, 'seaSwell' | 'seaHeights'>, now = () => Date.now() / 1000) {
    this.rules = rules;
    this.now = now;
  }

  /** The swell round `centre` (world metres), the view reaching `reachM` from it, `seconds` on. */
  follow(centre: Point, reachM: number, seconds: number): SeaSwell {
    const reach = Math.min(SEA_REACH_M.most, Math.max(SEA_REACH_M.least, reachM));
    const kept = this.kept;
    if (kept) {
      kept.sinceS += seconds;
      const moved = Math.hypot(centre[0] - kept.centre[0], centre[1] - kept.centre[1]);
      const grown = Math.max(reach / kept.reachM, kept.reachM / reach);
      const fresh =
        kept.sinceS < SEA_GRID.refreshS && moved < kept.reachM * SEA_GRID.moveShare && grown < SEA_GRID.growRatio;
      if (fresh) return kept.swell;
    }
    const swell = this.ask(centre, reach);
    this.kept = { swell, centre, reachM: reach, sinceS: 0 };
    return swell;
  }

  private ask(centre: Point, reachM: number): SeaSwell {
    const time = this.now();
    const middle: WeatherSwell = this.rules.seaSwell(centre, time);
    const cellM = (2 * reachM) / SEA_GRID.cells;
    const corner: Point = [centre[0] - reachM, centre[1] - reachM];
    const heights = this.rules.seaHeights(corner, cellM, SEA_GRID.cells, SEA_GRID.cells, time);
    const shares = heights.map((height) => (middle.height > 0 ? height / middle.height : 1));
    const grid: SeaGrid = { corner, cellM, cells: SEA_GRID.cells, shares };
    return { ...middle, grid, shelterAt: (x, y) => gridShare(grid, x, y) };
  }
}

/** The sea by weather over the world `layoutText` round its `ports`, on the room module once it has compiled; null
 *  until then, or if it never does. */
export function seaWeatherOn(
  module: Promise<WebAssembly.Module>,
  layoutText: string,
  ports: readonly PortInfo[],
): () => SeaWeather | null {
  let weather: SeaWeather | null = null;
  void module
    .then((compiled) => {
      const rules = startWatersRules(compiled);
      rules.open(layoutText, ports);
      weather = new SeaWeather(rules);
    })
    .catch(() => undefined);
  return () => weather;
}

/** The shelter grid's WGSL: how high the swell stands at a point from the eye against the view's middle (gridShare),
 *  from the water's frame (`sea`, `sea_grid`) and its texture (`shelter`); 1 with no grid. */
export const SHELTER_WGSL = /* wgsl */ `
fn shelter_at(offset: vec2f) -> f32 {
  if (frame.sea_grid.y < 0.5) { return 1.0; }
  return grid_at(shelter, (offset - frame.sea.yz) / frame.sea.w - 0.5).r;
}
`;
