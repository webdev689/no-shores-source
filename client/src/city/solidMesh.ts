// The city's own solids (its landmark, wall, towers, quays and terraces) meshed from their specs: each shape built
// in its own frame (x across, y along, z up from the middle of its base), rolled about its own y, leaned toward its
// own +y, turned clockwise from north, and stood at its place. Every face is wound out of the solid.
import { addPolygon, cross, dot, type MeshData, minus, normalised, type Vector } from './mesh.ts';
import { moduleMesh } from './modules.ts';
import type { Solid } from './plan.ts';
import { rockMesh } from '../rules/rockMesh.ts';

/** Texels a metre a solid's picture is laid at: coarser than the forged models' forty, so a landmark's or a wall's
 *  courses read as monumental ashlar from the plaza and across the city, not as a fine grain. */
export const SOLID_TEXELS_PER_METRE = 24;

/** The picture a solid wears: its layer and its size in texels, which sets how its UVs tile. */
export type Surface = { readonly layer: number; readonly width: number; readonly height: number };

type Uv = readonly [number, number];

/** A face in the solid's own frame: its corners, their normals (one for a flat face) and UVs, and which way is out. */
type Face = { corners: Vector[]; normals: Vector[]; uvs: Uv[]; facing: Vector };

/** Faces round a column or a dome, and a dome's rings from its base to its crown. */
const ROUND_SIDES_MIN = 3;

/** UVs for a flat face: u along its level edge, v down its slope; a face looking up or down is laid on x and y. */
function planarUvs(corners: readonly Vector[], normal: Vector, surface: Surface): Uv[] {
  const [scaleU, scaleV] = [SOLID_TEXELS_PER_METRE / surface.width, SOLID_TEXELS_PER_METRE / surface.height];
  if (Math.abs(normal[2]) > 0.95) return corners.map((corner) => [corner[0] * scaleU, corner[1] * scaleV]);
  const along = normalised([-normal[1], normal[0], 0]);
  const upward = normalised(cross(normal, along));
  const rising = upward[2] >= 0 ? upward : ([-upward[0], -upward[1], -upward[2]] as Vector);
  return corners.map((corner) => [dot(corner, along) * scaleU, -dot(corner, rising) * scaleV]);
}

function flat(corners: Vector[], normal: Vector, surface: Surface): Face {
  return { corners, normals: [normal], uvs: planarUvs(corners, normal, surface), facing: normal };
}

/** A curved face's quad or triangle, its way out the average of its corners' normals. */
function curved(corners: Vector[], normals: Vector[], uvs: Uv[]): Face {
  const sum = normals.reduce<[number, number, number]>(
    (total, n) => [total[0] + n[0], total[1] + n[1], total[2] + n[2]],
    [0, 0, 0],
  );
  return { corners, normals, uvs, facing: sum };
}

function box(half: [number, number], height: number, surface: Surface): Face[] {
  const [west, east, north, south] = [-half[0], half[0], -half[1], half[1]];
  return [
    flat(
      [
        [west, north, 0],
        [east, north, 0],
        [east, south, 0],
        [west, south, 0],
      ],
      [0, 0, -1],
      surface,
    ),
    flat(
      [
        [west, north, height],
        [east, north, height],
        [east, south, height],
        [west, south, height],
      ],
      [0, 0, 1],
      surface,
    ),
    flat(
      [
        [west, north, 0],
        [east, north, 0],
        [east, north, height],
        [west, north, height],
      ],
      [0, -1, 0],
      surface,
    ),
    flat(
      [
        [west, south, 0],
        [east, south, 0],
        [east, south, height],
        [west, south, height],
      ],
      [0, 1, 0],
      surface,
    ),
    flat(
      [
        [west, north, 0],
        [west, south, 0],
        [west, south, height],
        [west, north, height],
      ],
      [-1, 0, 0],
      surface,
    ),
    flat(
      [
        [east, north, 0],
        [east, south, 0],
        [east, south, height],
        [east, north, height],
      ],
      [1, 0, 0],
      surface,
    ),
  ];
}

/** A four-sided frustum: its base `half` each way, its top `top` of that; a pyramid at top 0. */
function frustum(half: [number, number], height: number, top: number, surface: Surface): Face[] {
  const base: Vector[] = [
    [-half[0], -half[1], 0],
    [half[0], -half[1], 0],
    [half[0], half[1], 0],
    [-half[0], half[1], 0],
  ];
  const upper: Vector[] = base.map((corner) => [corner[0] * top, corner[1] * top, height]);
  const faces: Face[] = [flat(base, [0, 0, -1], surface)];
  if (top > 0) faces.push(flat(upper, [0, 0, 1], surface));
  for (let k = 0; k < 4; k++) {
    const next = (k + 1) % 4;
    const corners = top > 0 ? [base[k], base[next], upper[next], upper[k]] : [base[k], base[next], upper[k]];
    const normal = normalised(cross(minus(base[next], base[k]), minus(upper[k], base[k])));
    faces.push(flat(corners, normal, surface));
  }
  return faces;
}

/** A round column of `sides` faces, its top `top` of its base, smooth round its sides. */
function column(half: [number, number], height: number, sides: number, top: number, surface: Surface): Face[] {
  const count = Math.max(ROUND_SIDES_MIN, Math.round(sides));
  const ring = (share: number, step: number, up: number): Vector => {
    const angle = (2 * Math.PI * step) / count;
    return [half[0] * share * Math.cos(angle), half[1] * share * Math.sin(angle), up];
  };
  const perimeter = Math.PI * (half[0] + half[1]);
  const [scaleU, scaleV] = [SOLID_TEXELS_PER_METRE / surface.width, SOLID_TEXELS_PER_METRE / surface.height];
  const slope = ((1 - top) * (half[0] + half[1])) / 2 / Math.max(height, 1e-6);
  const normalAt = (turn: number): Vector => normalised([Math.cos(turn), Math.sin(turn), slope]);
  const faces: Face[] = [];
  const bottom: Vector[] = [];
  const cap: Vector[] = [];
  for (let k = 0; k < count; k++) {
    const [angle, next] = [(2 * Math.PI * k) / count, (2 * Math.PI * (k + 1)) / count];
    const [low, high, lowNext, highNext] = [
      ring(1, k, 0),
      ring(top, k, height),
      ring(1, k + 1, 0),
      ring(top, k + 1, height),
    ];
    bottom.push(low);
    cap.push(high);
    const [uFrom, uTo] = [(k / count) * perimeter * scaleU, ((k + 1) / count) * perimeter * scaleU];
    const vTop = -height * scaleV;
    if (top > 0)
      faces.push(
        curved(
          [low, lowNext, highNext, high],
          [normalAt(angle), normalAt(next), normalAt(next), normalAt(angle)],
          [
            [uFrom, 0],
            [uTo, 0],
            [uTo, vTop],
            [uFrom, vTop],
          ],
        ),
      );
    else
      faces.push(
        curved(
          [low, lowNext, high],
          [normalAt(angle), normalAt(next), normalAt((angle + next) / 2)],
          [
            [uFrom, 0],
            [uTo, 0],
            [(uFrom + uTo) / 2, vTop],
          ],
        ),
      );
  }
  faces.push(flat(bottom, [0, 0, -1], surface));
  if (top > 0) faces.push(flat(cap, [0, 0, 1], surface));
  return faces;
}

/** Half an ellipsoid as wide as the solid and as high, smooth, closed underneath. */
function dome(half: [number, number], height: number, sides: number, surface: Surface): Face[] {
  const count = Math.max(ROUND_SIDES_MIN + 1, Math.round(sides));
  const rings = Math.max(2, Math.round(count / 4));
  const point = (ring: number, step: number): Vector => {
    const [rise, turn] = [(Math.PI / 2) * (ring / rings), (2 * Math.PI * step) / count];
    return [
      half[0] * Math.cos(rise) * Math.cos(turn),
      half[1] * Math.cos(rise) * Math.sin(turn),
      height * Math.sin(rise),
    ];
  };
  const normal = (ring: number, step: number): Vector => {
    const [rise, turn] = [(Math.PI / 2) * (ring / rings), (2 * Math.PI * step) / count];
    return normalised([
      (Math.cos(rise) * Math.cos(turn)) / half[0],
      (Math.cos(rise) * Math.sin(turn)) / half[1],
      Math.sin(rise) / height,
    ]);
  };
  const perimeter = Math.PI * (half[0] + half[1]);
  const arc = ((Math.PI / 4) * (half[0] + half[1] + 2 * height)) / 2;
  const [scaleU, scaleV] = [SOLID_TEXELS_PER_METRE / surface.width, SOLID_TEXELS_PER_METRE / surface.height];
  const uvAt = (ring: number, step: number): Uv => [
    (step / count) * perimeter * scaleU,
    -(ring / rings) * arc * scaleV,
  ];
  const faces: Face[] = [];
  for (let ring = 0; ring < rings; ring++)
    for (let step = 0; step < count; step++) {
      const corners = [point(ring, step), point(ring, step + 1), point(ring + 1, step + 1), point(ring + 1, step)];
      const normals = [normal(ring, step), normal(ring, step + 1), normal(ring + 1, step + 1), normal(ring + 1, step)];
      const uvs = [uvAt(ring, step), uvAt(ring, step + 1), uvAt(ring + 1, step + 1), uvAt(ring + 1, step)];
      if (ring + 1 === rings) faces.push(curved(corners.slice(0, 3), normals.slice(0, 3), uvs.slice(0, 3)));
      else faces.push(curved(corners, normals, uvs));
    }
  faces.push(
    flat(
      Array.from({ length: count }, (unused, step) => point(0, step)),
      [0, 0, -1],
      surface,
    ),
  );
  return faces;
}

/** A roof's two slopes meeting along its length (y), its gable ends at y's ends. */
function gable(half: [number, number], height: number, surface: Surface): Face[] {
  const [west, east, north, south] = [-half[0], half[0], -half[1], half[1]];
  const ridge = (y: number): Vector => [0, y, height];
  const slope = (side: number): Vector => normalised([side * height, 0, half[0]]);
  return [
    flat(
      [
        [west, north, 0],
        [east, north, 0],
        [east, south, 0],
        [west, south, 0],
      ],
      [0, 0, -1],
      surface,
    ),
    flat([[west, north, 0], [west, south, 0], ridge(south), ridge(north)], slope(-1), surface),
    flat([[east, north, 0], [east, south, 0], ridge(south), ridge(north)], slope(1), surface),
    flat([[west, north, 0], [east, north, 0], ridge(north)], [0, -1, 0], surface),
    flat([[west, south, 0], [east, south, 0], ridge(south)], [0, 1, 0], surface),
  ];
}

/** Steps round an arch's head, from its west springing to its east one. */
const ARCH_STEPS = 12;
/** An arch's jambs: the opening is this share of its width. */
const OPENING_WIDTH = 0.8;

/** A block with a round-headed opening through it along y: jambs, the head's spandrels, and the intrados. */
function arch(half: [number, number], height: number, opening: number, surface: Surface): Face[] {
  const [west, east, north, south] = [-half[0], half[0], -half[1], half[1]];
  const radius = half[0] * OPENING_WIDTH;
  const crown = Math.min(Math.max(opening, 0.05), 0.95) * height;
  const spring = Math.max(0, crown - radius);
  const rise = crown - spring;
  const outerTurn = (x: number): number => Math.atan2((height - spring) / rise, x / radius);
  const turns = [
    ...Array.from({ length: ARCH_STEPS + 1 }, (unused, k) => Math.PI * (1 - k / ARCH_STEPS)),
    outerTurn(west),
    outerTurn(east),
  ]
    .sort((a, b) => b - a)
    .filter((turn, k, all) => k === 0 || Math.abs(turn - all[k - 1]) > 1e-9);
  const inner = (turn: number): [number, number] => [radius * Math.cos(turn), spring + rise * Math.sin(turn)];
  const outer = (turn: number): [number, number] => {
    const [across, up] = [radius * Math.cos(turn), rise * Math.sin(turn)];
    const reach = Math.min(
      across < -1e-12 ? west / across : across > 1e-12 ? east / across : Infinity,
      up > 1e-12 ? (height - spring) / up : Infinity,
    );
    return [across * reach, spring + up * reach];
  };
  const faces: Face[] = [];
  for (const [y, facing] of [
    [north, -1],
    [south, 1],
  ] as const) {
    const normal: Vector = [0, facing, 0];
    if (spring > 0) {
      faces.push(
        flat(
          [
            [west, y, 0],
            [-radius, y, 0],
            [-radius, y, spring],
            [west, y, spring],
          ],
          normal,
          surface,
        ),
      );
      faces.push(
        flat(
          [
            [radius, y, 0],
            [east, y, 0],
            [east, y, spring],
            [radius, y, spring],
          ],
          normal,
          surface,
        ),
      );
    }
    for (let k = 0; k + 1 < turns.length; k++) {
      const [a, b, third, fourth] = [inner(turns[k]), inner(turns[k + 1]), outer(turns[k + 1]), outer(turns[k])];
      faces.push(
        flat(
          [
            [a[0], y, a[1]],
            [b[0], y, b[1]],
            [third[0], y, third[1]],
            [fourth[0], y, fourth[1]],
          ],
          normal,
          surface,
        ),
      );
    }
  }
  faces.push(
    flat(
      [
        [west, north, 0],
        [west, south, 0],
        [west, south, height],
        [west, north, height],
      ],
      [-1, 0, 0],
      surface,
    ),
  );
  faces.push(
    flat(
      [
        [east, north, 0],
        [east, south, 0],
        [east, south, height],
        [east, north, height],
      ],
      [1, 0, 0],
      surface,
    ),
  );
  faces.push(
    flat(
      [
        [west, north, height],
        [east, north, height],
        [east, south, height],
        [west, south, height],
      ],
      [0, 0, 1],
      surface,
    ),
  );
  faces.push(
    flat(
      [
        [west, north, 0],
        [-radius, north, 0],
        [-radius, south, 0],
        [west, south, 0],
      ],
      [0, 0, -1],
      surface,
    ),
  );
  faces.push(
    flat(
      [
        [radius, north, 0],
        [east, north, 0],
        [east, south, 0],
        [radius, south, 0],
      ],
      [0, 0, -1],
      surface,
    ),
  );
  if (spring > 0) {
    faces.push(
      flat(
        [
          [-radius, north, 0],
          [-radius, south, 0],
          [-radius, south, spring],
          [-radius, north, spring],
        ],
        [1, 0, 0],
        surface,
      ),
    );
    faces.push(
      flat(
        [
          [radius, north, 0],
          [radius, south, 0],
          [radius, south, spring],
          [radius, north, spring],
        ],
        [-1, 0, 0],
        surface,
      ),
    );
  }
  const scaleU = SOLID_TEXELS_PER_METRE / surface.width;
  for (let k = 0; k + 1 < turns.length; k++) {
    const [a, b] = [inner(turns[k]), inner(turns[k + 1])];
    const inward = (turn: number): Vector => normalised([-Math.cos(turn) / radius, 0, -Math.sin(turn) / rise]);
    const [uFirst, uSecond] = [(turns[0] - turns[k]) * radius * scaleU, (turns[0] - turns[k + 1]) * radius * scaleU];
    faces.push(
      curved(
        [
          [a[0], north, a[1]],
          [b[0], north, b[1]],
          [b[0], south, b[1]],
          [a[0], south, a[1]],
        ],
        [inward(turns[k]), inward(turns[k + 1]), inward(turns[k + 1]), inward(turns[k])],
        [
          [uFirst, north * scaleU],
          [uSecond, north * scaleU],
          [uSecond, south * scaleU],
          [uFirst, south * scaleU],
        ],
      ),
    );
  }
  return faces;
}

/** The solid's faces in its own frame. */
export function solidFaces(solid: Solid, surface: Surface): Face[] {
  const half: [number, number] = [solid.size[0] / 2, solid.size[1] / 2];
  const height = solid.size[2];
  switch (solid.shape) {
    case 'block':
      return box(half, height, surface);
    case 'column':
      return column(half, height, solid.sides, solid.top, surface);
    case 'dome':
      return dome(half, height, solid.sides, surface);
    case 'pyramid':
      return frustum(half, height, solid.top, surface);
    case 'gable':
      return gable(half, height, surface);
    case 'arch':
      return arch(half, height, solid.opening, surface);
    case 'caveroof':
    case 'overhang':
    case 'rockarch':
    case 'tunnelmouth':
      return rock(solid, surface);
    case 'module':
      return moduled(solid.module, solid.group, surface);
  }
}

/** A module's surface group as Blender made it, smooth where it was smooth, its picture laid from the axis each
 *  triangle faces most, as rock's is; none until its mesh has come. */
function moduled(module: number, group: number, surface: Surface): Face[] {
  const mesh = moduleMesh(module, group);
  if (!mesh) return [];
  const [scaleU, scaleV] = [SOLID_TEXELS_PER_METRE / surface.width, SOLID_TEXELS_PER_METRE / surface.height];
  const point = (index: number): Vector => [
    mesh.positions[index * 3],
    mesh.positions[index * 3 + 1],
    mesh.positions[index * 3 + 2],
  ];
  const normal = (index: number): Vector => [
    mesh.normals[index * 3] / 127,
    mesh.normals[index * 3 + 1] / 127,
    mesh.normals[index * 3 + 2] / 127,
  ];
  const faces: Face[] = [];
  for (let triangle = 0; triangle < mesh.triangles.length; triangle += 3) {
    const indices = [mesh.triangles[triangle], mesh.triangles[triangle + 1], mesh.triangles[triangle + 2]];
    const corners = indices.map(point);
    const normals = indices.map(normal);
    // Out is the way its corners' normals point: the file's winding is not relied on.
    const facing = normalised(normals.reduce((sum, each) => [sum[0] + each[0], sum[1] + each[1], sum[2] + each[2]]));
    const most = [0, 1, 2].reduce((best, axis) => (Math.abs(facing[axis]) > Math.abs(facing[best]) ? axis : best), 2);
    const uvOf = ([x, y, z]: Vector): Uv =>
      most === 2 ? [x * scaleU, y * scaleV] : most === 0 ? [y * scaleU, -z * scaleV] : [x * scaleU, -z * scaleV];
    faces.push({ corners, normals, uvs: corners.map(uvOf), facing });
  }
  return faces;
}

/** Natural rock's triangles, each lit flat so the rock reads as faceted crags, its picture laid from the axis each
 *  triangle faces most so the stone runs on unbroken across a lump's side. */
function rock(solid: Solid, surface: Surface): Face[] {
  const { positions, triangles } = rockMesh(solid, solid.size);
  const [scaleU, scaleV] = [SOLID_TEXELS_PER_METRE / surface.width, SOLID_TEXELS_PER_METRE / surface.height];
  return triangles.map((indices) => {
    const corners = indices.map((index) => positions[index]);
    const facing = cross(minus(corners[1], corners[0]), minus(corners[2], corners[0]));
    const most = [0, 1, 2].reduce((best, axis) => (Math.abs(facing[axis]) > Math.abs(facing[best]) ? axis : best), 2);
    const uvOf = ([x, y, z]: Vector): Uv =>
      most === 2 ? [x * scaleU, y * scaleV] : most === 0 ? [y * scaleU, -z * scaleV] : [x * scaleU, -z * scaleV];
    return { corners, normals: [normalised(facing)], uvs: corners.map(uvOf), facing };
  });
}

/** A point or direction of the solid's own frame turned into the world's axes (east, south, up): rolled, leaned,
 *  then turned. */
export function solidTurn(solid: Pick<Solid, 'turn' | 'lean' | 'roll'>, point: Vector): [number, number, number] {
  const [rollCos, rollSin] = [Math.cos(solid.roll), Math.sin(solid.roll)];
  const rolled: Vector = [point[0] * rollCos + point[2] * rollSin, point[1], -point[0] * rollSin + point[2] * rollCos];
  const [leanCos, leanSin] = [Math.cos(solid.lean), Math.sin(solid.lean)];
  const leant: Vector = [
    rolled[0],
    rolled[1] * leanCos + rolled[2] * leanSin,
    -rolled[1] * leanSin + rolled[2] * leanCos,
  ];
  const [turnCos, turnSin] = [Math.cos(solid.turn), Math.sin(solid.turn)];
  return [leant[0] * turnCos - leant[1] * turnSin, leant[0] * turnSin + leant[1] * turnCos, leant[2]];
}

/** Meshes a solid into `into`, its positions measured from `origin` (world east and south, metres). */
export function meshSolid(solid: Solid, origin: readonly [number, number], surface: Surface, into: MeshData): void {
  const place: Vector = [solid.at[0] - origin[0], solid.at[1] - origin[1], solid.at[2]];
  for (const face of solidFaces(solid, surface)) {
    const corners = face.corners.map((corner) => {
      const turned = solidTurn(solid, corner);
      return [turned[0] + place[0], turned[1] + place[1], turned[2] + place[2]] as Vector;
    });
    addPolygon(
      into,
      corners,
      face.normals.map((normal) => solidTurn(solid, normal)),
      face.uvs,
      surface.layer,
      solidTurn(solid, face.facing),
    );
  }
}
