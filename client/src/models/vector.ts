/** A point or a direction while a model is built: x, y, z. */
export type Vector = number[];

export const minus = (a: readonly number[], b: readonly number[]): Vector => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

export const dot = (a: readonly number[], b: readonly number[]): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export const cross = (a: readonly number[], b: readonly number[]): Vector => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/** The point with its x and z swapped. */
export const swap = (point: readonly number[]): Vector => [point[2], point[1], point[0]];

/** The vector at length one; a zero vector stays zero. */
export const unit = (vector: readonly number[]): Vector => {
  const length = Math.hypot(vector[0], vector[1], vector[2]) || 1;
  return [vector[0] / length, vector[1] / length, vector[2] / length];
};

/** A face's normal by its corners' order: (b - a) x (c - a), at length one. */
export const faceNormal = (corners: readonly (readonly number[])[]): Vector =>
  unit(cross(minus(corners[1], corners[0]), minus(corners[2], corners[0])));
