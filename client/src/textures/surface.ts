// The painting surface: each place a material, a tone, a relief and a shade. A picture paints finer than it draws,
// SCALE sub-texels a side, and is lit there; the render averages each texel's sub-texels, as a painting reduced to
// 64 texels has soft edges of in-between shades. Painters work in texel units: a sub-texel comes to them as a
// fractional place, and `x + 0.5` is still the middle of where they paint. Every surface tiles: reads and writes
// wrap at its edges.
import { clamp01, wrapIndex } from './noise.ts';
import { hypot } from './portableMath.ts';

/** Sub-texels a texel side. */
export const SCALE = 2;

/** What a painter lays at one place: `relief` is set, `bump` added to it, `shade` added light. */
export interface Lay {
  material?: number;
  tone?: number;
  relief?: number;
  bump?: number;
  shade?: number;
  flat?: number;
}

export class Surface {
  readonly width: number;
  readonly height: number;
  readonly gridWidth: number;
  readonly gridHeight: number;
  /** Each place's material, an index into the picture's materials. */
  readonly material: Uint8Array;
  /** Each place's place along its material's shades, 0 dark to 1 light, before light. */
  readonly tone: Float32Array;
  /** Each place's height in texels, which the light reads. */
  readonly relief: Float32Array;
  /** Each place's light, added to its tone at the render. */
  readonly shade: Float32Array;
  /** 1 where a place takes no light from its relief: water, a lit pane. */
  readonly flat: Uint8Array;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.gridWidth = width * SCALE;
    this.gridHeight = height * SCALE;
    const n = this.gridWidth * this.gridHeight;
    this.material = new Uint8Array(n);
    this.tone = new Float32Array(n).fill(0.5);
    this.relief = new Float32Array(n);
    this.shade = new Float32Array(n);
    this.flat = new Uint8Array(n);
  }

  /** The sub-texel holding the place (x + 0.5, y + 0.5), wrapped. */
  idx(x: number, y: number): number {
    const gridX = Math.floor((x + 0.5) * SCALE);
    const gridY = Math.floor((y + 0.5) * SCALE);
    return wrapIndex(gridY, this.gridHeight) * this.gridWidth + wrapIndex(gridX, this.gridWidth);
  }

  /** A sub-texel's index from its grid place, wrapped. */
  grid(gridX: number, gridY: number): number {
    return wrapIndex(gridY, this.gridHeight) * this.gridWidth + wrapIndex(gridX, this.gridWidth);
  }

  /** Lay one place. */
  put(x: number, y: number, lay: Lay): void {
    const i = this.idx(x, y);
    if (lay.material !== undefined) this.material[i] = lay.material;
    if (lay.tone !== undefined) this.tone[i] = lay.tone;
    if (lay.relief !== undefined) this.relief[i] = lay.relief;
    if (lay.bump !== undefined) this.relief[i] += lay.bump;
    if (lay.shade !== undefined) this.shade[i] += lay.shade;
    if (lay.flat !== undefined) this.flat[i] = lay.flat;
  }

  /** Move a place's tone by `amount`. */
  nudge(x: number, y: number, amount: number): void {
    this.tone[this.idx(x, y)] += amount;
  }

  /** Visit every sub-texel of a box in texel units (`left` to `right`, `top` to `bottom`, exclusive). */
  each(
    visit: (x: number, y: number, i: number) => void,
    left = 0,
    top = 0,
    right: number = this.width,
    bottom: number = this.height,
  ): void {
    for (let gridY = Math.floor(top * SCALE); gridY < Math.ceil(bottom * SCALE); gridY++)
      for (let gridX = Math.floor(left * SCALE); gridX < Math.ceil(right * SCALE); gridX++)
        visit((gridX + 0.5) / SCALE - 0.5, (gridY + 0.5) / SCALE - 0.5, this.grid(gridX, gridY));
  }
}

/** A box in texel units; a side left out is the picture's edge. */
export interface Box {
  x0?: number;
  y0?: number;
  x1?: number;
  y1?: number;
}

/** A box with every side given. */
export interface Area {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

export const areaOf = (surf: Surface, box: Box = {}): Area => ({
  x0: box.x0 ?? 0,
  y0: box.y0 ?? 0,
  x1: box.x1 ?? surf.width,
  y1: box.y1 ?? surf.height,
});

/** A shape's visit: the place, and where it lies in the shape (0..1, or -1..1 across where a shape says). */
export type ShapeVisit = (x: number, y: number, along: number, across: number) => void;

/** Each sub-texel place from `from` to `to` along one axis, in texel units. */
function forSpan(from: number, to: number, visit: (place: number) => void): void {
  for (let step = Math.floor(from * SCALE); step < Math.ceil(to * SCALE); step++) visit((step + 0.5) / SCALE - 0.5);
}

/** An axis box; u and v run 0..1 across it. */
export function box(left: number, top: number, right: number, bottom: number, visit: ShapeVisit): void {
  const w = right - left;
  const h = bottom - top;
  forSpan(top, bottom, (y) => forSpan(left, right, (x) => visit(x, y, (x - left + 0.5) / w, (y - top + 0.5) / h)));
}

/** An ellipse centred at (midX, midY); u and v run -1..1 across it. */
export function ellipse(midX: number, midY: number, radiusX: number, radiusY: number, visit: ShapeVisit): void {
  forSpan(midY - radiusY - 0.5, midY + radiusY + 0.5, (y) =>
    forSpan(midX - radiusX - 0.5, midX + radiusX + 0.5, (x) => {
      const relU = (x + 0.5 - midX) / radiusX;
      const relV = (y + 0.5 - midY) / radiusY;
      if (relU * relU + relV * relV <= 1) visit(x, y, relU, relV);
    }),
  );
}

/** A thick line from (fromX, fromY) to (toX, toY), tapering from `widthFrom` to `widthTo`; u runs along it, v
 *  across (-1..1). */
export function stroke(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  widthFrom: number,
  widthTo: number,
  visit: ShapeVisit,
): void {
  const len = hypot(toX - fromX, toY - fromY) || 1;
  const normX = (toX - fromX) / len;
  const normY = (toY - fromY) / len;
  const pad = Math.max(widthFrom, widthTo) / 2 + 1;
  forSpan(Math.min(fromY, toY) - pad, Math.max(fromY, toY) + pad, (y) =>
    forSpan(Math.min(fromX, toX) - pad, Math.max(fromX, toX) + pad, (x) => {
      const offsetX = x + 0.5 - fromX;
      const offsetY = y + 0.5 - fromY;
      const along = offsetX * normX + offsetY * normY;
      if (along < -0.5 || along > len + 0.5) return;
      const relU = clamp01(along / len);
      const half = (widthFrom + (widthTo - widthFrom) * relU) / 2;
      const across = -offsetX * normY + offsetY * normX;
      if (Math.abs(across) <= Math.max(0.5, half)) visit(x, y, relU, across / Math.max(0.5, half));
    }),
  );
}

/** A filled polygon (even-odd); u and v are the place's position in the polygon's bounding box. */
export function polygon(points: readonly (readonly [number, number])[], visit: ShapeVisit): void {
  const pointXs = points.map((point) => point[0]);
  const pointYs = points.map((point) => point[1]);
  const left = Math.min(...pointXs);
  const right = Math.max(...pointXs);
  const top = Math.min(...pointYs);
  const bottom = Math.max(...pointYs);
  forSpan(top - 0.5, bottom + 0.5, (y) =>
    forSpan(left - 0.5, right + 0.5, (x) => {
      const placeX = x + 0.5;
      const placeY = y + 0.5;
      let inside = false;
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const [edgeXi, edgeYi] = points[i];
        const [edgeXj, edgeYj] = points[j];
        if (
          edgeYi > placeY !== edgeYj > placeY &&
          placeX < ((edgeXj - edgeXi) * (placeY - edgeYi)) / (edgeYj - edgeYi) + edgeXi
        )
          inside = !inside;
      }
      if (inside) visit(x, y, (placeX - left) / (right - left || 1), (placeY - top) / (bottom - top || 1));
    }),
  );
}
