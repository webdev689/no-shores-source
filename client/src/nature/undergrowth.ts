import {
  blade,
  type Colour,
  frond,
  lump,
  MeshBuilder,
  mixColour,
  type Point,
  randomStream,
  shade,
  tube,
} from './shapes.ts';
import { foliage, type Plant } from './trees.ts';

/** A shrub: a few lumps of foliage, flecked with a second colour (gorse's flowers, heather's bloom). */
export interface Shrub {
  readonly seed: number;
  readonly width: number;
  readonly height: number;
  readonly lumps: number;
  readonly leaves: Colour;
  readonly fleck?: { readonly colour: Colour; readonly share: number };
}

export function shrub(shape: Shrub): Plant {
  const random = randomStream(shape.seed);
  const base = foliage(shape.leaves, 0.45);
  const colour = (height: number, draw: number): Colour =>
    shape.fleck && draw < shape.fleck.share && height > -0.3 ? shape.fleck.colour : base(height, draw);
  const near = new MeshBuilder();
  // A dome of round clumps, one on top and the rest about it, their feet in the ground: a bush, never a slab.
  for (let index = 0; index < shape.lumps; index++) {
    const angle = index * 2.4 + random();
    const top = index === 0;
    const out = top ? 0 : shape.width * 0.3;
    const size = shape.width * (top ? 0.32 : 0.26) * (0.85 + random() * 0.3);
    lump(near, {
      centre: [Math.cos(angle) * out, Math.sin(angle) * out, shape.height * (top ? 0.62 : 0.38)],
      radii: [size, size, shape.height * (top ? 0.38 : 0.36)],
      detail: 0,
      jitter: 0.25,
      seed: shape.seed + index * 19,
      soft: 0.75,
      leaf: 1,
      colour: (height, draw) => shade(colour(height, draw), top ? 1.06 : 0.94),
    });
  }
  const far = new MeshBuilder();
  lump(far, {
    centre: [0, 0, shape.height * 0.45],
    radii: [shape.width * 0.55, shape.width * 0.55, shape.height * 0.52],
    detail: 0,
    jitter: 0.1,
    seed: shape.seed + 1,
    soft: 0.8,
    leaf: 1,
    colour: base,
  });
  return { near: near.finish(), far: far.finish() };
}

/** A woody bush: stems fanning from one foot, each ending in a small tuft of leaves, gaps of sky between them. */
export interface Bush {
  readonly seed: number;
  readonly width: number;
  readonly height: number;
  readonly stems: number;
  /** A tuft's radius, a share of the width. */
  readonly tuft: number;
  /** Tufts held level at the top, as a thorn bush's, rather than in a dome. */
  readonly flat: boolean;
  readonly leaves: Colour;
  readonly wood: Colour;
}

export function bush(shape: Bush): Plant {
  const random = randomStream(shape.seed);
  const near = new MeshBuilder();
  const tuftRadius = shape.width * shape.tuft;
  for (let stem = 0; stem < shape.stems; stem++) {
    const angle = stem * 2.39996 + random() * 0.6;
    const out = shape.width * (stem === 0 ? 0.05 : 0.22 + random() * 0.16);
    const rise = shape.height * (shape.flat ? 0.82 + random() * 0.08 : stem === 0 ? 0.78 : 0.45 + random() * 0.25);
    const tip: Point = [Math.cos(angle) * out, Math.sin(angle) * out, rise];
    const foot: Point = [Math.cos(angle) * 0.04, Math.sin(angle) * 0.04, -0.05];
    blade(near, foot, tip, Math.max(0.04, shape.width * 0.05), { foot: shade(shape.wood, 0.7), tip: shape.wood });
    const size = tuftRadius * (0.8 + random() * 0.4);
    lump(near, {
      centre: [tip[0], tip[1], tip[2] + size * 0.2],
      radii: [size, size, size * (shape.flat ? 0.45 : 0.8)],
      detail: 0,
      jitter: 0.3,
      seed: shape.seed + stem * 23,
      soft: 0.75,
      leaf: 1,
      colour: foliage(shade(shape.leaves, 0.9 + random() * 0.2), 0.3),
    });
  }
  const far = new MeshBuilder();
  lump(far, {
    centre: [0, 0, shape.height * 0.6],
    radii: [shape.width * 0.6, shape.width * 0.6, shape.height * (shape.flat ? 0.5 : 0.55)],
    detail: 0,
    jitter: 0.1,
    seed: shape.seed + 1,
    soft: 0.8,
    leaf: 1,
    colour: foliage(shape.leaves, 0.3),
  });
  return { near: near.finish(), far: far.finish() };
}

/** A tuft: blades fanned out from one foot, its own height and colours: grass, reeds. */
export interface Tuft {
  readonly seed: number;
  readonly blades: number;
  readonly height: number;
  readonly spread: number;
  readonly width: number;
  readonly foot: Colour;
  readonly tip: Colour;
}

export function tuft(shape: Tuft): Plant {
  const random = randomStream(shape.seed);
  const near = new MeshBuilder();
  for (let index = 0; index < shape.blades; index++) {
    const angle = index * 2.4 + random() * 0.8;
    const lean = shape.spread * (0.4 + random() * 0.6);
    const height = shape.height * (0.65 + random() * 0.35);
    const foot: Point = [Math.cos(angle) * 0.08, Math.sin(angle) * 0.08, -0.05];
    const tip: Point = [Math.cos(angle) * lean, Math.sin(angle) * lean, height];
    const shadeBy = 0.85 + random() * 0.3;
    blade(near, foot, tip, shape.width, { foot: shade(shape.foot, shadeBy), tip: shade(shape.tip, shadeBy) });
  }
  return { near: near.finish(), far: null };
}

/** A fern: fronds arching out from a crown at the ground, or from a short trunk for a tree fern. */
export function fern(seed: number, size: number, leaves: Colour, trunkHeight = 0): Plant {
  const random = randomStream(seed);
  const near = new MeshBuilder();
  const bark: Colour = [0.28, 0.22, 0.16];
  if (trunkHeight > 0) {
    tube(near, {
      path: [
        [0, 0, -0.1],
        [0.1, 0, trunkHeight * 0.5],
        [0.15, 0.05, trunkHeight],
      ],
      radii: [0.2, 0.16, 0.18],
      sides: 5,
      colour: (ring) => shade(bark, 0.8 + ring * 0.15),
    });
  }
  const top: Point = trunkHeight > 0 ? [0.15, 0.05, trunkHeight] : [0, 0, 0.05];
  const fronds = trunkHeight > 0 ? 9 : 7;
  for (let index = 0; index < fronds; index++) {
    frond(near, {
      base: top,
      bearing: (index / fronds) * Math.PI * 2 + random() * 0.5,
      rise: 1.1 + random() * 0.4,
      length: size * (0.8 + random() * 0.3),
      width: size * 0.3,
      droop: 1.25,
      segments: 3,
      fold: 0.15,
      colour: mixColour(leaves, shade(leaves, 1.3), random()),
    });
  }
  if (trunkHeight <= 0) return { near: near.finish(), far: null };
  const far = new MeshBuilder();
  tube(far, { path: [[0, 0, -0.1], top], radii: [0.22, 0.18], sides: 3, colour: () => bark });
  lump(far, {
    centre: [top[0], top[1], top[2] + 0.1],
    radii: [size * 0.85, size * 0.85, size * 0.35],
    detail: 0,
    jitter: 0.15,
    seed: seed + 4,
    soft: 0.8,
    leaf: 1,
    colour: foliage(leaves, 0.3),
  });
  return { near: near.finish(), far: far.finish() };
}

/** A boulder: a faceted lump with a flat underside, its top dressed in moss or snow. */
export interface Rock {
  readonly seed: number;
  readonly size: Point;
  readonly stone: Colour;
  readonly cap?: { readonly colour: Colour; readonly from: number };
}

export function rock(shape: Rock): Plant {
  const colour = (height: number, draw: number): Colour => {
    const stone = shade(shape.stone, 0.82 + 0.3 * draw + 0.1 * height);
    return shape.cap && height > shape.cap.from ? mixColour(stone, shape.cap.colour, 0.85) : stone;
  };
  const near = new MeshBuilder();
  const centre: Point = [0, 0, shape.size[2] * 0.35];
  lump(near, {
    centre,
    radii: shape.size,
    detail: 1,
    jitter: 0.16,
    seed: shape.seed,
    soft: 0.12,
    leaf: 0,
    floor: -0.55,
    faceted: true,
    colour,
  });
  const far = new MeshBuilder();
  lump(far, {
    centre,
    radii: shape.size,
    detail: 0,
    jitter: 0.12,
    seed: shape.seed,
    soft: 0.2,
    leaf: 0,
    floor: -0.55,
    faceted: true,
    colour,
  });
  return { near: near.finish(), far: far.finish() };
}
