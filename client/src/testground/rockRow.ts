import type { Block } from '../rules/movementRules.ts';
import { type RockShape, rockMesh, rockParts } from '../rules/rockMesh.ts';

type Vector = readonly [number, number, number];

/** A natural rock of the row: its shape, the middle of its base (east, south, up) and its size, none of them turned. */
type Rock = { readonly shape: RockShape; readonly at: Vector; readonly size: Vector };

/** The natural rocks east of the course, with `?rock` and no room (the rooms' course has none): a cave roof 3.5 m up,
 *  an overhang whose lip juts south toward the start, a rock arch and a tunnel mouth, each walked through north. The
 *  city crate's tests stand bodies against the same four (crates/city/src/rock_tests.rs). */
export const ROCK_ROW: readonly Rock[] = [
  { shape: { shape: 'caveroof', seed: 11 }, at: [40, -10, 3.5], size: [14, 12, 2.5] },
  { shape: { shape: 'overhang', seed: 12 }, at: [60, -10, 0], size: [10, 7, 6] },
  { shape: { shape: 'rockarch', seed: 13 }, at: [80, -10, 0], size: [12, 5, 10] },
  { shape: { shape: 'tunnelmouth', seed: 14 }, at: [100, -10, 0], size: [12, 8, 9] },
];

/** What a body runs into of the row: each rock's parts at its place, as the city crate's `rock::boxes`. */
export function rockBlocks(): Block[] {
  return ROCK_ROW.flatMap(({ shape, at, size }) =>
    rockParts(shape, size).map(([lowX, lowY, lowZ, highX, highY, highZ]) => ({
      minX: at[0] + lowX,
      minY: at[1] + lowY,
      maxX: at[0] + highX,
      maxY: at[1] + highY,
      top: at[2] + highZ,
      bottom: at[2] + lowZ,
    })),
  );
}

/** The row's triangles for the scene's block drawing, each lit flat as the city draws rock: each vertex's position
 *  then its triangle's normal. */
export function rockTriangles(): number[] {
  const values: number[] = [];
  for (const { shape, at, size } of ROCK_ROW) {
    const { positions, triangles } = rockMesh(shape, size);
    for (const indices of triangles) {
      const [first, second, third] = indices.map((index) => positions[index]);
      const along = [0, 1, 2].map((axis) => second[axis] - first[axis]);
      const across = [0, 1, 2].map((axis) => third[axis] - first[axis]);
      const turn = [
        along[1] * across[2] - along[2] * across[1],
        along[2] * across[0] - along[0] * across[2],
        along[0] * across[1] - along[1] * across[0],
      ];
      const length = Math.hypot(turn[0], turn[1], turn[2]) || 1;
      for (const corner of [first, second, third])
        values.push(...corner.map((value, axis) => value + at[axis]), ...turn.map((value) => value / length));
    }
  }
  return values;
}
