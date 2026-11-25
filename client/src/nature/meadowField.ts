// The meadow's cells round the eye: the land cut into squares, each holding a grid of the ground's height and how
// much grass it grows there, read once from the same ground the plants are scattered on. The tufts themselves are
// drawn by the GPU from each cell's grid (meadowShader.ts): where they stand in a cell, which sprite and how tall
// come of a hash of the cell and the tuft, so a cell grows the same meadow whenever it comes back into reach.
import { TILE_M } from './scatter.ts';
import type { NatureGround } from './field.ts';
import { type GroundAt, smooth } from './ground.ts';

/** A cell's side, metres, and its grid's samples a side, a cell's edges shared with its neighbours'. */
export const CELL_M = 16;
export const GRID = 9;
/** Tufts a cell holds where its ground is all grass: about one and an eighth a square metre. */
export const TUFTS = 288;
/** How far from the eye the meadow is drawn, metres: as far as the plants' grass. */
export const REACH_M = 160;
/** A cell is kept while its nearest point lies within the reach and this, so a step back and forth fills none again. */
const KEPT_PAST_M = 24;
/** The biomes whose low ground is grass. A desert's is sand and a tundra's frozen moss and snow. */
export const MEADOW_BIOMES: ReadonlySet<string> = new Set([
  'temperate-coast',
  'highland',
  'woodland',
  'savanna',
  'steppe',
  'swamp',
  'rainforest',
]);

/** How much of the ground at a point is grass, 0..1, as the land draws it (terrain/groundColour.ts `land_colour`):
 *  none on water, a road, a town or what the caller keeps clear; less as stone shows through a steepening slope, as
 *  the highland's dirt comes in, under the snow line, and on the beach along the coast. */
export function grassShare(ground: GroundAt, cleared: boolean, snowM: number): number {
  if (ground.water !== 'dry' || ground.mark !== 0 || cleared) return 0;
  const stone = smooth(0.3, 0.45, ground.slope);
  const dirt = smooth(200, 1600, ground.height);
  const snow = smooth(snowM - 200, snowM - 100, ground.height);
  const coast = ground.coastM ?? Infinity;
  const beach =
    (1 - smooth(60, 140, coast)) * (1 - smooth(1.5, 3, ground.height)) * (1 - smooth(0.12, 0.3, ground.slope));
  return (1 - stone) * (1 - dirt) * (1 - snow) * (1 - beach);
}

/** Squares a side of a cell's kept-clear mask, a bit each, row by row from the north-west: what the grid's points
 *  stand too far apart to see (a wall, a plinth, a fire's stones) keeps its square bare. */
export const CLEAR_SQUARES = 32;

/** One cell: its place (whole cells east and south), its slot on the GPU, its grid (height and grass share each
 *  sample, row by row from the north-west), its kept-clear mask and the ground version it was read at. */
export interface Cell {
  readonly x: number;
  readonly y: number;
  readonly slot: number;
  readonly grid: Float32Array;
  readonly clear: Uint32Array;
  version: number;
  /** The highest and lowest ground in it, metres, for culling, and its most grass share: a cell with none is not drawn. */
  low: number;
  high: number;
  grass: number;
}

/** A cell's grid read from the ground. */
export function readCell(
  x: number,
  y: number,
  ground: NatureGround,
): { grid: Float32Array; clear: Uint32Array; low: number; high: number; grass: number } {
  const grid = new Float32Array(GRID * GRID * 2);
  let [low, high, grass] = [Infinity, -Infinity, 0];
  const step = CELL_M / (GRID - 1);
  for (let row = 0; row < GRID; row++)
    for (let column = 0; column < GRID; column++) {
      const [east, south] = [x * CELL_M + column * step, y * CELL_M + row * step];
      const sampled = ground.sample(east, south);
      const share = MEADOW_BIOMES.has(ground.biome)
        ? grassShare(sampled, ground.cleared(east, south), ground.snowM)
        : 0;
      grid.set([sampled.height, share], (row * GRID + column) * 2);
      [low, high, grass] = [Math.min(low, sampled.height), Math.max(high, sampled.height), Math.max(grass, share)];
    }
  const clear = new Uint32Array(CLEAR_SQUARES);
  const square = CELL_M / CLEAR_SQUARES;
  for (let row = 0; grass > 0 && row < CLEAR_SQUARES; row++)
    for (let column = 0; column < CLEAR_SQUARES; column++) {
      const [east, south] = [x * CELL_M + (column + 0.5) * square, y * CELL_M + (row + 0.5) * square];
      if (ground.cleared(east, south)) clear[row] |= 1 << column;
    }
  return { grid, clear, low, high, grass };
}

/** The cells round the eye: kept while near, read nearest first within a budget a frame, read again where the ground
 *  under them changed, their old grids drawn until their turn. */
export class MeadowField {
  readonly cells = new Map<string, Cell>();
  /** The slots each frame's reads filled, for the view to send. */
  readonly filled: Cell[] = [];
  private readonly free: number[];
  private readonly budgetMs: number;

  constructor(slots: number, budgetMs = 3) {
    this.free = Array.from({ length: slots }, (unused, slot) => slots - 1 - slot);
    this.budgetMs = budgetMs;
  }

  /** Keeps the cells round the eye; answers whether some still wait to be read. */
  update(eyeX: number, eyeY: number, ground: NatureGround, now: () => number = () => performance.now()): boolean {
    this.filled.length = 0;
    const gap = (cellX: number, cellY: number) => {
      const [nearX, nearY] = [
        Math.max(cellX * CELL_M, Math.min(eyeX, (cellX + 1) * CELL_M)),
        Math.max(cellY * CELL_M, Math.min(eyeY, (cellY + 1) * CELL_M)),
      ];
      return Math.hypot(nearX - eyeX, nearY - eyeY);
    };
    for (const [key, cell] of this.cells)
      if (gap(cell.x, cell.y) > REACH_M + KEPT_PAST_M) {
        this.cells.delete(key);
        this.free.push(cell.slot);
      }
    const wanted: { x: number; y: number; gap: number }[] = [];
    const [fromX, toX] = [Math.floor((eyeX - REACH_M) / CELL_M), Math.floor((eyeX + REACH_M) / CELL_M)];
    const [fromY, toY] = [Math.floor((eyeY - REACH_M) / CELL_M), Math.floor((eyeY + REACH_M) / CELL_M)];
    for (let y = fromY; y <= toY; y++)
      for (let x = fromX; x <= toX; x++) {
        const cell = this.cells.get(`${x},${y}`);
        const stale = cell && cell.version !== ground.version && !this.unchanged(cell, ground);
        if (cell && !stale) {
          if (cell.version !== ground.version) cell.version = ground.version;
          continue;
        }
        const away = gap(x, y);
        if (away <= REACH_M) wanted.push({ x, y, gap: away });
      }
    wanted.sort((a, b) => a.gap - b.gap);
    const until = now() + this.budgetMs;
    let read = 0;
    for (const { x, y } of wanted) {
      if (read > 0 && now() > until) break;
      const known = this.cells.get(`${x},${y}`);
      const slot = known?.slot ?? this.free.pop();
      if (slot === undefined) break;
      const { grid, clear, low, high, grass } = readCell(x, y, ground);
      const cell: Cell = { x, y, slot, grid, clear, version: ground.version, low, high, grass };
      this.cells.set(`${x},${y}`, cell);
      this.filled.push(cell);
      read++;
    }
    return read < wanted.length;
  }

  /** Whether a cell's ground is as it was read: every one of the plants' tiles its grid reaches, its far edge
   *  included, is unchanged since. */
  private unchanged(cell: Cell, ground: NatureGround): boolean {
    const { unchanged } = ground;
    if (!unchanged) return false;
    const [fromX, toX] = [cell.x * CELL_M, (cell.x + 1) * CELL_M].map((east) => Math.floor(east / TILE_M));
    const [fromY, toY] = [cell.y * CELL_M, (cell.y + 1) * CELL_M].map((south) => Math.floor(south / TILE_M));
    for (let tileY = fromY ?? 0; tileY <= (toY ?? 0); tileY++)
      for (let tileX = fromX ?? 0; tileX <= (toX ?? 0); tileX++)
        if (!unchanged(tileX, tileY, cell.version)) return false;
    return true;
  }
}
