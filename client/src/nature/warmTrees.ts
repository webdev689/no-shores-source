import { type Colour, frond, lump, MeshBuilder, type Point, randomStream, shade, tube } from './shapes.ts';
import { foliage, type Plant, trunk } from './trees.ts';

/** A palm: a ringed trunk curving up to a crown of drooping fronds. */
export interface Palm {
  readonly seed: number;
  readonly height: number;
  /** How far the trunk bows over, metres at the top. */
  readonly bow: number;
  readonly fronds: number;
  readonly frondLength: number;
  readonly bark: Colour;
  readonly leaves: Colour;
}

export function palm(shape: Palm): Plant {
  const random = randomStream(shape.seed);
  const heading = random() * Math.PI * 2;
  const bowAt = (along: number): Point => [
    Math.cos(heading) * shape.bow * along * along,
    Math.sin(heading) * shape.bow * along * along,
    shape.height * along,
  ];
  const near = new MeshBuilder();
  const path = [0, 0.25, 0.5, 0.75, 1].map(bowAt);
  tube(near, {
    path,
    radii: [0.32, 0.24, 0.21, 0.19, 0.17],
    sides: 6,
    colour: (ring) => shade(shape.bark, ring % 2 === 0 ? 0.85 : 1.05),
  });
  const top = bowAt(1);
  const crown = foliage(shape.leaves, 0.3);
  lump(near, {
    centre: top,
    radii: [0.45, 0.45, 0.4],
    detail: 0,
    jitter: 0.1,
    seed: shape.seed + 1,
    soft: 0.6,
    leaf: 1,
    colour: crown,
  });
  for (let index = 0; index < shape.fronds; index++) {
    const bearing = (index / shape.fronds) * Math.PI * 2 + random() * 0.4;
    const young = index % 3 === 0;
    frond(near, {
      base: top,
      bearing,
      rise: young ? 0.9 : 0.45,
      length: shape.frondLength * (young ? 0.75 : 1) * (0.9 + random() * 0.2),
      width: shape.frondLength * 0.28,
      droop: young ? 0.9 : 1.15,
      segments: 4,
      fold: 0.45,
      colour: shade(shape.leaves, 0.9 + random() * 0.2),
    });
  }
  const far = new MeshBuilder();
  tube(far, { path: [bowAt(0), bowAt(0.5), bowAt(1)], radii: [0.36, 0.26, 0.2], sides: 3, colour: () => shape.bark });
  for (let index = 0; index < 5; index++) {
    frond(far, {
      base: top,
      bearing: (index / 5) * Math.PI * 2 + heading,
      rise: 0.45,
      length: shape.frondLength,
      width: shape.frondLength * 0.34,
      droop: 1.1,
      segments: 2,
      fold: 0,
      colour: shape.leaves,
    });
  }
  return { near: near.finish(), far: far.finish() };
}

/** An acacia: a forked trunk holding a wide, flat crown. */
export function acacia(seed: number, bark: Colour, leaves: Colour): Plant {
  const random = randomStream(seed);
  const near = new MeshBuilder();
  trunk(near, { height: 2.6, radius: 0.28, top: 0.2, lean: [0.2, 0, 0], sides: 6, segments: 2, bark });
  const colour = foliage(leaves, 0.55);
  const fork: Point = [0.2, 0, 2.5];
  const pads = 5;
  for (let pad = 0; pad < pads; pad++) {
    const angle = (pad / pads) * Math.PI * 2 + random() * 0.6;
    const out = pad === 0 ? 0.4 : 2.6 + random() * 1.4;
    const spot: Point = [fork[0] + Math.cos(angle) * out, fork[1] + Math.sin(angle) * out, 6.2 + random() * 0.9];
    if (pad < 4) {
      const bend: Point = [fork[0] + (spot[0] - fork[0]) * 0.45, fork[1] + (spot[1] - fork[1]) * 0.45, 4.6];
      tube(near, { path: [fork, bend, spot], radii: [0.17, 0.11, 0.06], sides: 4, colour: () => bark });
    }
    const size = pad === 0 ? 3.2 : 2.3 + random() * 0.6;
    lump(near, {
      centre: spot,
      radii: [size, size, 0.7],
      detail: 0,
      jitter: 0.22,
      seed: seed + pad * 11,
      soft: 0.45,
      leaf: 1,
      colour,
    });
  }
  const far = new MeshBuilder();
  trunk(far, { height: 5.6, radius: 0.32, top: 0.14, lean: [0.2, 0, 0], sides: 3, segments: 1, bark });
  lump(far, {
    centre: [0.2, 0, 6.6],
    radii: [5.2, 5.2, 0.95],
    detail: 0,
    jitter: 0.12,
    seed: seed + 3,
    soft: 0.7,
    leaf: 1,
    colour,
  });
  return { near: near.finish(), far: far.finish() };
}

/** A baobab: a vast bottle of a trunk, stubby limbs and thin tufts of leaves. */
export function baobab(seed: number, bark: Colour, leaves: Colour): Plant {
  const random = randomStream(seed);
  const near = new MeshBuilder();
  const path: Point[] = [0, 0.25, 0.5, 0.72, 0.85].map((along) => [0, 0, 11 * along]);
  tube(near, { path, radii: [2.0, 2.3, 1.9, 1.15, 0.8], sides: 9, colour: (ring) => shade(bark, 0.82 + ring * 0.06) });
  const colour = foliage(leaves, 0.4);
  for (let limb = 0; limb < 5; limb++) {
    const angle = (limb / 5) * Math.PI * 2 + random() * 0.7;
    const from: Point = [Math.cos(angle) * 0.4, Math.sin(angle) * 0.4, 9.0];
    const reach = 2.4 + random() * 1.4;
    const to: Point = [Math.cos(angle) * reach, Math.sin(angle) * reach, 10.6 + random() * 1.4];
    tube(near, { path: [from, to], radii: [0.4, 0.16], sides: 4, colour: () => bark });
    lump(near, {
      centre: to,
      radii: [1.5, 1.5, 0.9],
      detail: 0,
      jitter: 0.25,
      seed: seed + limb * 23,
      soft: 0.5,
      leaf: 1,
      colour,
    });
  }
  const far = new MeshBuilder();
  tube(far, {
    path: [path[0] ?? [0, 0, 0], path[2] ?? [0, 0, 5], path[4] ?? [0, 0, 9]],
    radii: [2.1, 2.0, 0.9],
    sides: 5,
    colour: () => bark,
  });
  lump(far, {
    centre: [0, 0, 10.8],
    radii: [3.6, 3.6, 1.4],
    detail: 0,
    jitter: 0.1,
    seed: seed + 3,
    soft: 0.7,
    leaf: 1,
    colour,
  });
  return { near: near.finish(), far: far.finish() };
}

/** A columnar cactus: a ribbed column with arms that turn up. */
export function cactus(seed: number, height: number, skin: Colour): Plant {
  const random = randomStream(seed);
  const near = new MeshBuilder();
  const far = new MeshBuilder();
  const ribbed = (ring: number) => shade(skin, 0.85 + 0.05 * ring);
  const column: Point[] = [0, 0.3, 0.6, 0.85, 0.97, 1].map((along) => [0, 0, height * along]);
  tube(near, { path: column, radii: [0.34, 0.36, 0.36, 0.34, 0.26, 0.1], sides: 8, ribs: 0.14, colour: ribbed });
  tube(far, {
    path: [column[0] ?? [0, 0, 0], column[4] ?? [0, 0, height]],
    radii: [0.4, 0.3],
    sides: 4,
    colour: () => skin,
  });
  const arms = 1 + Math.floor(random() * 2.5);
  for (let arm = 0; arm < arms; arm++) {
    const angle = arm * 2.3 + random() * 0.8;
    const way: Point = [Math.cos(angle), Math.sin(angle), 0];
    const joint = height * (0.35 + random() * 0.2);
    const out = 0.9 + random() * 0.4;
    const rise = height * (0.25 + random() * 0.15);
    const elbow: Point = [way[0] * out, way[1] * out, joint + 0.6];
    const foot: Point = [way[0] * 0.2, way[1] * 0.2, joint];
    const top: Point = [way[0] * out, way[1] * out, joint + rise];
    tube(near, {
      path: [foot, [way[0] * out * 0.8, way[1] * out * 0.8, joint + 0.15], elbow, top],
      radii: [0.2, 0.22, 0.23, 0.16],
      sides: 6,
      ribs: 0.12,
      colour: ribbed,
    });
    if (arm < 2) tube(far, { path: [foot, elbow, top], radii: [0.24, 0.26, 0.2], sides: 3, colour: () => skin });
  }
  return { near: near.finish(), far: far.finish() };
}
