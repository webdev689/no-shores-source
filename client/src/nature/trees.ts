import {
  type Colour,
  cone,
  lump,
  type Mesh,
  MeshBuilder,
  mixColour,
  type Point,
  randomStream,
  shade,
  tube,
  vector,
} from './shapes.ts';

/** A plant's two meshes: the near one, and the few triangles drawn past it (none for what fades out first). */
export interface Plant {
  readonly near: Mesh;
  readonly far: Mesh | null;
}

/** Foliage darkens toward the crown's underside and varies a little face to face: light caught and held. */
export const foliage =
  (leaves: Colour, depth = 0.4) =>
  (height: number, draw: number): Colour =>
    shade(leaves, (1 - depth + depth * (0.5 + 0.5 * height)) * (0.9 + 0.2 * draw));

/** Bark darkens toward the foot, darkest at the ground, where it meets the land's shade. */
const barkBands = (bark: Colour, rings: number) => (ring: number) =>
  shade(bark, 0.55 + (0.45 * ring) / Math.max(1, rings));

/** A trunk rising `height` with a gentle lean and taper, `segments` rings high. */
export function trunk(
  builder: MeshBuilder,
  shape: { height: number; radius: number; top: number; lean: Point; sides: number; segments: number; bark: Colour },
): Point[] {
  const path: Point[] = [];
  const radii: number[] = [];
  for (let ring = 0; ring <= shape.segments; ring++) {
    const along = ring / shape.segments;
    path.push([shape.lean[0] * along * along, shape.lean[1] * along * along, shape.height * along]);
    radii.push(shape.radius + (shape.top - shape.radius) * along);
  }
  tube(builder, { path, radii, sides: shape.sides, colour: barkBands(shape.bark, shape.segments) });
  return path;
}

/** A branch from a point on the trunk out to where a lobe of the crown sits. */
function branch(builder: MeshBuilder, from: Point, to: Point, radius: number, bark: Colour): void {
  const bend: Point = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, from[2] + (to[2] - from[2]) * 0.7];
  tube(builder, {
    path: [from, bend, to],
    radii: [radius, radius * 0.75, radius * 0.45],
    sides: 4,
    colour: () => bark,
  });
}

/** A buttress: a thin wall of wood from up the trunk out along the ground, a wedge closed all round. */
function buttress(builder: MeshBuilder, angle: number, radius: number, height: number, bark: Colour): void {
  const way: Point = [Math.cos(angle), Math.sin(angle), 0];
  const across: Point = [-way[1] * radius * 0.18, way[0] * radius * 0.18, 0];
  const wall: Point[] = [
    [way[0] * radius * 0.5, way[1] * radius * 0.5, -0.2],
    [way[0] * radius * 3.4, way[1] * radius * 3.4, -0.2],
    [way[0] * radius * 0.5, way[1] * radius * 0.5, height],
  ];
  const left = wall.map((corner) => vector.sub(corner, across));
  const right = wall.map((corner) => vector.add(corner, across));
  const [leftA, leftB, leftC] = [left[0] ?? [0, 0, 0], left[1] ?? [0, 0, 0], left[2] ?? [0, 0, 0]];
  const [rightA, rightB, rightC] = [right[0] ?? [0, 0, 0], right[1] ?? [0, 0, 0], right[2] ?? [0, 0, 0]];
  builder.triangle(leftA, leftB, leftC, bark);
  builder.triangle(rightA, rightC, rightB, bark);
  // Each edge of the left face, walked as that face walks it, is joined to the right face's by a quad.
  for (const [from, to] of [
    [0, 1],
    [1, 2],
    [2, 0],
  ] as const) {
    const [leftFrom, leftTo] = [left[from] ?? leftA, left[to] ?? leftA];
    const [rightFrom, rightTo] = [right[from] ?? rightA, right[to] ?? rightA];
    builder.triangle(leftTo, leftFrom, rightFrom, bark);
    builder.triangle(leftTo, rightFrom, rightTo, bark);
  }
}

/** A broadleaf tree: a trunk, two branches and a crown of a core with lobes swelling out of it. */
export interface Broadleaf {
  readonly seed: number;
  readonly height: number;
  readonly trunkRadius: number;
  /** The crown's middle, metres up, and its half-widths. */
  readonly crownAt: number;
  readonly crown: Point;
  readonly lobes: number;
  readonly lobe: number;
  readonly bark: Colour;
  readonly leaves: Colour;
  /** Fins at the trunk's foot, as a rainforest giant stands on. */
  readonly fins?: number;
}

export function broadleaf(shape: Broadleaf): Plant {
  const random = randomStream(shape.seed);
  const near = new MeshBuilder();
  const lean: Point = [(random() - 0.5) * 0.8, (random() - 0.5) * 0.8, 0];
  const trunkShape = { height: shape.crownAt, radius: shape.trunkRadius, top: shape.trunkRadius * 0.55, lean };
  trunk(near, { ...trunkShape, sides: 5, segments: 3, bark: shape.bark });
  const centre: Point = [lean[0], lean[1], shape.crownAt];
  const [wide, deep, tall] = shape.crown;
  // A smooth round core, and lobes in two layers about it: a wider, deeper ring below and smaller, sunlit clumps
  // above, each its own size, shade and place, so the outline is ragged and the crown reads as layered leaves.
  lump(near, {
    centre,
    radii: [wide * 0.72, deep * 0.72, tall * 0.72],
    detail: 1,
    jitter: 0.12,
    seed: shape.seed + 1,
    soft: 0.8,
    leaf: 1,
    colour: foliage(shade(shape.leaves, 0.9), 0.25),
  });
  for (let index = 0; index < shape.lobes; index++) {
    const upper = index % 2 === 1;
    const up = upper ? 0.35 + random() * 0.5 : -0.45 + random() * 0.45;
    const out = (upper ? 0.45 : 0.72) * (0.85 + random() * 0.3);
    const angle = index * 2.39996 + random() * 0.7;
    const spot: Point = [
      centre[0] + Math.cos(angle) * wide * out,
      centre[1] + Math.sin(angle) * deep * out,
      centre[2] + up * tall * 0.62,
    ];
    if (index < 2) {
      branch(near, [lean[0] * 0.3, lean[1] * 0.3, shape.crownAt * 0.55], spot, shape.trunkRadius * 0.4, shape.bark);
    }
    const size = shape.lobe * (upper ? 0.75 : 1) * (0.75 + random() * 0.5);
    lump(near, {
      centre: spot,
      radii: [size, size, size * 0.8],
      detail: 0,
      jitter: 0.24,
      seed: shape.seed + index * 7919,
      soft: 0.8,
      leaf: 1,
      colour: foliage(shade(shape.leaves, (upper ? 1.06 : 0.9) * (0.92 + random() * 0.16)), 0.25),
    });
  }
  for (let fin = 0; fin < (shape.fins ?? 0); fin++) {
    const angle = (fin / (shape.fins ?? 1)) * Math.PI * 2 + random() * 0.5;
    buttress(near, angle, shape.trunkRadius, shape.height * 0.14, shade(shape.bark, 0.85));
  }
  const far = new MeshBuilder();
  trunk(far, { ...trunkShape, radius: shape.trunkRadius * 1.1, sides: 3, segments: 1, bark: shape.bark });
  lump(far, {
    centre,
    radii: [wide * 0.62 + shape.lobe * 0.9, deep * 0.62 + shape.lobe * 0.9, tall * 0.55 + shape.lobe * 0.8],
    detail: 0,
    jitter: 0.08,
    seed: shape.seed + 2,
    soft: 0.85,
    leaf: 1,
    colour: foliage(shape.leaves),
  });
  return { near: near.finish(), far: far.finish() };
}

/** A conifer: a thin trunk and tiers of drooping boughs, narrowing to the top. */
export interface Conifer {
  readonly seed: number;
  readonly height: number;
  readonly width: number;
  readonly tiers: number;
  /** Where the lowest tier starts, a share of the height. */
  readonly skirt: number;
  readonly bark: Colour;
  readonly needles: Colour;
}

export function conifer(shape: Conifer): Plant {
  const random = randomStream(shape.seed);
  const near = new MeshBuilder();
  const trunkShape = { radius: shape.width * 0.07, top: shape.width * 0.03, lean: [0, 0, 0] as Point };
  trunk(near, { ...trunkShape, height: shape.height * 0.9, sides: 5, segments: 2, bark: shape.bark });
  const start = shape.height * shape.skirt;
  const span = shape.height - start;
  for (let tier = 0; tier < shape.tiers; tier++) {
    const along = tier / shape.tiers;
    const base = start + span * along * 0.9;
    // Every other tier a little narrower: the jagged edge a spruce shows against the sky.
    const radius = (shape.width / 2) * (1 - along * 0.85) * (tier % 2 === 0 ? 1 : 0.86) * (0.92 + random() * 0.16);
    const top = Math.min(shape.height, base + (span * 1.7) / shape.tiers + radius * 0.4);
    const tierColour = shade(shape.needles, 0.85 + 0.3 * along);
    cone(near, {
      base: [0, 0, base],
      apex: [0, 0, top],
      radius,
      sides: 7,
      hollow: (top - base) * 0.45,
      colour: (side) => shade(tierColour, 0.92 + (0.16 * ((side * 5) % 3)) / 2),
    });
  }
  const far = new MeshBuilder();
  trunk(far, {
    ...trunkShape,
    height: start + 0.5,
    radius: shape.width * 0.08,
    sides: 3,
    segments: 1,
    bark: shape.bark,
  });
  cone(far, {
    base: [0, 0, start],
    apex: [0, 0, shape.height],
    radius: shape.width * 0.48,
    sides: 6,
    hollow: span * 0.2,
    colour: () => shade(shape.needles, 0.95),
  });
  return { near: near.finish(), far: far.finish() };
}

/** A pine as the coast grows it: a long bare trunk, red-brown above, flat clouds of needles held high. */
export function umbrellaPine(seed: number, height: number, bark: Colour, needles: Colour): Plant {
  const random = randomStream(seed);
  const near = new MeshBuilder();
  const lean: Point = [(random() - 0.5) * 2.2, (random() - 0.5) * 2.2, 0];
  const path = trunk(near, { height, radius: 0.32, top: 0.14, lean, sides: 6, segments: 4, bark });
  const colour = foliage(needles, 0.5);
  const top = path[path.length - 1] ?? [0, 0, height];
  for (let cloud = 0; cloud < 4; cloud++) {
    const angle = cloud * 2.1 + random();
    const out = cloud === 0 ? 0 : 1.6 + random() * 1.2;
    const spot: Point = [
      top[0] + Math.cos(angle) * out,
      top[1] + Math.sin(angle) * out,
      top[2] - cloud * 0.9 - random() * 0.5,
    ];
    if (cloud > 0) branch(near, [top[0] * 0.8, top[1] * 0.8, spot[2] - 1.5], spot, 0.12, bark);
    const size = (cloud === 0 ? 2.8 : 2.0) + random() * 0.5;
    lump(near, {
      centre: spot,
      radii: [size, size, size * 0.42],
      detail: 0,
      jitter: 0.2,
      seed: seed + cloud * 31,
      soft: 0.5,
      leaf: 1,
      colour,
    });
  }
  const far = new MeshBuilder();
  trunk(far, { height, radius: 0.36, top: 0.2, lean, sides: 3, segments: 1, bark });
  lump(far, {
    centre: [top[0], top[1], top[2] - 1.2],
    radii: [4, 4, 1.7],
    detail: 0,
    jitter: 0.1,
    seed: seed + 5,
    soft: 0.8,
    leaf: 1,
    colour,
  });
  return { near: near.finish(), far: far.finish() };
}

/** A birch: a slender white trunk marked with dark bands, and a light, airy crown of small lobes. */
export function birch(seed: number, height: number, leaves: Colour): Plant {
  const random = randomStream(seed);
  const near = new MeshBuilder();
  const white: Colour = [0.86, 0.85, 0.8];
  const lean: Point = [(random() - 0.5) * 1.2, (random() - 0.5) * 1.2, 0];
  const path: Point[] = [];
  for (let ring = 0; ring <= 5; ring++) {
    const along = ring / 5;
    path.push([lean[0] * along * along, lean[1] * along * along, height * 0.85 * along]);
  }
  tube(near, {
    path,
    radii: path.map((_unused, ring) => 0.2 - ring * 0.025),
    sides: 5,
    colour: (ring) => (ring % 2 === 1 ? shade(white, 0.35) : white),
  });
  // Many small clumps up the top half of the trunk: a birch's crown is light and open.
  for (let index = 0; index < 8; index++) {
    const up = 0.42 + (index / 8) * 0.55;
    const angle = index * 2.4 + random();
    const out = 0.7 + random() * 0.7 - up * 0.4;
    const spot: Point = [lean[0] * up + Math.cos(angle) * out, lean[1] * up + Math.sin(angle) * out, height * up];
    const size = 1.15 + random() * 0.45 - up * 0.4;
    lump(near, {
      centre: spot,
      radii: [size, size, size * 1.2],
      detail: 0,
      jitter: 0.22,
      seed: seed + index * 13,
      soft: 0.75,
      leaf: 1,
      colour: foliage(shade(leaves, 0.88 + random() * 0.24), 0.35),
    });
  }
  const far = new MeshBuilder();
  trunk(far, { height: height * 0.6, radius: 0.24, top: 0.15, lean, sides: 3, segments: 1, bark: white });
  lump(far, {
    centre: [lean[0] * 0.7, lean[1] * 0.7, height * 0.68],
    radii: [1.9, 1.9, height * 0.3],
    detail: 0,
    jitter: 0.1,
    seed: seed + 3,
    soft: 0.85,
    leaf: 1,
    colour: foliage(leaves, 0.35),
  });
  return { near: near.finish(), far: far.finish() };
}

/** How much a vertex is moss rather than leaf: the shader knows moss by it and lets it go past a stone's throw. */
export const MOSS_LEAF = 0.6;

/** A tree whose crown is broad, flat tiers drooping at their edges, wider than it is tall: a swamp cypress, a
 *  rainforest tree. */
export interface Tiered {
  readonly seed: number;
  /** To the crown's top, metres, and the share of it where the lowest tier sits. */
  readonly height: number;
  readonly crownBase: number;
  /** How far the lowest tier reaches from the trunk, metres. */
  readonly spread: number;
  readonly tiers: 2 | 3;
  readonly trunkRadius: number;
  /** The foot's radius over the trunk's. */
  readonly flare: number;
  readonly fins: number;
  readonly bark: Colour;
  readonly leaves: Colour;
  /** Clumps of moss hung under the lowest tier's edge. */
  readonly moss?: Colour;
}

export function tiered(shape: Tiered): Plant {
  const random = randomStream(shape.seed);
  const near = new MeshBuilder();
  const lean: Point = [(random() - 0.5) * 0.6, (random() - 0.5) * 0.6, 0];
  const [radius, base, depth] = [
    shape.trunkRadius,
    shape.height * shape.crownBase,
    shape.height * (1 - shape.crownBase),
  ];
  const trunkTop: Point = [lean[0], lean[1], shape.height * 0.82];
  const path: Point[] = [
    [0, 0, 0],
    [lean[0] * 0.02, lean[1] * 0.02, base * 0.1],
    [lean[0] * 0.2, lean[1] * 0.2, base * 0.45],
    trunkTop,
  ];
  tube(near, {
    path,
    radii: [radius * shape.flare, radius * 1.2, radius, radius * 0.35],
    sides: 6,
    colour: barkBands(shape.bark, 3),
  });
  for (let fin = 0; fin < shape.fins; fin++) {
    buttress(
      near,
      (fin / shape.fins) * Math.PI * 2 + random() * 0.6,
      radius,
      shape.height * 0.08,
      shade(shape.bark, 0.8),
    );
  }
  // Each tier a flat middle and lobes round it, the outer ones lower: a canopy that droops at its edges, its tiers
  // stepping in as they rise.
  const rings = shape.tiers === 2 ? [3, 3] : [3, 2, 1];
  for (const [tier, ring] of rings.entries()) {
    const share = tier / shape.tiers;
    const level = base + depth * (0.2 + (0.75 * tier) / Math.max(1, shape.tiers - 1));
    const reach = shape.spread * (1 - 0.32 * share) * (0.9 + random() * 0.2);
    const thick = (depth / (shape.tiers + 1)) * 0.38;
    const middle: Point = [lean[0] + (random() - 0.5), lean[1] + (random() - 0.5), level];
    const tierLeaves = shade(shape.leaves, 0.88 + 0.12 * share + random() * 0.08);
    lump(near, {
      centre: middle,
      radii: [reach * 0.6, reach * 0.55, thick],
      detail: 0,
      jitter: 0.2,
      seed: shape.seed + tier * 31,
      soft: 1,
      leaf: 1,
      colour: foliage(tierLeaves, 0.3),
    });
    for (let lobe = 0; lobe < ring; lobe++) {
      const angle = (lobe / ring) * Math.PI * 2 + tier * 1.3 + random() * 0.9;
      const out = reach * (0.55 + random() * 0.15);
      const droop = thick * (0.6 + random() * 0.4);
      const spot: Point = [middle[0] + Math.cos(angle) * out, middle[1] + Math.sin(angle) * out, level - droop];
      const size = reach * (0.4 + random() * 0.1);
      lump(near, {
        centre: spot,
        radii: [size, size * 0.9, thick * 0.7],
        detail: 0,
        jitter: 0.25,
        seed: shape.seed + tier * 31 + lobe * 7,
        soft: 1,
        leaf: 1,
        colour: foliage(shade(tierLeaves, 0.9 + random() * 0.15), 0.3),
      });
      if (shape.moss && tier < 2)
        mossClump(
          near,
          [spot[0] + Math.cos(angle) * size * 0.6, spot[1] + Math.sin(angle) * size * 0.6, spot[2] - thick * 0.6],
          angle,
          shape.moss,
          random,
        );
    }
  }
  const far = new MeshBuilder();
  trunk(far, { height: base, radius: radius * 1.3, top: radius * 0.7, lean, sides: 3, segments: 1, bark: shape.bark });
  lump(far, {
    centre: [lean[0], lean[1], base + depth * 0.5],
    radii: [shape.spread, shape.spread, depth * 0.55],
    detail: 0,
    jitter: 0.12,
    seed: shape.seed + 9,
    soft: 1,
    leaf: 1,
    colour: foliage(shape.leaves, 0.3),
  });
  return { near: near.finish(), far: far.finish() };
}

/** A short clump of moss under a crown's edge: two dark strands crossed, hanging a metre or so. */
function mossClump(builder: MeshBuilder, from: Point, angle: number, moss: Colour, random: () => number): void {
  for (const turn of [angle, angle + Math.PI / 2]) {
    const side: Point = [-Math.sin(turn) * 0.3, Math.cos(turn) * 0.3, 0];
    const tip: Point = [from[0], from[1], from[2] - 0.6 - random() * 0.6];
    const outward = vector.unit([Math.cos(turn), Math.sin(turn), 0.4]);
    builder.sheet(vector.add(from, side), vector.sub(from, side), tip, moss, {
      normals: [outward, outward, outward],
      leaf: MOSS_LEAF,
    });
  }
}

/** A mangrove: arching prop roots holding a short trunk and a dense, low crown clear of the water. */
export function mangrove(seed: number, bark: Colour, leaves: Colour): Plant {
  const random = randomStream(seed);
  const near = new MeshBuilder();
  const roots = 5;
  for (let root = 0; root < roots; root++) {
    const angle = (root / roots) * Math.PI * 2 + random() * 0.6;
    const reach = 1.6 + random() * 0.8;
    const out = (share: number, up: number): Point => [
      Math.cos(angle) * reach * share,
      Math.sin(angle) * reach * share,
      up,
    ];
    tube(near, {
      path: [out(1, -0.3), out(0.85, 1.2), out(0.25, 2.2)],
      radii: [0.09, 0.1, 0.14],
      sides: 4,
      colour: () => bark,
    });
  }
  trunk(near, { height: 4.2, radius: 0.22, top: 0.14, lean: [0, 0, 0], sides: 6, segments: 2, bark });
  const colour = foliage(leaves, 0.45);
  lump(near, {
    centre: [0, 0, 4.6],
    radii: [3.0, 3.0, 1.7],
    detail: 1,
    jitter: 0.14,
    seed: seed + 1,
    soft: 0.6,
    leaf: 1,
    colour,
  });
  const far = new MeshBuilder();
  trunk(far, { height: 4, radius: 0.5, top: 0.2, lean: [0, 0, 0], sides: 3, segments: 1, bark });
  lump(far, {
    centre: [0, 0, 4.5],
    radii: [3.2, 3.2, 1.9],
    detail: 0,
    jitter: 0.1,
    seed: seed + 2,
    soft: 0.85,
    leaf: 1,
    colour,
  });
  return { near: near.finish(), far: far.finish() };
}

/** A dead tree: bleached and bare, a few spiky limbs. */
export function deadTree(seed: number, height: number, wood: Colour): Plant {
  const random = randomStream(seed);
  const near = new MeshBuilder();
  const far = new MeshBuilder();
  const lean: Point = [(random() - 0.5) * 1.4, (random() - 0.5) * 1.4, 0];
  trunk(near, { height, radius: 0.26, top: 0.05, lean, sides: 5, segments: 3, bark: wood });
  trunk(far, { height, radius: 0.3, top: 0.06, lean, sides: 3, segments: 1, bark: wood });
  const limbWood = mixColour(wood, [0.3, 0.28, 0.26], 0.3);
  for (let limb = 0; limb < 5; limb++) {
    const up = 0.35 + limb * 0.12;
    const angle = limb * 2.5 + random();
    const length = (1 - up) * height * 0.55 + 0.5;
    const from: Point = [lean[0] * up * up, lean[1] * up * up, height * up];
    const to: Point = [from[0] + Math.cos(angle) * length, from[1] + Math.sin(angle) * length, from[2] + length * 0.7];
    tube(near, { path: [from, to], radii: [0.09, 0.02], sides: 4, colour: () => limbWood });
    // The two lowest, longest limbs carry the outline far off.
    if (limb < 2) tube(far, { path: [from, to], radii: [0.12, 0.03], sides: 3, colour: () => limbWood });
  }
  return { near: near.finish(), far: far.finish() };
}
