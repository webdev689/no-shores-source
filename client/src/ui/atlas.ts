// Where each picture the interface draws lies in its one texture, layer by layer: glyphs as they are first wanted, the
// kit's tiles and the pictures, laid on shelves, each a texel apart from the next so none bleeds into its neighbour.
import type { Box } from './quads.ts';

/** Texels each side of a layer of the atlas, and the most layers it grows to. */
export const ATLAS_SIZE = 2048;
export const ATLAS_LAYERS = 8;

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

/** A place in the atlas: a box on one of its layers. */
export interface Placed extends Box {
  readonly layer: number;
}

/** Shelves on layer after layer: a picture that fits no layer yet opens the next, up to `most`. */
export class Layers {
  private readonly layers: Shelves[] = [];
  private readonly size: number;
  private readonly most: number;

  constructor(size = ATLAS_SIZE, most = ATLAS_LAYERS) {
    this.size = size;
    this.most = most;
  }

  /** How many layers are open. */
  get count(): number {
    return Math.max(1, this.layers.length);
  }

  /** Room for a `width` by `height` picture, or null once every layer is full. */
  place(width: number, height: number): Placed | null {
    for (const [layer, shelves] of this.layers.entries()) {
      const box = shelves.place(width, height);
      if (box) return { ...box, layer };
    }
    if (this.layers.length >= this.most) return null;
    const shelves = new Shelves(this.size);
    this.layers.push(shelves);
    const box = shelves.place(width, height);
    return box && { ...box, layer: this.layers.length - 1 };
  }
}
