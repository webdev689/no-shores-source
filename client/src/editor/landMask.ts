/** One cell of the painted land is a square kilometre. */
export const CELL_M = 1_000;

/** A rectangle of cells, inclusive of `left`/`top`, exclusive of `right`/`bottom`. */
export interface CellRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

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
    const counts = new Array<number>(10).fill(0);
    for (const label of this.cells) counts[label] = (counts[label] ?? 0) + 1;
    return counts;
  }

  /** Fills `label` into every cell whose centre lies inside an outline of points in metres, as a layout stores it. */
  fillOutline(outline: readonly (readonly [number, number])[], label: number): void {
    for (let cellY = 0; cellY < this.height; cellY++) {
      const y = (cellY + 0.5) * CELL_M;
      const crossings: number[] = [];
      outline.forEach(([fromX, fromY], index) => {
        const [toX, toY] = outline[(index + 1) % outline.length] ?? [fromX, fromY];
        if (fromY > y === toY > y) return;
        crossings.push(fromX + ((y - fromY) / (toY - fromY)) * (toX - fromX));
      });
      crossings.sort((a, b) => a - b);
      for (let pair = 0; pair + 1 < crossings.length; pair += 2) {
        const first = Math.max(0, Math.ceil((crossings[pair] ?? 0) / CELL_M - 0.5));
        const last = Math.min(this.width - 1, Math.floor((crossings[pair + 1] ?? 0) / CELL_M - 0.5));
        for (let cellX = first; cellX <= last; cellX++) this.cells[cellY * this.width + cellX] = label;
      }
    }
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
      while (stack.length > 0) {
        const index = stack.pop() ?? 0;
        const cellX = index % this.width;
        cells++;
        const neighbours = [
          cellX > 0 ? index - 1 : -1,
          cellX < this.width - 1 ? index + 1 : -1,
          index - this.width,
          index + this.width,
        ];
        for (const next of neighbours) {
          if (next < 0 || next >= this.cells.length || seen[next] || this.cells[next] !== label) continue;
          seen[next] = 1;
          stack.push(next);
        }
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
    for (const cell of this.cells) {
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
