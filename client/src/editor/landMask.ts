import type { CellRect } from '../terrain/terrainView.ts';

export type { CellRect };

/** One cell of the painted land is a square kilometre. */
export const CELL_M = 1_000;

/** Marks sea a fill has reached, until the fill either takes it or gives it back. Never a continent's label. */
const REACHED = 255;

/** A grid of square cells laid on the world: its size in cells, its top-left corner and its cell in metres. */
export interface CellGrid {
  readonly width: number;
  readonly height: number;
  readonly leftM: number;
  readonly topM: number;
  readonly cellM: number;
}

/** Calls `each` with the index of every cell whose centre lies inside a ring of points in metres (even-odd, by rows). */
export function eachCellInRing(
  grid: CellGrid,
  ring: readonly (readonly [number, number])[],
  each: (index: number) => void,
): void {
  const { width, height, leftM, topM, cellM } = grid;
  for (let row = 0; row < height; row++) {
    const y = topM + (row + 0.5) * cellM;
    const crossings: number[] = [];
    ring.forEach(([fromX, fromY], index) => {
      const [toX, toY] = ring[(index + 1) % ring.length] ?? [fromX, fromY];
      if (fromY > y !== toY > y) crossings.push(fromX + ((y - fromY) / (toY - fromY)) * (toX - fromX));
    });
    crossings.sort((first, second) => first - second);
    for (let pair = 0; pair + 1 < crossings.length; pair += 2) {
      const first = Math.max(0, Math.ceil(((crossings[pair] ?? 0) - leftM) / cellM - 0.5));
      const last = Math.min(width - 1, Math.floor(((crossings[pair + 1] ?? 0) - leftM) / cellM - 0.5));
      for (let column = first; column <= last; column++) each(row * width + column);
    }
  }
}

/** A rectangle of cells, inclusive of `left`/`top`, exclusive of `right`/`bottom`. */

/** One connected piece of a continent's land: its label, its size in cells, and a point on it in metres. */
export interface Piece {
  readonly label: number;
  readonly cells: number;
  readonly x: number;
  readonly y: number;
}

/**
 * The land the owner paints: one byte a square-kilometre cell over the whole frame, 0 for sea and 1 to 9 for the
 * continent that holds it.
 */
export class LandMask {
  readonly width: number;
  readonly height: number;
  readonly cells: Uint8Array;

  constructor(frameWidthM: number, frameHeightM: number) {
    this.width = Math.floor(frameWidthM / CELL_M);
    this.height = Math.floor(frameHeightM / CELL_M);
    this.cells = new Uint8Array(this.width * this.height);
  }

  labelAt(cellX: number, cellY: number): number {
    if (cellX < 0 || cellY < 0 || cellX >= this.width || cellY >= this.height) return 0;
    return this.cells[cellY * this.width + cellX] ?? 0;
  }

  /**
   * Paints `label` (0 erases) on every cell whose centre lies within `radiusM` of a world point. A paint stroke
   * covers only sea or the continent being painted, so one continent never paints over another.
   */
  paintDisc(centreXM: number, centreYM: number, radiusM: number, label: number): CellRect | null {
    const left = Math.max(0, Math.floor((centreXM - radiusM) / CELL_M));
    const right = Math.min(this.width, Math.ceil((centreXM + radiusM) / CELL_M));
    const top = Math.max(0, Math.floor((centreYM - radiusM) / CELL_M));
    const bottom = Math.min(this.height, Math.ceil((centreYM + radiusM) / CELL_M));
    if (left >= right || top >= bottom) return null;
    const radiusSquared = radiusM * radiusM;
    for (let cellY = top; cellY < bottom; cellY++) {
      const offsetY = (cellY + 0.5) * CELL_M - centreYM;
      for (let cellX = left; cellX < right; cellX++) {
        const offsetX = (cellX + 0.5) * CELL_M - centreXM;
        if (offsetX * offsetX + offsetY * offsetY > radiusSquared) continue;
        const index = cellY * this.width + cellX;
        const current = this.cells[index] ?? 0;
        if (label === 0 || current === 0 || current === label) this.cells[index] = label;
      }
    }
    return { left, top, right, bottom };
  }

  /** How many cells, and so square kilometres, each label holds; index 0 is the sea. */
  counts(): number[] {
    // Typed and indexed: this runs over the whole frame while a stroke paints.
    const counts = new Uint32Array(256);
    const { cells } = this;
    for (let index = 0; index < cells.length; index++) counts[cells[index] ?? 0]++;
    return [...counts.subarray(0, 10)];
  }

  /** Fills `label` into every cell whose centre lies inside an outline of points in metres, as a layout stores it. */
  fillOutline(outline: readonly (readonly [number, number])[], label: number): void {
    const grid = { width: this.width, height: this.height, leftM: 0, topM: 0, cellM: CELL_M };
    eachCellInRing(grid, outline, (index) => (this.cells[index] = label));
  }

  /**
   * Fills `label` into the sea a click lands in, as far as the land around it, cells joined by their sides. Sea that
   * reaches the frame's edge or holds more than `limit` cells is open ocean: nothing changes, and that comes back.
   */
  fillSea(cellX: number, cellY: number, label: number, limit: number): CellRect | 'not sea' | 'open sea' {
    if (cellX < 0 || cellY < 0 || cellX >= this.width || cellY >= this.height) return 'not sea';
    const start = cellY * this.width + cellX;
    if (this.cells[start] !== 0) return 'not sea';
    const reached = [start];
    this.cells[start] = REACHED;
    let open = false;
    for (let next = 0; next < reached.length && !open; next++) {
      const index = reached[next] ?? 0;
      const atX = index % this.width;
      const atY = (index - atX) / this.width;
      open = atX === 0 || atY === 0 || atX === this.width - 1 || atY === this.height - 1 || reached.length > limit;
      if (open) break;
      for (const side of [index - 1, index + 1, index - this.width, index + this.width]) {
        if (this.cells[side] !== 0) continue;
        this.cells[side] = REACHED;
        reached.push(side);
      }
    }
    const rect = { left: this.width, top: this.height, right: 0, bottom: 0 };
    for (const index of reached) {
      this.cells[index] = open ? 0 : label;
      const atX = index % this.width;
      const atY = (index - atX) / this.width;
      rect.left = Math.min(rect.left, atX);
      rect.top = Math.min(rect.top, atY);
      rect.right = Math.max(rect.right, atX + 1);
      rect.bottom = Math.max(rect.bottom, atY + 1);
    }
    return open ? 'open sea' : rect;
  }

  /** The continents whose cells differ from `before`, an earlier copy of `cells`: those painted or erased since. */
  changedLabels(before: Uint8Array): Set<number> {
    const changed = new Set<number>();
    for (let index = 0; index < this.cells.length; index++) {
      const now = this.cells[index] ?? 0;
      const was = before[index] ?? 0;
      if (now !== was) changed.add(now).add(was);
    }
    changed.delete(0);
    return changed;
  }

  /**
   * Every separate piece of land, cells joined by their sides; the sea is never walked. A piece is placed at the
   * centre of its first cell in reading order, which always lies on it.
   */
  pieces(): Piece[] {
    const found: Piece[] = [];
    const seen = new Uint8Array(this.cells.length);
    const stack: number[] = [];
    for (let start = 0; start < this.cells.length; start++) {
      const label = this.cells[start] ?? 0;
      if (label === 0 || seen[start]) continue;
      let cells = 0;
      seen[start] = 1;
      stack.push(start);
      // Neighbours are visited in place, with no array a cell: a full frame holds millions of land cells.
      const visit = (next: number) => {
        if (seen[next] || this.cells[next] !== label) return;
        seen[next] = 1;
        stack.push(next);
      };
      while (stack.length > 0) {
        const index = stack.pop() ?? 0;
        const cellX = index % this.width;
        cells++;
        if (cellX > 0) visit(index - 1);
        if (cellX < this.width - 1) visit(index + 1);
        if (index >= this.width) visit(index - this.width);
        if (index + this.width < this.cells.length) visit(index + this.width);
      }
      const startX = start % this.width;
      const startY = (start - startX) / this.width;
      found.push({ label, cells, x: (startX + 0.5) * CELL_M, y: (startY + 0.5) * CELL_M });
    }
    return found;
  }

  /** The cells as runs, `[label, length, label, length, …]`: a painted map in a small part of its bytes. */
  toRuns(): number[] {
    const runs: number[] = [];
    let label = this.cells[0] ?? 0;
    let length = 0;
    const { cells } = this;
    for (let index = 0; index < cells.length; index++) {
      const cell = cells[index] ?? 0;
      if (cell === label) {
        length++;
        continue;
      }
      runs.push(label, length);
      label = cell;
      length = 1;
    }
    runs.push(label, length);
    return runs;
  }

  /** Fills the cells from runs `toRuns` made. Runs that do not cover the mask exactly change nothing and give false. */
  fromRuns(runs: readonly unknown[]): boolean {
    let total = 0;
    for (let index = 0; index < runs.length; index += 2) {
      const label = runs[index];
      const length = runs[index + 1];
      const valid = Number.isInteger(label) && Number.isInteger(length) && (length as number) > 0;
      if (!valid || (label as number) < 0 || (label as number) > 9) return false;
      total += length as number;
    }
    if (total !== this.cells.length) return false;
    let offset = 0;
    for (let index = 0; index < runs.length; index += 2) {
      const length = runs[index + 1] as number;
      this.cells.fill(runs[index] as number, offset, offset + length);
      offset += length;
    }
    return true;
  }
}
