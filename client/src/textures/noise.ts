// Seeded noise. Every field is periodic: a lattice wraps at its period, so a picture made from it tiles with no seam.
// The same seed and place always give the same value; the only state is a cache of exactly what the hash gives.

/**
 * A 32-bit hash of up to four integers. A fractional argument is a painter's place and hashes as the texel it lies
 * in, so a choice made per texel is made once for all its sub-texels.
 */
function hash4(first: number, second: number, third: number, fourth: number): number {
  const a = Math.floor(first + 0.5);
  const b = Math.floor(second + 0.5);
  const cell = Math.floor(third + 0.5);
  const dist = Math.floor(fourth + 0.5);
  let mixed = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b);
  mixed ^= Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  mixed = Math.imul(mixed ^ (mixed >>> 13), 0x27d4eb2f);
  mixed ^= Math.imul(cell + 0x5bd1e995, 0x165667b1);
  mixed = Math.imul(mixed ^ (mixed >>> 15), 0x2c1b3c6d);
  mixed ^= Math.imul(dist + 0x7f4a7c15, 0x9e3779b1);
  mixed = Math.imul(mixed ^ (mixed >>> 12), 0x297a2d39);
  mixed ^= mixed >>> 15;
  return mixed >>> 0;
}

/** A hash as a number in [0, 1). */
export const hash01 = (a: number, b = 0, cell = 0, dist = 0): number => hash4(a, b, cell, dist) / 4294967296;

/** A small seeded stream (mulberry32). */
export interface Stream {
  /** The next number in [0, 1). */
  next(): number;
  /** A number in [a, b). */
  range(a: number, b: number): number;
  /** A whole number in [0, n). */
  int(n: number): number;
  /** One of the list's items. */
  pick<Item>(list: readonly Item[]): Item;
}

export function stream(seed: number): Stream {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (a, b) => a + (b - a) * next(),
    int: (n) => Math.floor(next() * n),
    pick: (list) => list[Math.floor(next() * list.length)],
  };
}

/** n's remainder kept in [0, n), so a place wraps onto the picture. */
export const wrap = (value: number, n: number): number => ((value % n) + n) % n;
/** `wrap` for a whole number: the same answer, the short way when it is already in [0, n). */
export const wrapIndex = (value: number, n: number): number =>
  value >= 0 && value < n ? value : ((value % n) + n) % n;
const fade = (frac: number): number => frac * frac * frac * (frac * (frac * 6 - 15) + 10);

/** A lattice's hashed values: one a point for value noise, two (a jittered point) for cells. */
const VALUE = 0;
const CELLS = 1;
const KEPT = 64;
const MOST_POINTS = 4096;
interface Lattice {
  readonly kind: number;
  readonly across: number;
  readonly down: number;
  readonly values: Float64Array;
}
/** The lattices kept, by seed. They hold exactly what the hash gives, so what is kept never changes a picture. */
const kept = new Map<number, Lattice[]>();
let keptCount = 0;

/** A recent lattice's values, or null for one too large to keep: a field read texel by texel hashes each point once. */
function keptLattice(kind: number, seed: number, across: number, down: number): Float64Array | null {
  const bySeed = kept.get(seed);
  if (bySeed)
    for (const one of bySeed) if (one.across === across && one.down === down && one.kind === kind) return one.values;
  if (across * down > MOST_POINTS) return null;
  const values = new Float64Array(across * down * (kind === CELLS ? 2 : 1));
  for (let i = 0; i < across * down; i++) {
    const latticeX = i % across;
    const latticeY = Math.floor(i / across);
    if (kind === VALUE) values[i] = hash01(seed, latticeX, latticeY);
    else {
      values[i * 2] = hash01(seed, latticeX, latticeY, 1);
      values[i * 2 + 1] = hash01(seed, latticeX, latticeY, 2);
    }
  }
  if (keptCount >= KEPT) {
    kept.clear();
    keptCount = 0;
  }
  const lattice = { kind, across, down, values };
  const list = kept.get(seed);
  if (list) list.push(lattice);
  else kept.set(seed, [lattice]);
  keptCount++;
  return values;
}

/** Value noise in [0, 1) at (x, y), on a lattice that wraps every `across` by `down` cells. */
export function valueNoise(seed: number, x: number, y: number, across: number, down: number): number {
  const cellX = Math.floor(x);
  const cellY = Math.floor(y);
  const fracX = fade(x - cellX);
  const fracY = fade(y - cellY);
  const left = wrapIndex(cellX, across);
  const right = wrapIndex(cellX + 1, across);
  const top = wrapIndex(cellY, down);
  const bottom = wrapIndex(cellY + 1, down);
  const lattice = keptLattice(VALUE, seed, across, down);
  const topLeft = lattice ? lattice[top * across + left] : hash01(seed, left, top);
  const topRight = lattice ? lattice[top * across + right] : hash01(seed, right, top);
  const bottomLeft = lattice ? lattice[bottom * across + left] : hash01(seed, left, bottom);
  const bottomRight = lattice ? lattice[bottom * across + right] : hash01(seed, right, bottom);
  const upper = topLeft + (topRight - topLeft) * fracX;
  const lower = bottomLeft + (bottomRight - bottomLeft) * fracX;
  return upper + (lower - upper) * fracY;
}

/** Fractal noise settings: `cells` across the width at the first octave, each octave twice as fine and `gain` as
 *  strong; `aspect` the cells down, when not as square as the picture. */
export interface FractalOptions {
  cells?: number;
  octaves?: number;
  gain?: number;
  aspect?: number;
}

/** Fractal noise in about [0, 1] over a picture `w` x `h` texels, wrapping at its edges. */
export function fbm(seed: number, x: number, y: number, w: number, h: number, options: FractalOptions = {}): number {
  const cells = options.cells ?? 4;
  const octaves = options.octaves ?? 4;
  const gain = options.gain ?? 0.5;
  const firstAcross = Math.max(1, Math.round(cells));
  const firstDown = Math.max(1, Math.round(options.aspect ?? (cells * h) / w));
  let sum = 0;
  let amplitude = 1;
  let norm = 0;
  for (let octave = 0; octave < octaves; octave++) {
    const across = firstAcross << octave;
    const down = firstDown << octave;
    sum += amplitude * valueNoise(seed + octave * 1013, (x / w) * across, (y / h) * down, across, down);
    norm += amplitude;
    amplitude *= gain;
  }
  return sum / norm;
}

/** Ridged fractal noise in [0, 1]: thin bright creases, as veins in marble or cracks in rock. */
export function ridged(seed: number, x: number, y: number, w: number, h: number, options: FractalOptions = {}): number {
  const value = fbm(seed, x, y, w, h, options);
  return 1 - Math.abs(value * 2 - 1);
}

/** The nearest and second-nearest cell points' distances, the nearest cell's id and its point. */
export interface CellHit {
  readonly nearest: number;
  readonly second: number;
  readonly id: number;
  readonly pointX: number;
  readonly pointY: number;
}

/** Cellular noise over a picture `w` x `h` with `across` by `down` cells, one jittered point a cell, wrapping. */
export function worley(
  seed: number,
  x: number,
  y: number,
  w: number,
  h: number,
  across: number,
  down: number,
  jitter = 0.85,
): CellHit {
  const cellW = w / across;
  const cellH = h / down;
  const points = keptLattice(CELLS, seed, across, down);
  const gridX = Math.floor(x / cellW);
  const gridY = Math.floor(y / cellH);
  let nearest = Infinity;
  let second = Infinity;
  let id = 0;
  let pointX = 0;
  let pointY = 0;
  for (let j = -1; j <= 1; j++)
    for (let i = -1; i <= 1; i++) {
      const column = gridX + i;
      const row = gridY + j;
      const wrappedX = wrapIndex(column, across);
      const wrappedY = wrapIndex(row, down);
      const slot = wrappedY * across + wrappedX;
      const offsetX =
        (0.5 + ((points ? points[slot * 2] : hash01(seed, wrappedX, wrappedY, 1)) - 0.5) * jitter) * cellW;
      const offsetY =
        (0.5 + ((points ? points[slot * 2 + 1] : hash01(seed, wrappedX, wrappedY, 2)) - 0.5) * jitter) * cellH;
      const candidateX = column * cellW + offsetX;
      const candidateY = row * cellH + offsetY;
      // squared: the order is the same, and one square root at the end is exact in every engine
      const dist = (x - candidateX) * (x - candidateX) + (y - candidateY) * (y - candidateY);
      if (dist < nearest) {
        second = nearest;
        nearest = dist;
        id = wrappedY * across + wrappedX;
        pointX = candidateX;
        pointY = candidateY;
      } else if (dist < second) second = dist;
    }
  return { nearest: Math.sqrt(nearest), second: Math.sqrt(second), id, pointX, pointY };
}

/**
 * The fine speckle every surface carries, in [-1, 1]: a third the texel's own and two thirds its 2 x 2 block's, so
 * the grain comes in clumps rather than as single texels.
 */
export const speckle = (seed: number, x: number, y: number): number =>
  (hash01(seed, x, y, 7) * 0.34 + hash01(seed, Math.floor((x + 0.5) / 2), Math.floor((y + 0.5) / 2), 8) * 0.66) * 2 - 1;

export const clamp01 = (value: number): number => (value < 0 ? 0 : value > 1 ? 1 : value);

/** Smoothstep of `value` from `a` to `b`. */
export const smooth = (a: number, b: number, value: number): number => {
  const frac = clamp01((value - a) / (b - a));
  return frac * frac * (3 - 2 * frac);
};
