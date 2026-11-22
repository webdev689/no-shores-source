// The wreck as its third-person camera keeps clear of it. The course a body walks makes anything in a body's room (a
// rail, the wheel, a gun, a stump) a wall 3.2 m over the deck, past any jump; the camera kept clear of those walls
// stood in at the head, which showed only its crown. Its boom keeps clear of what is drawn instead: each wall lowered
// to the top of the timber and iron the mesh stands there, masts and spars still standing whole.
import type { CourseBlock } from '../../../../server/roomDoor.ts';
import { SQUARE_M, type Squares, squaresOf } from './wreckGround.ts';
import { WRECK_VERTEX_BYTES, type WreckMesh } from './wreckView.ts';

/** How far apart the mesh is felt over its faces, metres: under half a square, so every square it covers is felt. */
const FELT_M = 0.12;
/** The mesh's sail part (tools/wreck/export_wreck.py PARTS): canvas and rags no camera keeps clear of. */
const SAIL_PART = 3;
/** A block is lowered only where what is drawn stands at least this far under its top, metres. */
const LOWERED_M = 0.3;
/** What is drawn counts up to this far over a block's top, for the rounding of its height, metres. */
const OVER_TOP_M = 0.05;

/** The course's blocks as the camera keeps clear of them, the wreck's mesh laid at `origin` (world metres east and
 *  south): each block whose top stands over what is drawn there lowered to the highest timber or iron under its top. */
export function cameraCourse(
  course: readonly CourseBlock[],
  mesh: WreckMesh,
  origin: readonly [number, number],
): CourseBlock[] {
  if (!course.length) return [];
  const squares = squaresOf(course);
  const tops = Float64Array.from(course, (block) => block.top + OVER_TOP_M);
  const drawnTop = new Float64Array(course.length).fill(Number.NEGATIVE_INFINITY);
  const floats = new Float32Array(mesh.vertices);
  const bytes = new Uint8Array(mesh.vertices);
  const stride = WRECK_VERTEX_BYTES / 4;
  const highest = Math.max(...tops);
  const own = mesh.pieces.get(0) ?? { first: 0, count: 0 };
  const face = new Float64Array(9);
  for (let corner = own.first; corner + 2 < own.first + own.count; corner += 3) {
    const first = mesh.indices[corner] ?? 0;
    if (bytes[first * WRECK_VERTEX_BYTES + 24] === SAIL_PART) continue;
    for (let point = 0; point < 3; point++) {
      const offset = (mesh.indices[corner + point] ?? 0) * stride;
      face[point * 3] = (floats[offset] ?? 0) + origin[0];
      face[point * 3 + 1] = (floats[offset + 1] ?? 0) + origin[1];
      face[point * 3 + 2] = floats[offset + 2] ?? 0;
    }
    // Faces wholly over every block's top, canvas and mastheads, are never under one.
    if (Math.min(face[2] ?? 0, face[5] ?? 0, face[8] ?? 0) > highest) continue;
    feelFace(face, squares, tops, drawnTop);
  }
  return course.map((block, index) => {
    const drawn = drawnTop[index] ?? Number.NEGATIVE_INFINITY;
    return Number.isFinite(drawn) && drawn < block.top - LOWERED_M ? { ...block, top: drawn } : block;
  });
}

/** Feels a face (its three corners, world metres) every `FELT_M` across it, in rows from its longest edge to the
 *  corner over it, so a sliver costs only its area: each point under the top of the block whose square it is over
 *  raises what is drawn there. */
function feelFace(face: Float64Array, squares: Squares, tops: Float64Array, drawnTop: Float64Array): void {
  const edge = (from: number, to: number) =>
    Math.hypot(
      (face[to * 3] ?? 0) - (face[from * 3] ?? 0),
      (face[to * 3 + 1] ?? 0) - (face[from * 3 + 1] ?? 0),
      (face[to * 3 + 2] ?? 0) - (face[from * 3 + 2] ?? 0),
    );
  const edges = [edge(0, 1), edge(1, 2), edge(2, 0)];
  const base = Math.max(...edges);
  const longest = edges.indexOf(base);
  const [start, end, over] = [longest, (longest + 1) % 3, (longest + 2) % 3].map((index) => index * 3) as [
    number,
    number,
    number,
  ];
  const cornerAt = (corner: number, axis: number) => face[corner + axis] ?? 0;
  // Its height over the longest edge, from the face's area.
  const [alongX, alongY, alongZ] = [
    cornerAt(end, 0) - cornerAt(start, 0),
    cornerAt(end, 1) - cornerAt(start, 1),
    cornerAt(end, 2) - cornerAt(start, 2),
  ];
  const [towardX, towardY, towardZ] = [
    cornerAt(over, 0) - cornerAt(start, 0),
    cornerAt(over, 1) - cornerAt(start, 1),
    cornerAt(over, 2) - cornerAt(start, 2),
  ];
  const area = Math.hypot(
    alongY * towardZ - alongZ * towardY,
    alongZ * towardX - alongX * towardZ,
    alongX * towardY - alongY * towardX,
  );
  const rows = Math.ceil(area / Math.max(1e-9, base) / FELT_M);
  const { west, north, columns, rows: squareRows, owner } = squares;
  for (let row = 0; row <= rows; row++) {
    const up = row / Math.max(1, rows);
    const [fromX, fromY, fromZ] = [
      cornerAt(start, 0) + towardX * up,
      cornerAt(start, 1) + towardY * up,
      cornerAt(start, 2) + towardZ * up,
    ];
    const [stepX, stepY, stepZ] = [alongX * (1 - up), alongY * (1 - up), alongZ * (1 - up)];
    const steps = Math.ceil((base * (1 - up)) / FELT_M);
    for (let step = 0; step <= steps; step++) {
      const share = step / Math.max(1, steps);
      const column = Math.floor((fromX + stepX * share - west) / SQUARE_M + 1e-6);
      const square = Math.floor((fromY + stepY * share - north) / SQUARE_M + 1e-6);
      if (column < 0 || square < 0 || column >= columns || square >= squareRows) continue;
      const index = owner[square * columns + column] ?? -1;
      const height = fromZ + stepZ * share;
      if (index >= 0 && height <= (tops[index] ?? 0)) drawnTop[index] = Math.max(drawnTop[index] ?? 0, height);
    }
  }
}
