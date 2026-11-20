// Natural rock's surface, to the bit as the city crate makes it (crates/city/src/rock.rs): each rock a few boxes of
// its own frame, each box drawn as a rounded, rough lump inside it. The boxes are what a body runs into, so it is a
// rule the Test Ground stands bodies on as the city draws it. The land's exact noise is written again here from
// + - * / and square root alone (crates/land/src/exact.rs), so every browser draws the same vertices the server's
// boxes were made round.

/** A rock's surface in its own frame: its vertices and its triangles, each wound out of the rock. */
type RockMesh = {
  readonly positions: [number, number, number][];
  readonly triangles: [number, number, number][];
};

/** A box of a rock's own frame: low x, y, z, then high x, y, z. */
type Part = readonly [number, number, number, number, number, number];

const CELL_M = 0.75;
const MOST_CELLS = 40;
const ROUGH_SHARE = 0.4;
const ROUGH_MOST_M = 2.0;
const BULGE_M = 5.0;
const CRAG_M = 1.6;

/** A natural rock's shape, as a solid's (client/src/city/plan.ts). */
export type RockShape = { readonly shape: 'caveroof' | 'overhang' | 'rockarch' | 'tunnelmouth'; readonly seed: number };

/** Whether a solid's shape is natural rock. */
function isRock(shape: { readonly shape: string }): shape is RockShape {
  return (
    shape.shape === 'caveroof' ||
    shape.shape === 'overhang' ||
    shape.shape === 'rockarch' ||
    shape.shape === 'tunnelmouth'
  );
}

/** The boxes a rock is made of, as the city crate's `rock::parts`; none for a built shape. */
export function rockParts(shape: { readonly shape: string }, size: readonly [number, number, number]): Part[] {
  const [width, depth, height] = size;
  const [west, north, east, south] = [-width / 2, -depth / 2, width / 2, depth / 2];
  const frame = (leg: number, head: number, from: number): Part[] => [
    [west, from, 0, west + leg * width, south, height],
    [east - leg * width, from, 0, east, south, height],
    [west, from, head * height, east, south, height],
  ];
  switch (shape.shape) {
    case 'caveroof':
      return [[west, north, 0, east, south, height]];
    case 'overhang':
      return [
        [west, north, 0, east, north + 0.4 * depth, height],
        [0.9 * west, north, 0.55 * height, 0.9 * east, south, height],
      ];
    case 'rockarch':
      return [
        ...frame(0.26, 0.62, north),
        [west, north, 0, west + 0.36 * width, south, 0.35 * height],
        [east - 0.36 * width, north, 0, east, south, 0.35 * height],
      ];
    case 'tunnelmouth':
      return [
        ...frame(0.3, 0.6, north + 0.3 * depth),
        [0.8 * west, north, 0.72 * height, 0.8 * east, north + 0.4 * depth, height],
      ];
    default:
      return [];
  }
}

/** A rock's surface: each of its parts' rough lumps, in its own frame. */
export function rockMesh(shape: { readonly shape: string }, size: readonly [number, number, number]): RockMesh {
  const rock: RockMesh = { positions: [], triangles: [] };
  // A rock with no size, or one not a number, has no surface to draw.
  if (!isRock(shape) || !size.every((side) => side > 0)) return rock;
  // Each part's sides set against something, by axis: -1 its low side, 1 its high one, as the city crate's.
  const set: Record<string, number[][]> = {
    overhang: [
      [0, -1, -1],
      [0, -1, 0],
    ],
    rockarch: [
      [0, 0, -1],
      [0, 0, -1],
      [0, 0, 0],
      [0, 0, -1],
      [0, 0, -1],
    ],
    tunnelmouth: [
      [0, 1, -1],
      [0, 1, -1],
      [0, 1, 0],
      [0, 0, 0],
    ],
  };
  rockParts(shape, size).forEach((part, index) => lump(shape.seed, part, set[shape.shape]?.[index] ?? [0, 0, 0], rock));
  return rock;
}

/** The land's `clamp`. */
const clamp = (value: number, low: number, high: number): number => (value < low ? low : value > high ? high : value);

function lump(seed: number, part: Part, set: readonly number[], into: RockMesh): void {
  const low = [part[0], part[1], part[2]];
  const length = [part[3] - part[0], part[4] - part[1], part[5] - part[2]];
  const cells = length.map((side) => Math.min(Math.max(Math.ceil(side / CELL_M), 2), MOST_CELLS));
  const half = [0, 1, 2].map((axis) => (set[axis] === 0 ? length[axis] / 2 : length[axis]));
  const middle = [0, 1, 2].map((axis) =>
    set[axis] === -1 ? low[axis] : set[axis] === 1 ? part[axis + 3] : low[axis] + half[axis],
  );
  const kept = new Map<string, number>();
  const corner = (lattice: readonly number[]): number => {
    const key = lattice.join(',');
    const found = kept.get(key);
    if (found !== undefined) return found;
    const onBox = [0, 1, 2].map((axis) => low[axis] + (length[axis] * lattice[axis]) / cells[axis]);
    const free = [0, 1, 2].some(
      (axis) => (lattice[axis] === 0 && set[axis] !== -1) || (lattice[axis] === cells[axis] && set[axis] !== 1),
    );
    const pulled = !free
      ? [0, 1, 2].map((axis) => middle[axis] + (onBox[axis] - middle[axis]) * 0.5)
      : pulledIn(seed, onBox, middle, half);
    into.positions.push([0, 1, 2].map((axis) => clamp(pulled[axis], part[axis], part[axis + 3])) as Vector3);
    kept.set(key, into.positions.length - 1);
    return into.positions.length - 1;
  };
  for (let axis = 0; axis < 3; axis++) {
    const [across, along] = [(axis + 1) % 3, (axis + 2) % 3];
    for (const side of [0, cells[axis]])
      for (let step = 0; step < cells[across]; step++)
        for (let row = 0; row < cells[along]; row++) {
          const latticeAt = (first: number, second: number): number[] => {
            const lattice = [0, 0, 0];
            [lattice[axis], lattice[across], lattice[along]] = [side, first, second];
            return lattice;
          };
          const quad = [
            latticeAt(step, row),
            latticeAt(step + 1, row),
            latticeAt(step + 1, row + 1),
            latticeAt(step, row + 1),
          ].map(corner);
          const [first, second, third, fourth] = side === 0 ? [quad[0], quad[3], quad[2], quad[1]] : quad;
          into.triangles.push([first, second, third], [first, third, fourth]);
        }
  }
}

type Vector3 = [number, number, number];

function pulledIn(
  seed: number,
  onBox: readonly number[],
  middle: readonly number[],
  half: readonly number[],
): number[] {
  const share = [0, 1, 2].map((axis) => (onBox[axis] - middle[axis]) / half[axis]);
  const fourth = (value: number): number => value * value * value * value;
  const reach = Math.sqrt(Math.sqrt(fourth(share[0]) + fourth(share[1]) + fourth(share[2])));
  const normal = [0, 1, 2].map((axis) => (share[axis] * share[axis] * share[axis]) / half[axis]);
  const norm = Math.sqrt(normal[0] * normal[0] + normal[1] * normal[1] + normal[2] * normal[2]);
  const rough = [0, 1, 2].reduce(
    (most, axis) =>
      normal[axis] === 0 ? most : Math.min(most, (ROUGH_SHARE * half[axis] * norm) / Math.abs(normal[axis])),
    ROUGH_MOST_M,
  );
  const underneath = Math.max(-normal[2] / norm, 0);
  const [x, y, z] = onBox;
  const [across, along] = [x + 0.71 * z, y - 0.53 * z];
  const bulges = fbm(seed, across / BULGE_M, along / BULGE_M, 3);
  const crags = ridged((seed + 1) >>> 0, across / CRAG_M, along / CRAG_M, 3);
  const depth = rough * (0.6 + 0.8 * underneath) * clamp(0.5 + 0.8 * bulges + 0.5 * (crags - 0.5), 0, 1);
  return [0, 1, 2].map((axis) => middle[axis] + (onBox[axis] - middle[axis]) / reach - (normal[axis] / norm) * depth);
}

/** The land's `hash32`: whole numbers mixed into one unsigned 32-bit hash. */
export function hash32(numbers: readonly number[]): number {
  let hash = 0x811c9dc5;
  for (const number of numbers) {
    hash = (hash ^ number) >>> 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
    hash = (hash ^ (hash >>> 15)) >>> 0;
    hash = Math.imul(hash, 0x2c1b3c6d) >>> 0;
    hash = (hash ^ (hash >>> 12)) >>> 0;
  }
  return hash;
}

const GRADIENT_X = [1, -1, 0, 0, Math.SQRT1_2, -Math.SQRT1_2, Math.SQRT1_2, -Math.SQRT1_2, 1, -1, 0, 0];
const GRADIENT_Y = [0, 0, 1, -1, Math.SQRT1_2, Math.SQRT1_2, -Math.SQRT1_2, -Math.SQRT1_2, 0, 0, 1, -1];

const fade = (fraction: number): number => fraction * fraction * fraction * (fraction * (fraction * 6 - 15) + 10);
const lerp = (from: number, to: number, fraction: number): number => from + (to - from) * fraction;

/** The land's `noise2`: seeded gradient noise in about [-1, 1]. */
function noise2(seed: number, x: number, y: number): number {
  const [cellX, cellY] = [Math.floor(x), Math.floor(y)];
  const [fractionX, fractionY] = [x - cellX, y - cellY];
  const dot = (i: number, j: number): number => {
    const gradient = hash32([seed, cellX + i, cellY + j]) % 12;
    return GRADIENT_X[gradient] * (fractionX - i) + GRADIENT_Y[gradient] * (fractionY - j);
  };
  const [easeX, easeY] = [fade(fractionX), fade(fractionY)];
  return lerp(lerp(dot(0, 0), dot(1, 0), easeX), lerp(dot(0, 1), dot(1, 1), easeX), easeY) * Math.SQRT2;
}

/** The land's `fbm`: `octaves` layers of noise, each twice the frequency and half the weight. */
function fbm(seed: number, x: number, y: number, octaves: number): number {
  let [sum, amplitude, norm, frequency] = [0, 1, 0, 1];
  for (let octave = 0; octave < octaves; octave++) {
    sum += amplitude * noise2((seed + Math.imul(octave, 7919)) >>> 0, x * frequency, y * frequency);
    norm += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return sum / norm;
}

/** The land's `ridged`: sharp crests where the noise crosses zero, in [0, 1]. */
function ridged(seed: number, x: number, y: number, octaves: number): number {
  let [sum, amplitude, norm, frequency, weight] = [0, 1, 0, 1, 1];
  for (let octave = 0; octave < octaves; octave++) {
    const crest = 1 - Math.abs(noise2((seed + Math.imul(octave, 104729)) >>> 0, x * frequency, y * frequency));
    const shaped = crest * crest * weight;
    weight = clamp(shaped * 2, 0, 1);
    sum += amplitude * shaped;
    norm += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return sum / norm;
}
