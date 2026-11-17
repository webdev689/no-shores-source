// Triangles gathered for the GPU: positions in metres from the city's middle, normals, picture-counting UVs (u across,
// v down from the picture's top row, tiling) and each vertex's layer in the city's pictures.

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

/** Appends one mesh to another. */
export function appendMesh(into: MeshData, from: MeshData): void {
  const base = into.positions.length / 3;
  // one push per value: a spread of a whole city's arrays would overflow the call stack
  for (const value of from.positions) into.positions.push(value);
  for (const value of from.normals) into.normals.push(value);
  for (const value of from.uvs) into.uvs.push(value);
  for (const value of from.layers) into.layers.push(value);
  for (const index of from.indices) into.indices.push(index + base);
}
