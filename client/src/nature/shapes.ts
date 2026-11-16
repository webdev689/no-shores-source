/** A point or direction in a plant's own metres: x east, y south, z up from its foot. */
export type Point = readonly [number, number, number];
/** A colour, 0..1 a channel, as the land's colours are given. */
export type Colour = readonly [number, number, number];

/** A vertex's floats: position, normal, colour, how much it is leaf (0..1) and how far it sways (0 at the foot,
 *  1 at the top). */
export const VERTEX_FLOATS = 11;

/** One mesh of a plant, made in code: triangles, three vertices each, VERTEX_FLOATS floats a vertex. */
export interface Mesh {
  readonly vertices: Float32Array;
  /** Every edge is shared by exactly two triangles wound alike, so its back faces can be culled. */
  readonly closed: boolean;
}

const add = (a: Point, b: Point): Point => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: Point, factor: number): Point => [a[0] * factor, a[1] * factor, a[2] * factor];
const cross = (a: Point, b: Point): Point => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const unit = (a: Point): Point => {
  const length = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / length, a[1] / length, a[2] / length];
};
const blend = (a: Point, b: Point, share: number): Point => unit(add(scale(a, 1 - share), scale(b, share)));

export const vector = { add, sub, scale, cross, unit, blend } as const;

/** A seeded random stream: the same seed gives the same plant on every machine. */
export function randomStream(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/** A colour a share of the way to another, and one made lighter or darker. */
export const mixColour = (a: Colour, b: Colour, share: number): Colour => [
  a[0] + (b[0] - a[0]) * share,
  a[1] + (b[1] - a[1]) * share,
  a[2] + (b[2] - a[2]) * share,
];
export const shade = (a: Colour, factor: number): Colour => [a[0] * factor, a[1] * factor, a[2] * factor];

/** What a triangle carries besides its corners: its corners' normals (the face's when absent), their own colours
 *  (the triangle's when absent) and how leafy it is. */
export interface Facet {
  readonly normals?: readonly [Point, Point, Point];
  readonly colours?: readonly [Colour, Colour, Colour];
  readonly leaf?: number;
}

/**
 * Gathers a plant's triangles. Each is wound counter-clockwise seen from outside (its face normal is
 * (b - a) × (third - a) in the plant's right-handed metres), the order the view's culling expects.
 */
export class MeshBuilder {
  private readonly values: number[] = [];
  private sheets = false;

  triangle(a: Point, b: Point, third: Point, colour: Colour, facet: Facet = {}): void {
    const face = unit(cross(sub(b, a), sub(third, a)));
    const normals = facet.normals ?? [face, face, face];
    const leaf = facet.leaf ?? 0;
    for (const [index, corner] of [a, b, third].entries()) {
      const normal = normals[index] ?? face;
      this.values.push(...corner, ...normal, ...(facet.colours?.[index] ?? colour), leaf, 0);
    }
  }

  /** A thin sheet (a blade, a frond) seen from both sides: the mesh is not closed and is drawn two-sided. */
  sheet(a: Point, b: Point, third: Point, colour: Colour, facet: Facet = {}): void {
    this.sheets = true;
    this.triangle(a, b, third, colour, facet);
  }

  /** The mesh, its sway rising with the square of height so the foot stays put and the top moves most. */
  finish(): Mesh {
    const vertices = Float32Array.from(this.values);
    let top = 0;
    for (let offset = 2; offset < vertices.length; offset += VERTEX_FLOATS) top = Math.max(top, vertices[offset] ?? 0);
    for (let offset = 0; offset < vertices.length; offset += VERTEX_FLOATS) {
      const height = Math.max(0, (vertices[offset + 2] ?? 0) / (top || 1));
      vertices[offset + 10] = height * height;
    }
    return { vertices, closed: !this.sheets };
  }
}

/** The twelve corners and twenty faces of an icosahedron, faces wound outward. */
const GOLDEN = (1 + Math.sqrt(5)) / 2;
const ICOSAHEDRON_CORNERS: readonly Point[] = (
  [
    [-1, GOLDEN, 0],
    [1, GOLDEN, 0],
    [-1, -GOLDEN, 0],
    [1, -GOLDEN, 0],
    [0, -1, GOLDEN],
    [0, 1, GOLDEN],
    [0, -1, -GOLDEN],
    [0, 1, -GOLDEN],
    [GOLDEN, 0, -1],
    [GOLDEN, 0, 1],
    [-GOLDEN, 0, -1],
    [-GOLDEN, 0, 1],
  ] satisfies Point[]
).map(unit);
const ICOSAHEDRON_FACES: readonly (readonly [number, number, number])[] = [
  [0, 11, 5],
  [0, 5, 1],
  [0, 1, 7],
  [0, 7, 10],
  [0, 10, 11],
  [1, 5, 9],
  [5, 11, 4],
  [11, 10, 2],
  [10, 7, 6],
  [7, 1, 8],
  [3, 9, 4],
  [3, 4, 2],
  [3, 2, 6],
  [3, 6, 8],
  [3, 8, 9],
  [4, 9, 5],
  [2, 4, 11],
  [6, 2, 10],
  [8, 6, 7],
  [9, 8, 1],
];

/** The unit sphere's triangles: an icosahedron, its faces split in four `detail` times. */
type Face = readonly [Point, Point, Point];

function sphereFaces(detail: number): Face[] {
  const cornerOf = (corner: number): Point => ICOSAHEDRON_CORNERS[corner] ?? [0, 0, 1];
  let faces: Face[] = ICOSAHEDRON_FACES.map(([a, b, third]) => [cornerOf(a), cornerOf(b), cornerOf(third)]);
  for (let level = 0; level < detail; level++) {
    faces = faces.flatMap(([a, b, third]): Face[] => {
      const [nearB, nearThird, nearA] = [unit(add(a, b)), unit(add(b, third)), unit(add(third, a))];
      return [
        [a, nearB, nearA],
        [nearB, b, nearThird],
        [nearA, nearThird, third],
        [nearB, nearThird, nearA],
      ];
    });
  }
  return faces;
}

/** How a lump of foliage or stone is shaped and coloured. */
export interface Lump {
  readonly centre: Point;
  readonly radii: Point;
  /** 0 an icosahedron (20 triangles), 1 split once (80). */
  readonly detail: 0 | 1;
  /** How far each corner is pushed in or out, a share of the radius. */
  readonly jitter: number;
  readonly seed: number;
  /** 0 faceted like stone, 1 as smooth as a ball, between for foliage. */
  readonly soft: number;
  readonly leaf: number;
  /** The colour at a height in the lump (-1 bottom, 1 top) for a random draw: each corner's, blended across the
   *  faces as foliage is, or each face's when `faceted`, as stone and a shrub's flowers are. */
  readonly colour: (height: number, draw: number) => Colour;
  readonly faceted?: boolean;
  /** Corners below this height in the lump (-1..1) are pressed up to it: a flat underside, as a rock sits. */
  readonly floor?: number;
}

/** A lump: a sphere's faces, its corners jittered alike wherever faces share them, so it stays closed. */
export function lump(builder: MeshBuilder, shape: Lump): void {
  const random = randomStream(shape.seed);
  const pushed = new Map<string, { push: number; draw: number }>();
  const cornerOf = (onSphere: Point) => {
    const key = onSphere.map((value) => value.toFixed(5)).join(',');
    let known = pushed.get(key);
    if (!known) {
      known = { push: 1 + shape.jitter * (random() * 2 - 1), draw: random() };
      pushed.set(key, known);
    }
    return known;
  };
  const corner = (onSphere: Point): Point => {
    const { push } = cornerOf(onSphere);
    const lifted: Point = [onSphere[0], onSphere[1], Math.max(onSphere[2], shape.floor ?? -1)];
    return add(shape.centre, [
      lifted[0] * shape.radii[0] * push,
      lifted[1] * shape.radii[1] * push,
      lifted[2] * shape.radii[2] * push,
    ]);
  };
  const draws = randomStream(shape.seed ^ 0x5bd1e995);
  for (const [a, b, third] of sphereFaces(shape.detail)) {
    const corners = [corner(a), corner(b), corner(third)] as const;
    const face = unit(cross(sub(corners[1], corners[0]), sub(corners[2], corners[0])));
    // The sphere's own normal, squashed as the lump is, so a flat lump lights as a flat lump.
    const round = (onSphere: Point) =>
      blend(
        face,
        unit([onSphere[0] / shape.radii[0], onSphere[1] / shape.radii[1], onSphere[2] / shape.radii[2]]),
        shape.soft,
      );
    const height = (a[2] + b[2] + third[2]) / 3;
    const tinted = (onSphere: Point) => shape.colour(onSphere[2], cornerOf(onSphere).draw);
    builder.triangle(...corners, shape.colour(height, draws()), {
      normals: [round(a), round(b), round(third)],
      ...(shape.faceted ? {} : { colours: [tinted(a), tinted(b), tinted(third)] }),
      leaf: shape.leaf,
    });
  }
}

/** A tube along a path: a trunk, a branch, a cactus's arm. Closed at both ends. */
export interface Tube {
  readonly path: readonly Point[];
  readonly radii: readonly number[];
  readonly sides: number;
  /** The colour of each ring's band, by the ring's index along the path. */
  readonly colour: (ring: number) => Colour;
  /** A share of the radius every other corner of a ring is pulled in: ribs. */
  readonly ribs?: number;
}

/** A tube whose rings turn counter-clockwise about the path, smooth round its sides, with flat caps. */
export function tube(builder: MeshBuilder, shape: Tube): void {
  const { path, radii, sides } = shape;
  const rings = path.map((centre, index) => {
    const before = path[Math.max(0, index - 1)] ?? centre;
    const after = path[Math.min(path.length - 1, index + 1)] ?? centre;
    const along = unit(sub(after, before));
    const reference: Point = Math.abs(along[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    const across = unit(cross(reference, along));
    const third = cross(along, across);
    const radius = radii[index] ?? radii[radii.length - 1] ?? 0.1;
    return Array.from({ length: sides }, (_unused, side) => {
      const angle = (side / sides) * Math.PI * 2;
      const pull = side % 2 === 1 ? 1 - (shape.ribs ?? 0) : 1;
      const out = add(scale(across, Math.cos(angle)), scale(third, Math.sin(angle)));
      return { at: add(centre, scale(out, radius * pull)), out };
    });
  });
  for (let index = 0; index + 1 < rings.length; index++) {
    const [lower = [], upper = []] = [rings[index], rings[index + 1]];
    const colour = shape.colour(index);
    for (let side = 0; side < sides; side++) {
      const next = (side + 1) % sides;
      const [low, lowNext, highNext, high] = [lower[side], lower[next], upper[next], upper[side]];
      if (!low || !lowNext || !highNext || !high) continue;
      builder.triangle(low.at, lowNext.at, highNext.at, colour, { normals: [low.out, lowNext.out, highNext.out] });
      builder.triangle(low.at, highNext.at, high.at, colour, { normals: [low.out, highNext.out, high.out] });
    }
  }
  const cap = (ring: readonly { at: Point }[], centre: Point, upward: boolean, colour: Colour) => {
    for (let side = 0; side < sides; side++) {
      const [here, next] = [ring[side]?.at, ring[(side + 1) % sides]?.at];
      if (!here || !next) continue;
      if (upward) builder.triangle(centre, here, next, colour);
      else builder.triangle(centre, next, here, colour);
    }
  };
  const [first, last] = [rings[0] ?? [], rings[rings.length - 1] ?? []];
  cap(first, path[0] ?? [0, 0, 0], false, shape.colour(0));
  cap(last, path[path.length - 1] ?? [0, 0, 0], true, shape.colour(Math.max(0, rings.length - 2)));
}

/** A cone from a ring round `base` to `apex`: a conifer's tier. Its underside rises `hollow` metres into it, as
 *  boughs droop from the trunk, so seen from the side it is no flat plate. Closed while `hollow` is short of `apex`. */
export function cone(
  builder: MeshBuilder,
  shape: { base: Point; apex: Point; radius: number; sides: number; hollow: number; colour: (side: number) => Colour },
): void {
  const { base, apex, radius, sides } = shape;
  const height = apex[2] - base[2];
  const inner: Point = [base[0], base[1], base[2] + shape.hollow];
  const ring = Array.from({ length: sides }, (_unused, side) => {
    const angle = (side / sides) * Math.PI * 2;
    const out: Point = [Math.cos(angle), Math.sin(angle), 0];
    return { at: add(base, scale(out, radius)), out: unit([out[0] * height, out[1] * height, radius]) };
  });
  for (let side = 0; side < sides; side++) {
    const [here, next] = [ring[side], ring[(side + 1) % sides]];
    if (!here || !next) continue;
    const top = unit(add(here.out, next.out));
    builder.triangle(here.at, next.at, apex, shape.colour(side), { normals: [here.out, next.out, top], leaf: 1 });
    builder.triangle(inner, next.at, here.at, shade(shape.colour(side), 0.75), { leaf: 1 });
  }
}

/** A blade from `base` to `tip`, bending toward `lean` halfway, `width` wide at its foot: grass, a reed. */
export function blade(
  builder: MeshBuilder,
  base: Point,
  tip: Point,
  width: number,
  colours: { readonly foot: Colour; readonly tip: Colour },
): void {
  const along = sub(tip, base);
  const flat = unit([along[0], along[1], 0]);
  const side: Point = Math.hypot(along[0], along[1]) > 1e-6 ? [-flat[1], flat[0], 0] : [1, 0, 0];
  const half = scale(side, width / 2);
  const middle = add(base, [along[0] * 0.35, along[1] * 0.35, along[2] * 0.6]);
  const [left, right] = [sub(base, half), add(base, half)];
  const [middleLeft, middleRight] = [sub(middle, scale(half, 0.6)), add(middle, scale(half, 0.6))];
  // Grass lit by its normals alone flickers dark as it turns; tilted up, it lights as the ground it covers.
  const up: Point = [0, 0, 1];
  const facing = blend(unit(cross(sub(right, left), sub(middle, left))), up, 0.6);
  const normals = [facing, facing, facing] as const;
  const halfway = mixColour(colours.foot, colours.tip, 0.5);
  builder.sheet(left, right, middleRight, colours.foot, { normals, leaf: 1 });
  builder.sheet(left, middleRight, middleLeft, halfway, { normals, leaf: 1 });
  builder.sheet(middleLeft, middleRight, tip, colours.tip, { normals, leaf: 1 });
}

/** How a frond grows: a palm's leaf, a fern's. */
export interface Frond {
  readonly base: Point;
  /** The compass angle it grows toward, radians, and how steeply it rises at first. */
  readonly bearing: number;
  readonly rise: number;
  readonly length: number;
  readonly width: number;
  /** How far its tip falls below a straight line, a share of its length. */
  readonly droop: number;
  readonly segments: number;
  /** How far its two halves fold down from its spine, a share of its width: a palm leaf's V. */
  readonly fold: number;
  readonly colour: Colour;
}

/** A frond: a spine arching out and down, two halves either side of it narrowing to the tip. */
export function frond(builder: MeshBuilder, shape: Frond): void {
  const heading: Point = [Math.cos(shape.bearing), Math.sin(shape.bearing), 0];
  const side: Point = [-heading[1], heading[0], 0];
  const spine = Array.from({ length: shape.segments + 1 }, (_unused, index) => {
    const along = index / shape.segments;
    const out = shape.length * along;
    const lift = shape.length * (shape.rise * along - shape.droop * along * along);
    return add(shape.base, add(scale(heading, out), [0, 0, lift]));
  });
  const halfWidth = (index: number) => {
    const along = index / shape.segments;
    return shape.width * 0.5 * Math.sin(Math.PI * Math.min(1, along * 1.15)) + 0.02;
  };
  const edge = (index: number, way: number): Point => {
    const width = halfWidth(index);
    return add(spine[index] ?? shape.base, add(scale(side, way * width), [0, 0, -shape.fold * width]));
  };
  const up: Point = [0, 0, 1];
  for (let index = 0; index < shape.segments; index++) {
    const [here, next] = [spine[index] ?? shape.base, spine[index + 1] ?? shape.base];
    const shaded = shade(shape.colour, 0.85 + 0.25 * (index / shape.segments));
    for (const way of [-1, 1]) {
      const [edgeHere, edgeNext] = [edge(index, way), edge(index + 1, way)];
      const face = unit(cross(sub(next, here), sub(edgeHere, here)));
      const normal = blend(face[2] < 0 ? scale(face, -1) : face, up, 0.5);
      const normals = [normal, normal, normal] as const;
      builder.sheet(here, edgeHere, next, shaded, { normals, leaf: 1 });
      builder.sheet(next, edgeHere, edgeNext, shaded, { normals, leaf: 1 });
    }
  }
}
