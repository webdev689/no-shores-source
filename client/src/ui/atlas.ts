// Where each picture the interface draws lies in its one texture: glyphs as they are first wanted and the kit's
// tiles, laid on shelves, each a texel apart from the next so none bleeds into its neighbour.
import type { Box } from './quads.ts';

/** Texels each side of the atlas. */
export const ATLAS_SIZE = 1024;

/** Rectangles laid on shelves across a square of `size` texels, a texel of gutter round each. */
export class Shelves {
  private readonly size: number;
  private shelfTop = 0;
  private shelfHeight = 0;
  private along = 0;

  constructor(size = ATLAS_SIZE) {
    this.size = size;
  }

  /** Room for a `width` by `height` picture, or null once the square is full. */
  place(width: number, height: number): Box | null {
    if (width + 1 > this.size || height + 1 > this.size) return null;
    if (this.along + width + 1 > this.size) {
      this.shelfTop += this.shelfHeight;
      this.shelfHeight = 0;
      this.along = 0;
    }
    if (this.shelfTop + height + 1 > this.size) return null;
    const box = { x: this.along, y: this.shelfTop, width, height };
    this.along += width + 1;
    this.shelfHeight = Math.max(this.shelfHeight, height + 1);
    return box;
  }
}
