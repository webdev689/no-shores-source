// The forged tables as content/forged holds them, and a ray cast against a model, for this layer's tests. It holds
// no tests itself.
import { readFileSync } from 'node:fs';
import type { BuildingTable, KitTable, PropTable } from './tables.ts';

const read = (url: URL): unknown => JSON.parse(readFileSync(url, 'utf8'));
export const buildingTable = read(new URL('../../../content/forged/buildings.json', import.meta.url)) as BuildingTable;
export const propTable = read(new URL('../../../content/forged/props.json', import.meta.url)) as PropTable;
export const kitTable = read(new URL('../../../content/forged/roomkit.json', import.meta.url)) as KitTable;

export const idsOf = (table: object): number[] => Object.keys(table).map(Number);

type Mesh = { readonly positions: ArrayLike<number>; readonly indices: ArrayLike<number> };

export const vertexOf = (mesh: Mesh, k: number): number[] => [
  mesh.positions[k * 3],
  mesh.positions[k * 3 + 1],
  mesh.positions[k * 3 + 2],
];

export const dot = (a: readonly number[], b: readonly number[]): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** How far along `direction` a ray from `from` first meets one of the mesh's triangles, if within `far`; each hit's
 *  distance is pushed to `every` when given. */
export function rayHit(
  mesh: Mesh,
  from: readonly number[],
  direction: readonly number[],
  far: number,
  every?: number[],
): number | null {
  const { positions, indices } = mesh;
  const [dirX, dirY, dirZ] = direction;
  let best: number | null = null;
  for (let t = 0; t + 2 < indices.length; t += 3) {
    const first = indices[t] * 3,
      second = indices[t + 1] * 3,
      third = indices[t + 2] * 3;
    const edgeAX = positions[second] - positions[first],
      edgeAY = positions[second + 1] - positions[first + 1],
      edgeAZ = positions[second + 2] - positions[first + 2];
    const edgeBX = positions[third] - positions[first],
      edgeBY = positions[third + 1] - positions[first + 1],
      edgeBZ = positions[third + 2] - positions[first + 2];
    const crossX = dirY * edgeBZ - dirZ * edgeBY,
      crossY = dirZ * edgeBX - dirX * edgeBZ,
      crossZ = dirX * edgeBY - dirY * edgeBX;
    const det = edgeAX * crossX + edgeAY * crossY + edgeAZ * crossZ;
    if (Math.abs(det) < 1e-12) continue;
    const offX = from[0] - positions[first],
      offY = from[1] - positions[first + 1],
      offZ = from[2] - positions[first + 2];
    const weightB = (offX * crossX + offY * crossY + offZ * crossZ) / det;
    if (weightB < 0 || weightB > 1) continue;
    const backX = offY * edgeAZ - offZ * edgeAY,
      backY = offZ * edgeAX - offX * edgeAZ,
      backZ = offX * edgeAY - offY * edgeAX;
    const weightC = (dirX * backX + dirY * backY + dirZ * backZ) / det;
    if (weightC < 0 || weightB + weightC > 1) continue;
    const along = (edgeBX * backX + edgeBY * backY + edgeBZ * backZ) / det;
    if (along > 0 && along < far) {
      every?.push(along);
      if (best === null || along < best) best = along;
    }
  }
  return best;
}

/** How many of the model's triangles are not wound so (b - a) x (c - a) points along their first corner's normal. */
export function woundOutward(model: {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly indices: Uint32Array;
}): number {
  let wrong = 0;
  for (let t = 0; t < model.indices.length; t += 3) {
    const [a, b, third] = [0, 1, 2].map((k) => vertexOf(model, model.indices[t + k]));
    const n = [0, 1, 2].map((axis) => model.normals[model.indices[t] * 3 + axis]);
    const edgeB = b.map((value, i) => value - a[i]),
      edgeC = third.map((value, i) => value - a[i]);
    const cross = [
      edgeB[1] * edgeC[2] - edgeB[2] * edgeC[1],
      edgeB[2] * edgeC[0] - edgeB[0] * edgeC[2],
      edgeB[0] * edgeC[1] - edgeB[1] * edgeC[0],
    ];
    if (!(dot(cross, n) > 0)) wrong++;
  }
  return wrong;
}
