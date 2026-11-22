/** A point or a direction in a model's frame: x, y, z. */
export type Point = readonly [number, number, number];

/**
 * A forged model, as the renderer and the collider take it. Positions are metres in the classic model's own frame,
 * the one Daggerfall Unity reads it in: y up, its floor near y 0, x and z as the classic plan lays them. Each
 * triangle's (b - a) x (c - a) points along its normal, out of the solid. UVs count pictures, u across a face and v
 * down it (v 0 is a picture's top row, and v runs negative up most walls), so they tile: sample with repeat
 * wrapping. A part is one picture, Daggerfall's texture `archive` and `record`, drawn as `count` indices from
 * `start`. Doors are the classic's, as measured.
 */
export type ForgedModel = {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly uvs: Float32Array;
  readonly indices: Uint32Array;
  readonly parts: readonly ModelPart[];
  readonly doors: readonly ModelDoor[];
};

/** One picture's triangles: `count` indices from `start`, a multiple of three. */
export type ModelPart = {
  readonly archive: number;
  readonly record: number;
  readonly start: number;
  readonly count: number;
};

/**
 * A door as the classic model held it: three corners of its face and its outward normal. `index` is the door's
 * place among its picture's doors, which saves and anchors match on; `type` is the classic's door type.
 */
export type ModelDoor = {
  readonly index: number;
  readonly type: number;
  readonly corners: readonly [Point, Point, Point];
  readonly normal: Point;
};

/** A picture: Daggerfall's texture archive and record, and its width and height in texels. */
export type Picture = readonly [archive: number, record: number, width: number, height: number];

import { cross, dot, minus } from './vector.ts';

type Bucket = {
  archive: number;
  record: number;
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
};

/** A model being built: its faces gathered by picture, each wound to face its normal. */
export type MeshBuilder = {
  quad(
    picture: readonly number[],
    corners: readonly (readonly number[])[],
    normal: readonly number[],
    mapping: readonly (readonly number[])[],
  ): void;
  /** `normal` winds the triangle; `cornerNormals`, where given, are what each corner keeps, so a curve shades smooth. */
  tri(
    picture: readonly number[],
    corners: readonly (readonly number[])[],
    normal: readonly number[],
    mapping: readonly (readonly number[])[],
    cornerNormals?: readonly (readonly number[])[],
  ): void;
  model(): ForgedModel;
};

export function meshBuilder(): MeshBuilder {
  const buckets = new Map<string, Bucket>();
  const bucket = (archive: number, record: number): Bucket => {
    const key = `${archive}/${record}`;
    let found = buckets.get(key);
    if (!found) {
      found = { archive, record, positions: [], normals: [], uvs: [], indices: [] };
      buckets.set(key, found);
    }
    return found;
  };
  const lay = (
    picture: readonly number[],
    corners: readonly (readonly number[])[],
    normal: readonly number[],
    mapping: readonly (readonly number[])[],
    cornerNormals?: readonly (readonly number[])[],
  ): Bucket => {
    const into = bucket(picture[0], picture[1]);
    for (let k = 0; k < corners.length; k++) {
      const kept = cornerNormals?.[k] ?? normal;
      into.positions.push(corners[k][0], corners[k][1], corners[k][2]);
      into.normals.push(kept[0], kept[1], kept[2]);
      into.uvs.push(mapping[k][0], mapping[k][1]);
    }
    return into;
  };
  /** Whether (b - a) x (c - a) of the corners points along `normal` (or across it). */
  const facesNormal = (corners: readonly (readonly number[])[], normal: readonly number[]): boolean =>
    dot(cross(minus(corners[1], corners[0]), minus(corners[2], corners[0])), normal) >= 0;
  return {
    quad(picture, corners, normal, mapping) {
      const base = bucket(picture[0], picture[1]).positions.length / 3;
      const into = lay(picture, corners, normal, mapping);
      if (facesNormal(corners, normal)) into.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
      else into.indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
    },
    tri(picture, corners, normal, mapping, cornerNormals) {
      const base = bucket(picture[0], picture[1]).positions.length / 3;
      const into = lay(picture, corners, normal, mapping, cornerNormals);
      if (facesNormal(corners, normal)) into.indices.push(base, base + 1, base + 2);
      else into.indices.push(base, base + 2, base + 1);
    },
    model() {
      const list = [...buckets.values()].sort((a, b) => a.archive - b.archive || a.record - b.record);
      const vertices = list.reduce((sum, each) => sum + each.positions.length / 3, 0),
        indexCount = list.reduce((sum, each) => sum + each.indices.length, 0);
      const positions = new Float32Array(vertices * 3),
        normals = new Float32Array(vertices * 3),
        uvs = new Float32Array(vertices * 2),
        indices = new Uint32Array(indexCount);
      const parts: ModelPart[] = [];
      let vertex = 0,
        next = 0;
      for (const each of list) {
        positions.set(each.positions, vertex * 3);
        normals.set(each.normals, vertex * 3);
        uvs.set(each.uvs, vertex * 2);
        parts.push({ archive: each.archive, record: each.record, start: next, count: each.indices.length });
        for (const index of each.indices) indices[next++] = index + vertex;
        vertex += each.positions.length / 3;
      }
      return { positions, normals, uvs, indices, parts, doors: [] };
    },
  };
}
