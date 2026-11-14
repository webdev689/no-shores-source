/** One cell of the painted land is a square kilometre. */
export const CELL_M = 1_000;

/** A rectangle of cells, inclusive of `left`/`top`, exclusive of `right`/`bottom`. */
export interface CellRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
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

  /** How many separate pieces each continent's land is in, cells joined by their sides. The sea is never walked. */
  piecesByLabel(): number[] {
    const pieces = new Array<number>(10).fill(0);
    const seen = new Uint8Array(this.cells.length);
    const stack: number[] = [];
    for (let start = 0; start < this.cells.length; start++) {
      const label = this.cells[start] ?? 0;
      if (label === 0 || seen[start]) continue;
      pieces[label] = (pieces[label] ?? 0) + 1;
      seen[start] = 1;
      stack.push(start);
      while (stack.length > 0) {
        const index = stack.pop() ?? 0;
        const cellX = index % this.width;
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
    }
    return pieces;
  }
}
