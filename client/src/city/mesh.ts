// Triangles gathered for the GPU: positions in metres from the city's middle, normals, picture-counting UVs (u across,
// v down from the picture's top row, tiling) and each vertex's layer in the city's pictures.
import { MODEL_FLOATS } from './cityModels.ts';

export type Vector = readonly [number, number, number];

export type MeshData = {
  readonly positions: number[];
  readonly normals: number[];
  readonly uvs: number[];
  readonly layers: number[];
  readonly indices: number[];
};

export const emptyMesh = (): MeshData => ({ positions: [], normals: [], uvs: [], layers: [], indices: [] });

export const cross = (a: Vector, b: Vector): [number, number, number] => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

export const minus = (a: Vector, b: Vector): [number, number, number] => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

export const dot = (a: Vector, b: Vector): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export function normalised(vector: Vector): [number, number, number] {
  const length = Math.hypot(vector[0], vector[1], vector[2]) || 1;
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

/**
 * A convex polygon laid as a fan, wound so each triangle's (b - a) x (c - a) points along `facing`, the way out of
 * the solid. Each corner has its own normal (a flat face repeats one) and UV.
 */
export function addPolygon(
  into: MeshData,
  corners: readonly Vector[],
  normals: readonly Vector[],
  uvs: readonly (readonly [number, number])[],
  layer: number,
  facing: Vector,
): void {
  const base = into.positions.length / 3;
  corners.forEach((corner, k) => {
    into.positions.push(corner[0], corner[1], corner[2]);
    const normal = normals[k] ?? normals[0];
    into.normals.push(normal[0], normal[1], normal[2]);
    into.uvs.push(uvs[k][0], uvs[k][1]);
    into.layers.push(layer);
  });
  for (let k = 1; k + 1 < corners.length; k++) {
    const turn = cross(minus(corners[k], corners[0]), minus(corners[k + 1], corners[0]));
    if (dot(turn, facing) >= 0) into.indices.push(base, base + k, base + k + 1);
    else into.indices.push(base, base + k + 1, base + k);
  }
}

/** Meshes laid end to end as the GPU reads them: each vertex MODEL_FLOATS (position, normal, UV, then its layer as a
 *  whole number), each mesh's indices counted on past the vertices before it, and where each mesh's indices begin and
 *  how many. */
export type LaidMeshes = {
  readonly vertices: ArrayBuffer;
  readonly indices: Uint32Array;
  readonly ranges: readonly { readonly first: number; readonly count: number }[];
};

/** Vertices laid a step (`steps.ts`), and twice as many indices: a city's largest chunk holds tens of thousands. */
const LAID_STEP = 4096;

/** Lays meshes end to end as the GPU reads them, a step at a time, into arrays made once at their whole size. */
export function* laidMeshSteps(meshes: readonly MeshData[]): Generator<void, LaidMeshes> {
  const vertexCount = meshes.reduce((sum, mesh) => sum + mesh.positions.length / 3, 0);
  const vertices = new ArrayBuffer(vertexCount * MODEL_FLOATS * 4);
  const [floats, whole] = [new Float32Array(vertices), new Uint32Array(vertices)];
  const indices = new Uint32Array(meshes.reduce((sum, mesh) => sum + mesh.indices.length, 0));
  const ranges: { first: number; count: number }[] = [];
  let [vertexAt, indexAt] = [0, 0];
  for (const { positions, normals, uvs, layers, indices: own } of meshes) {
    const count = positions.length / 3;
    for (let first = 0; first < count; first += LAID_STEP) {
      for (let vertex = first; vertex < Math.min(count, first + LAID_STEP); vertex++) {
        const [laid, three, two] = [(vertexAt + vertex) * MODEL_FLOATS, vertex * 3, vertex * 2];
        for (let axis = 0; axis < 3; axis++) {
          floats[laid + axis] = positions[three + axis] ?? 0;
          floats[laid + 3 + axis] = normals[three + axis] ?? 0;
        }
        floats[laid + 6] = uvs[two] ?? 0;
        floats[laid + 7] = uvs[two + 1] ?? 0;
        whole[laid + 8] = layers[vertex] ?? 0;
      }
      yield;
    }
    ranges.push({ first: indexAt, count: own.length });
    for (let first = 0; first < own.length; first += LAID_STEP * 2) {
      for (let index = first; index < Math.min(own.length, first + LAID_STEP * 2); index++)
        indices[indexAt + index] = own[index] + vertexAt;
      yield;
    }
    [vertexAt, indexAt] = [vertexAt + count, indexAt + own.length];
  }
  return { vertices, indices, ranges };
}
