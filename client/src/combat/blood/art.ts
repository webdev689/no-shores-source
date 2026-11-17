import type { Cell, Tint } from './spray.ts';

/** The marks' sheet: eight cells a row, one row a kind, each a splat drawn from noise and distance fields at the start
 *  from a fixed seed. Its colour is white ink whose darkness is the film's thickness, its alpha the shape. */
export const ATLAS_SIZE = 1024;
export const ATLAS_CELLS = 8;
export const ATLAS_SEED = 0x5eed;
export const ATLAS_KINDS = ['pool', 'spatter', 'streak', 'drip', 'print'] as const;
export type MarkKind = (typeof ATLAS_KINDS)[number];

/** DFO's blood red, sampled from Daggerfall's blood texture, and how much darker a fresh mark may roll. */
export const BLOOD_BASE = [0.47, 0.04, 0.032] as const;
export const FRESH_VARIANCE = 0.12;
export const DRIED_TINT = [0.3, 0.13, 0.09, 1] as const;
/** A mark dries over three minutes in eight steps, checked every two seconds. */
export const DRY_TIME = 180;
export const DRY_STAGES = 8;
export const DRY_TICK = 2;
/** The film the shader draws: absorption per channel in display space, and how deep the ink runs. */
export const BLOOD_ABSORB = [0.5, 0.95, 0.95] as const;
export const DISPLAY_GAMMA = 2.2;
export const BLOOD_ABSORB_ENCODED = BLOOD_ABSORB.map((absorb) => absorb / DISPLAY_GAMMA);
export const INK_DEPTH = 0.18;

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

const smooth = (edge0: number, edge1: number, value: number): number => {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};
const TAU = Math.PI * 2;
const len = (x: number, y: number): number => Math.sqrt(x * x + y * y);
const gaussOf = (first: number, second: number): number =>
  Math.sqrt(-2 * Math.log(Math.max(1e-6, 1 - first))) * Math.cos(TAU * second);

function wobble(random: () => number, count: number, amount: number): (angle: number) => number {
  const table = Array.from({ length: count }, () => (random() * 2 - 1) * amount);
  return (angle) => {
    const along = ((((angle / TAU) % 1) + 1) % 1) * count;
    const index = Math.floor(along);
    const t = along - index;
    return (table[index % count] ?? 0) * (1 - t) + (table[(index + 1) % count] ?? 0) * t;
  };
}

const NOISE_SIZE = 64;
interface Noise {
  readonly value: (x: number, y: number) => number;
  readonly fbm: (x: number, y: number, octaves?: number) => number;
}
/** Value noise on a 64-cell lattice that wraps, and its fractal sum. */
function bloodNoise(random: () => number): Noise {
  const size = NOISE_SIZE;
  const grid = new Float32Array(size * size).map(() => random() * 2 - 1);
  const gridAt = (index: number): number => grid[index] ?? 0;
  const value = (x: number, y: number): number => {
    const cellX = Math.floor(x);
    const cellY = Math.floor(y);
    const inX = x - cellX;
    const inY = y - cellY;
    const easeX = inX * inX * (3 - 2 * inX);
    const easeY = inY * inY * (3 - 2 * inY);
    const westX = cellX & (size - 1);
    const eastX = (cellX + 1) & (size - 1);
    const northRow = (cellY & (size - 1)) * size;
    const southRow = ((cellY + 1) & (size - 1)) * size;
    const top = gridAt(northRow + westX) + (gridAt(northRow + eastX) - gridAt(northRow + westX)) * easeX;
    const bottom = gridAt(southRow + westX) + (gridAt(southRow + eastX) - gridAt(southRow + westX)) * easeX;
    return top + (bottom - top) * easeY;
  };
  const fbm = (x: number, y: number, octaves = 3): number => {
    let sum = 0;
    let amplitude = 1;
    let norm = 0;
    let frequency = 1;
    for (let octave = 0; octave < octaves; octave++) {
      sum += value(x * frequency + octave * 17.3, y * frequency - octave * 9.1) * amplitude;
      norm += amplitude;
      amplitude *= 0.5;
      frequency *= 2.03;
    }
    return sum / norm;
  };
  return { value, fbm };
}

/** A smooth minimum, so two blobs melt into one. */
const smin = (a: number, b: number, k: number): number => {
  const h = Math.max(0, Math.min(1, 0.5 + (0.5 * (b - a)) / k));
  return b + (a - b) * h - k * h * (1 - h);
};

interface Taper {
  readonly ax: number;
  readonly ay: number;
  readonly ra: number;
  readonly bx: number;
  readonly by: number;
  readonly rb: number;
}
interface Bounded extends Taper {
  readonly centreX: number;
  readonly centreY: number;
  readonly reach: number;
}
/** Distance to a capsule whose radius tapers from `ra` at one end to `rb` at the other. */
function taperDistance(x: number, y: number, taper: Taper): number {
  const { ax, ay, ra, bx, by, rb } = taper;
  const spanX = bx - ax;
  const spanY = by - ay;
  const length2 = spanX * spanX + spanY * spanY;
  const t = length2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * spanX + (y - ay) * spanY) / length2)) : 0;
  return len(x - (ax + spanX * t), y - (ay + spanY * t)) - (ra + (rb - ra) * t);
}
const bound = (taper: Taper): Bounded => ({
  ...taper,
  centreX: (taper.ax + taper.bx) / 2,
  centreY: (taper.ay + taper.by) / 2,
  reach: len(taper.bx - taper.ax, taper.by - taper.ay) / 2 + Math.max(taper.ra, taper.rb),
});
const meltRun = (distance: number, x: number, y: number, taper: Bounded, k: number): number =>
  len(x - taper.centreX, y - taper.centreY) - taper.reach > distance + k
    ? distance
    : smin(distance, taperDistance(x, y, taper), k);

interface Texel {
  readonly alpha: number;
  readonly depth: number;
}
type Shape = (x: number, y: number) => Texel;
const DEPTH_REACH = { pool: 0.42, spatter: 0.2, streak: 0.19 } as const;
const EDGE_ROUGH = 0.07;
const ROUGH_REACH = 0.2;
const INSIDE = 0.86;
const clampIn = (value: number, radius: number): number => Math.max(-INSIDE + radius, Math.min(INSIDE - radius, value));
const fromField = (distance: number, reach: number, antialias: number): Texel => ({
  alpha: distance >= antialias ? 0 : 1 - smooth(-antialias, antialias, distance),
  depth: distance >= 0 ? 0 : Math.pow(Math.min(1, -distance / reach), 0.8),
});
/** Warps a point by noise and answers the rough edge there. */
function roughen(noise: Noise, offsetX: number, offsetY: number) {
  return (x: number, y: number) => {
    const warpedX = x + 0.09 * noise.fbm(x * 2.1 + offsetX, y * 2.1 + offsetY, 2);
    const warpedY = y + 0.09 * noise.fbm(x * 2.1 + offsetY + 31.7, y * 2.1 + offsetX - 12.4, 2);
    return { warpedX, warpedY, edge: EDGE_ROUGH * noise.fbm(warpedX * 4.3 + offsetX, warpedY * 4.3 + offsetY, 3) };
  };
}

interface Blob {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}
const blobDistance = (x: number, y: number, blob: Blob): number => len(x - blob.x, y - blob.y) - blob.radius;

function poolField(random: () => number, noise: Noise): Shape {
  const rough = roughen(noise, random() * 64, random() * 64);
  const main = { x: (random() - 0.5) * 0.12, y: (random() - 0.5) * 0.12, radius: 0.38 + random() * 0.1 };
  const lobes = Array.from({ length: 2 + Math.floor(random() * 4) }, (): Blob => {
    const angle = random() * TAU;
    const distance = 0.22 + random() * 0.22;
    const radius = 0.14 + random() * 0.15;
    return {
      x: clampIn(main.x + Math.cos(angle) * distance, radius),
      y: clampIn(main.y + Math.sin(angle) * distance, radius),
      radius,
    };
  });
  const fingers = Array.from({ length: Math.floor(random() * 3) }, () => {
    const angle = random() * TAU;
    const from = main.radius * 0.7;
    const to = main.radius + 0.18 + random() * 0.2;
    return bound({
      ax: main.x + Math.cos(angle) * from,
      ay: main.y + Math.sin(angle) * from,
      ra: 0.07 + random() * 0.04,
      bx: clampIn(main.x + Math.cos(angle) * to, 0.03),
      by: clampIn(main.y + Math.sin(angle) * to, 0.03),
      rb: 0.015 + random() * 0.02,
    });
  });
  const side = random() * TAU;
  const satellites = Array.from({ length: 3 + Math.floor(random() * 8) }, (): Blob => {
    const angle = side + gaussOf(random(), random()) * 0.9;
    const distance = 0.6 + random() * 0.26;
    const radius = 0.015 + Math.pow(random(), 2) * 0.05;
    return { x: clampIn(Math.cos(angle) * distance, radius), y: clampIn(Math.sin(angle) * distance, radius), radius };
  });
  const body = (x: number, y: number): number => {
    let distance = blobDistance(x, y, main);
    for (const lobe of lobes) distance = smin(distance, blobDistance(x, y, lobe), 0.12);
    for (const finger of fingers) distance = meltRun(distance, x, y, finger, 0.06);
    return distance;
  };
  return (x, y) => {
    let distance = body(x, y);
    if (distance < ROUGH_REACH) {
      const { warpedX, warpedY, edge } = rough(x, y);
      distance = body(warpedX, warpedY) + edge;
    }
    for (const satellite of satellites) distance = Math.min(distance, blobDistance(x, y, satellite));
    return fromField(distance, DEPTH_REACH.pool, 0.024);
  };
}

function spatterField(random: () => number, noise: Noise): Shape {
  const rough = roughen(noise, random() * 64, random() * 64);
  const core = { x: (random() - 0.5) * 0.1, y: (random() - 0.5) * 0.1, radius: 0.2 + random() * 0.08 };
  const blobs = Array.from({ length: 1 + Math.floor(random() * 3) }, (): Blob => {
    const angle = random() * TAU;
    const distance = core.radius * (0.5 + random() * 0.6);
    return {
      x: core.x + Math.cos(angle) * distance,
      y: core.y + Math.sin(angle) * distance,
      radius: core.radius * (0.4 + random() * 0.4),
    };
  });
  const aims = [random() * TAU];
  if (random() < 0.45) aims.push((aims[0] ?? 0) + (random() < 0.5 ? -1 : 1) * (1.2 + random() * 1.6));
  const aimAt = (): number => aims[Math.floor(random() * aims.length) % aims.length] ?? 0;
  const tendrils = Array.from({ length: 3 + Math.floor(random() * 7) }, () => {
    const angle = aimAt() + gaussOf(random(), random()) * 0.5;
    const length = core.radius + 0.18 + Math.pow(random(), 0.7) * 0.45;
    const endX = clampIn(core.x + Math.cos(angle) * length, 0.05);
    const endY = clampIn(core.y + Math.sin(angle) * length, 0.05);
    const bead = 0.025 + random() * 0.045;
    // Some beads broke off the end of their run.
    const gap = random() < 0.4 ? 0.03 + random() * 0.06 : 0;
    const run = bound({
      ax: core.x + Math.cos(angle) * core.radius * 0.5,
      ay: core.y + Math.sin(angle) * core.radius * 0.5,
      ra: 0.05 + random() * 0.04,
      bx: endX,
      by: endY,
      rb: 0.008 + random() * 0.012,
    });
    const tip: Blob = {
      x: clampIn(endX + Math.cos(angle) * (bead + gap), bead),
      y: clampIn(endY + Math.sin(angle) * (bead + gap), bead),
      radius: bead,
    };
    return { run, tip };
  });
  const mist = Array.from({ length: 18 + Math.floor(random() * 40) }, (): Blob => {
    const angle = random() < 0.8 ? aimAt() + gaussOf(random(), random()) * 0.7 : random() * TAU;
    const distance = core.radius + 0.1 + Math.pow(random(), 0.6) * 0.6;
    const radius = 0.009 + Math.pow(random(), 2.5) * 0.03;
    return {
      x: clampIn(core.x + Math.cos(angle) * distance, radius),
      y: clampIn(core.y + Math.sin(angle) * distance, radius),
      radius,
    };
  });
  const body = (x: number, y: number): number => {
    let distance = blobDistance(x, y, core);
    for (const blob of blobs) distance = smin(distance, blobDistance(x, y, blob), 0.08);
    for (const { run } of tendrils) distance = meltRun(distance, x, y, run, 0.05);
    return distance;
  };
  return (x, y) => {
    let distance = body(x, y);
    if (distance < ROUGH_REACH) {
      const { warpedX, warpedY, edge } = rough(x, y);
      distance = body(warpedX, warpedY) + edge * 0.7;
    }
    for (const { tip } of tendrils) distance = Math.min(distance, blobDistance(x, y, tip));
    for (const drop of mist) {
      const offsetX = x - drop.x;
      const offsetY = y - drop.y;
      if (offsetX * offsetX + offsetY * offsetY < 0.01)
        distance = Math.min(distance, len(offsetX, offsetY) - drop.radius);
    }
    return fromField(distance, DEPTH_REACH.spatter, 0.022);
  };
}

function streakField(random: () => number, noise: Noise): Shape {
  const rough = roughen(noise, random() * 64, random() * 64);
  const headX = -0.55 + (random() - 0.5) * 0.08;
  const headR = 0.2 + random() * 0.07;
  const end = 0.5 + random() * 0.3;
  const bend = (random() - 0.5) * 0.3;
  // It curves as it slows.
  const yAt = (t: number): number => bend * t * t;
  const SEGMENTS = 5;
  const body = Array.from({ length: SEGMENTS }, (_unused, segment) => {
    const fromShare = segment / SEGMENTS;
    const toShare = (segment + 1) / SEGMENTS;
    return bound({
      ax: headX + (end - headX) * fromShare,
      ay: yAt(fromShare),
      ra: headR * 0.8 * (1 - fromShare * 0.9),
      bx: headX + (end - headX) * toShare,
      by: yAt(toShare),
      rb: headR * 0.8 * (1 - toShare * 0.9),
    });
  });
  const trail = Array.from({ length: 1 + Math.floor(random() * 4) }, (_unused, index): Blob => {
    const t = 1.08 + index * (0.07 + random() * 0.06);
    const radius = Math.max(0.01, 0.035 * (1 - index * 0.2) * (0.6 + random() * 0.6));
    return {
      x: clampIn(headX + (end - headX) * t, radius),
      y: clampIn(yAt(Math.min(1.4, t)) + (random() - 0.5) * 0.04, radius),
      radius,
    };
  });
  const crown = Array.from({ length: 2 + Math.floor(random() * 5) }, (): Blob => {
    const angle = Math.PI + gaussOf(random(), random()) * 0.8;
    const distance = headR + 0.03 + random() * 0.12;
    const radius = 0.012 + random() * 0.025;
    return {
      x: clampIn(headX + Math.cos(angle) * distance, radius),
      y: clampIn(Math.sin(angle) * distance, radius),
      radius,
    };
  });
  const run = (x: number, y: number): number => {
    let distance = len((x - headX) * 0.95, y * 1.08) - headR;
    for (const segment of body) distance = meltRun(distance, x, y, segment, 0.06);
    return distance;
  };
  return (x, y) => {
    let distance = run(x, y);
    if (distance < ROUGH_REACH) {
      const { warpedX, warpedY, edge } = rough(x, y);
      distance = run(warpedX, warpedY) + edge * 0.6;
    }
    for (const blob of [...trail, ...crown]) distance = Math.min(distance, blobDistance(x, y, blob));
    return fromField(distance, DEPTH_REACH.streak, 0.022);
  };
}

function printField(random: () => number): Shape {
  const wobbled = wobble(random, 10, 0.12);
  const toeX = 0.32 + random() * 0.12;
  const heelX = -0.5 - random() * 0.08;
  return (x, y) => {
    const angle = Math.atan2(y, x);
    const heel = 1 - smooth(0.2, 0.28, len((x - heelX) * 1.1, y * 1.35) * (1 + wobbled(angle)));
    const sole = 1 - smooth(0.3, 0.38, len((x - toeX) * 0.75, y * 1.15) * (1 + wobbled(angle + 1)));
    const middle = (heelX + toeX) / 2;
    const waist =
      x > heelX && x < toeX
        ? 1 - smooth(0.16, 0.22, Math.abs(y) * (1 + 0.6 * Math.abs((x - middle) / ((toeX - heelX) / 2))))
        : 0;
    return { alpha: Math.max(heel, sole, waist), depth: 1 - smooth(heelX, toeX, x) };
  };
}

/** A wall's run: a bead where the drop met the wall, and, two times in three, a run below it that wanders as it
 *  slows and sometimes forks. */
function dripField(random: () => number): Shape {
  const wobbled = wobble(random, 6, 0.25);
  const beadX = (random() * 2 - 1) * 0.12;
  const beadR = 0.22 + random() * 0.14;
  const ran = random() > 0.32;
  const runTo = ran ? -0.9 + random() * 0.75 : 0.5;
  const drift = (random() * 2 - 1) * 0.22;
  const width = 0.06 + random() * 0.06;
  const forked = ran && random() < 0.35;
  const forkX = (random() * 2 - 1) * 0.16;
  const forkTo = runTo * (0.35 + random() * 0.3);
  const forkWidth = width * (0.4 + random() * 0.25);
  const trail = (x: number, y: number, fromX: number, toY: number, halfWidth: number, wobbles: boolean) => {
    if (!(y < 0.5 && y > toY)) return { alpha: 0, along: -1 };
    const along = (0.5 - y) / (0.5 - toY);
    const centre = fromX + drift * along * along;
    const half = halfWidth * (1 - 0.6 * along) * (1 + (wobbles ? wobbled(along * TAU) : 0)) + 0.015;
    return { alpha: 1 - smooth(half - 0.03, half + 0.02, Math.abs(x - centre)), along };
  };
  const footX = beadX + drift;
  return (x, y) => {
    const fromBead = len((x - beadX) * 1.2, (y - 0.5) * 0.9);
    const fromFoot = len(x - footX, y - runTo);
    const bead = 1 - smooth(beadR, beadR + 0.1, fromBead);
    const main = trail(x, y, beadX, runTo, width, true);
    const fork = forked ? trail(x, y, beadX + forkX, forkTo, forkWidth, false) : { alpha: 0, along: -1 };
    const foot = ran ? 1 - smooth(0.06, 0.11, fromFoot) : 0;
    const beadDepth = 1 - smooth(beadR * 0.2, beadR + 0.02, fromBead);
    // Gathered at the foot, so thicker than the run above it, but never the bead's equal.
    const footDepth = ran ? (1 - smooth(0.02, 0.1, fromFoot)) * 0.45 : 0;
    const runDepth = main.alpha > 0 ? 1 - main.along : fork.alpha > 0 ? (1 - fork.along) * 0.85 : 0;
    return {
      alpha: Math.max(bead, main.alpha, fork.alpha, foot),
      depth: Math.max(0, Math.min(1, Math.max(beadDepth, footDepth, runDepth))),
    };
  };
}

function shapeOf(kind: MarkKind, random: () => number, noise: Noise): Shape {
  if (kind === 'pool') return poolField(random, noise);
  if (kind === 'spatter') return spatterField(random, noise);
  if (kind === 'streak') return streakField(random, noise);
  if (kind === 'print') return printField(random);
  return dripField(random);
}

export interface Atlas {
  readonly colours: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
}

/** The cells of a sheet `size` wide, a pixel inside each cell's edge. */
export function atlasCells(size = ATLAS_SIZE, cells = ATLAS_CELLS): Cell[] {
  const cell = size / cells;
  const height = cell * ATLAS_KINDS.length;
  return ATLAS_KINDS.flatMap((kind, row) =>
    Array.from({ length: cells }, (_unused, column) => ({
      kind,
      u0: (column * cell + 1) / size,
      v0: (row * cell + 1) / height,
      u1: (column * cell + cell - 1) / size,
      v1: (row * cell + cell - 1) / height,
    })),
  );
}

const BORDER = 2;
/** Draws the sheet. Its cells are clear for two pixels at each edge, so a sampled edge never bleeds into the next. */
export function buildAtlas({ size = ATLAS_SIZE, cells = ATLAS_CELLS, seed = ATLAS_SEED } = {}): Atlas {
  const random = mulberry32(seed);
  const noise = bloodNoise(random);
  const cell = size / cells;
  const height = cell * ATLAS_KINDS.length;
  const colours = new Uint8ClampedArray(size * height * 4);
  ATLAS_KINDS.forEach((kind, row) => {
    for (let column = 0; column < cells; column++) {
      const shape = shapeOf(kind, random, noise);
      const grainX = random() * 64;
      const grainY = random() * 64;
      for (let pixelY = 0; pixelY < cell; pixelY++)
        for (let pixelX = 0; pixelX < cell; pixelX++) {
          const border = pixelX < BORDER || pixelY < BORDER || pixelX >= cell - BORDER || pixelY >= cell - BORDER;
          const x = ((pixelX + 0.5) / cell) * 2 - 1;
          const y = ((pixelY + 0.5) / cell) * 2 - 1;
          const { alpha, depth } = border ? { alpha: 0, depth: 0 } : shape(x, y);
          const grain =
            border || !(alpha > 0)
              ? 1
              : 1 +
                0.1 * noise.fbm(x * 7 + grainX, y * 7 + grainY, 2) +
                0.05 * noise.value(x * 23 + grainY, y * 23 + grainX);
          const offset = ((row * cell + pixelY) * size + column * cell + pixelX) * 4;
          const ink = Math.round(255 * (1 - INK_DEPTH * Math.max(0, Math.min(1, depth * grain))));
          colours.set([ink, ink, ink, Math.round(255 * Math.max(0, Math.min(1, alpha)))], offset);
        }
    }
  });
  return { colours, width: size, height };
}

/** A droplet in flight: a bead with a tail upward and a glint, in blood's own red. */
export const DROPLET_SIZE = 16;
export function dropletArt(): Atlas {
  const size = DROPLET_SIZE;
  const colours = new Uint8ClampedArray(size * size * 4);
  const glintColour = [150, 95, 85];
  for (let pixelY = 0; pixelY < size; pixelY++)
    for (let pixelX = 0; pixelX < size; pixelX++) {
      const x = ((pixelX + 0.5) / size) * 2 - 1;
      const y = ((pixelY + 0.5) / size) * 2 - 1;
      const bead = Math.sqrt((x * x) / 0.36 + ((y - 0.22) * (y - 0.22)) / 0.42);
      const tail = y < 0.22 ? Math.abs(x) / Math.max(0.001, (0.6 * (y + 0.85)) / 1.07) : 99;
      if (!(bead <= 1 || (tail <= 1 && y > -0.85))) continue;
      const rim = Math.min(1, bead);
      const shade = 1.15 - 0.55 * rim * rim;
      const glint = Math.max(0, 1 - Math.hypot(x + 0.22, y - 0.02) / 0.2);
      const offset = (pixelY * size + pixelX) * 4;
      for (let channel = 0; channel < 3; channel++)
        colours[offset + channel] = Math.round(
          Math.min(255, (BLOOD_BASE[channel] ?? 0) * 255 * shade + glint * (glintColour[channel] ?? 0)),
        );
      colours[offset + 3] = 255;
    }
  return { colours, width: size, height: size };
}

/** One of a kind's cells at random, mirrored half the time. */
export function pickCell(cells: readonly Cell[], kind: MarkKind, random: () => number): Cell {
  const ofKind = cells.filter((cell) => cell.kind === kind);
  const fallback = cells[0] ?? { kind, u0: 0, v0: 0, u1: 1, v1: 1 };
  const cell = ofKind[Math.min(ofKind.length - 1, Math.floor(random() * ofKind.length))] ?? fallback;
  return random() < 0.5 ? { ...cell, u0: cell.u1, u1: cell.u0 } : cell;
}

export function markKind({ pool = false, wall = false, print = false, stretch = 1 } = {}): MarkKind {
  if (pool) return 'pool';
  if (wall) return 'drip';
  if (print) return 'print';
  return stretch > 1.5 ? 'streak' : 'spatter';
}

export function freshTint(random: () => number): Tint {
  const shade = 1 - random() * FRESH_VARIANCE;
  return [BLOOD_BASE[0] * shade, BLOOD_BASE[1] * shade, BLOOD_BASE[2] * shade, 1];
}

/** How dark a fresh tint rolled, so its dried end is as dark. */
function freshShade(fresh: Tint): number {
  const shade = fresh[0] / BLOOD_BASE[0];
  return shade >= 1 - FRESH_VARIANCE - 1e-9 && shade <= 1 + 1e-9 ? shade : 1;
}

export function dryStage(age: number): number {
  if (!(age > 0)) return 0;
  return Math.min(DRY_STAGES, Math.floor((age / DRY_TIME) * DRY_STAGES));
}

/** The tint a stage away from fresh toward dried; fully dried is the dried tint exactly. */
export function driedTint(fresh: Tint, stage: number): Tint {
  const t = Math.max(0, Math.min(1, stage / DRY_STAGES));
  const shade = freshShade(fresh);
  const end = [DRIED_TINT[0] * shade, DRIED_TINT[1] * shade, DRIED_TINT[2] * shade] as const;
  if (t >= 1) return [end[0], end[1], end[2], fresh[3]];
  return [
    fresh[0] + (end[0] - fresh[0]) * t,
    fresh[1] + (end[1] - fresh[1]) * t,
    fresh[2] + (end[2] - fresh[2]) * t,
    fresh[3],
  ];
}
