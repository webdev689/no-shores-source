// The order the fight's marks are drawn in. A solid mark (every vertex's opacity 1, or a ground dither's code above
// 1) is drawn first and writes depth, so a near blade hides a far one and a drop never covers a spark. The see-through
// rest (blended, or light added below none) is drawn after it, far to near from the eye, each triangle on its own.
import { MARK_FLOATS } from './marks.ts';

type Point = readonly [number, number, number];

/** A triangle's numbers. */
const TRIANGLE = 3 * MARK_FLOATS;
const OPACITY = 6;

/** Whether a triangle starting at `start` is solid: each of its vertices drawn whole or dithered whole. */
function solidAt(vertices: ArrayLike<number>, start: number): boolean {
  for (let vertex = 0; vertex < 3; vertex++)
    if ((vertices[start + vertex * MARK_FLOATS + OPACITY] ?? 0) < 1) return false;
  return true;
}

/**
 * Lays the marks out for drawing, each frame into the same buffers: the solid triangles first in the order given,
 * then the see-through ones sorted far to near from `eye`. Nothing it keeps grows but to the most marks yet seen.
 */
export class MarkOrder {
  private laid = new Float32Array(0);
  private distances = new Float32Array(0);
  private order = new Uint32Array(0);
  private readonly farFirst = (first: number, second: number): number =>
    (this.distances[second] ?? 0) - (this.distances[first] ?? 0) || first - second;

  /** The marks laid out from `vertices` (MARK_FLOATS each, three a triangle): `solid` vertices first, then `clear`. */
  lay(vertices: ArrayLike<number>, eye: Point): { readonly laid: Float32Array; solid: number; clear: number } {
    const triangles = Math.floor(vertices.length / TRIANGLE);
    if (this.laid.length < triangles * TRIANGLE) {
      const room = 2 ** Math.ceil(Math.log2(Math.max(1, triangles)));
      this.laid = new Float32Array(room * TRIANGLE);
      this.distances = new Float32Array(room);
      this.order = new Uint32Array(room);
    }
    let [solid, clear] = [0, 0];
    for (let triangle = 0; triangle < triangles; triangle++) {
      const start = triangle * TRIANGLE;
      if (solidAt(vertices, start)) {
        for (let value = 0; value < TRIANGLE; value++)
          this.laid[solid * TRIANGLE + value] = vertices[start + value] ?? 0;
        solid += 1;
        continue;
      }
      let distance = 0;
      for (let axis = 0; axis < 3; axis++) {
        const middle =
          ((vertices[start + axis] ?? 0) +
            (vertices[start + MARK_FLOATS + axis] ?? 0) +
            (vertices[start + 2 * MARK_FLOATS + axis] ?? 0)) /
          3;
        distance += (middle - eye[axis]) ** 2;
      }
      this.distances[triangle] = distance;
      this.order[clear] = triangle;
      clear += 1;
    }
    this.order.subarray(0, clear).sort(this.farFirst);
    for (let nth = 0; nth < clear; nth++) {
      const start = (this.order[nth] ?? 0) * TRIANGLE;
      const to = (solid + nth) * TRIANGLE;
      for (let value = 0; value < TRIANGLE; value++) this.laid[to + value] = vertices[start + value] ?? 0;
    }
    return { laid: this.laid.subarray(0, (solid + clear) * TRIANGLE), solid: solid * 3, clear: clear * 3 };
  }
}
