import { type Cleared, type GroundAt, type GroundSampler, smooth } from './ground.ts';
import type { Cast, Kind, Layer } from './kinds.ts';

/** The side of a tile, metres: the plants are scattered, kept and dropped a tile at a time. */
export const TILE_M = 64;
/** The side of a layer's slots: each holds one plant at most, somewhere inside it. */
export const SLOT_M: Readonly<Record<Layer, number>> = { tall: 8, low: 4 };
/** A planted instance's floats: its form (the cast's forms in order), where it stands from its tile's north-west
 *  corner (east, south), its foot's height, its turn, its width and height scales, its tint (-1..1) and its rank
 *  (0..1), by which the far ones thin out. */
export const PLANTED_FLOATS = 9;

/** The ground a scatter reads: the sampler, the caller's cleared places and the snow line, metres. */
export interface ScatterGround {
  readonly sample: GroundSampler;
  readonly cleared: Cleared;
  readonly snowM: number;
}

/** A 32-bit hash of whole numbers: every machine plants the same thing in the same slot. */
export function hashOf(...values: readonly number[]): number {
  let hash = 0x811c9dc5;
  for (const value of values) {
    hash = Math.imul(hash ^ (value | 0), 0x01000193);
    hash ^= hash >>> 15;
    hash = Math.imul(hash, 0x2c1b3c6d);
    hash ^= hash >>> 12;
  }
  hash = Math.imul(hash ^ (hash >>> 16), 0x297a2d39);
  return (hash ^ (hash >>> 15)) >>> 0;
}

/** The `draw`th number in 0..1 drawn from a slot's hash. */
const drawn = (seed: number, draw: number) => hashOf(seed, draw) / 4294967296;

/** Value noise on a lattice `cellM` apart, 0..1, the same at a world point whoever asks. */
function valueNoise(x: number, y: number, cellM: number, salt: number): number {
  const [gridX, gridY] = [x / cellM, y / cellM];
  const [column, row] = [Math.floor(gridX), Math.floor(gridY)];
  const [across, down] = [smooth(0, 1, gridX - column), smooth(0, 1, gridY - row)];
  const corner = (atX: number, atY: number) => hashOf(atX, atY, salt) / 4294967296;
  const top = corner(column, row) + (corner(column + 1, row) - corner(column, row)) * across;
  const bottom = corner(column, row + 1) + (corner(column + 1, row + 1) - corner(column, row + 1)) * across;
  return top + (bottom - top) * down;
}

/** Where the groves stand (toward 1) and the clearings open (toward 0): broad patches, ragged at their edges. */
export function groveAt(x: number, y: number): number {
  return 0.65 * valueNoise(x, y, 180, 17) + 0.35 * valueNoise(x, y, 70, 29);
}

/** The most a kind's growth can reach over its chance: its groves' and the water's boosts together. */
function mostGrowth(kind: Kind): number {
  const water = kind.growth.byWater && !kind.growth.byWater.only ? kind.growth.byWater.boost : 1;
  return (1 + Math.abs(kind.growth.grove)) * Math.max(1, water);
}

/** How well a kind grows on this ground, from 0 up to mostGrowth: water, marks, height, snow, slope, groves, water's
 *  nearness. */
export function growthAt(kind: Kind, ground: GroundAt, grove: number, snowM: number): number {
  const growth = kind.growth;
  if (ground.water !== 'dry' || ground.mark !== 0) return 0;
  const [gentlest, steepest] = growth.slopes;
  let share = smooth(growth.lowestM, growth.lowestM + 0.5, ground.height);
  share *= 1 - smooth(snowM + growth.snowLineM - 150, snowM + growth.snowLineM, ground.height);
  if (gentlest > 0) share *= smooth(gentlest - 0.06, gentlest + 0.04, ground.slope);
  share *= 1 - smooth(steepest, steepest + 0.15, ground.slope);
  share *= 1 + growth.grove * (2 * smooth(0.3, 0.7, grove) - 1);
  if (growth.byWater) {
    const distance = Math.min(ground.coastM ?? Infinity, ground.freshM ?? Infinity);
    const near = 1 - smooth(growth.byWater.reachM * 0.5, growth.byWater.reachM, distance);
    share *= growth.byWater.only ? near : 1 + (growth.byWater.boost - 1) * near;
  }
  return share;
}

/** Each kind's share of a layer's slots, in order: a slot's first draw picks the kind whose share it falls in, and
 *  the ground then says whether it grows. The shares never shift with the ground, so a slot's choice never does. */
export function shares(cast: Cast, layer: Layer): { kind: number; from: number; to: number }[] {
  const inLayer = cast.kinds.flatMap((kind, index) => (kind.layer === layer ? [{ kind, index }] : []));
  const total = inLayer.reduce((sum, { kind }) => sum + kind.growth.chance * mostGrowth(kind), 0);
  const scale = 1 / Math.max(1, total);
  let from = 0;
  return inLayer.map(({ kind, index }) => {
    const to = from + kind.growth.chance * mostGrowth(kind) * scale;
    const share = { kind: index, from, to };
    from = to;
    return share;
  });
}

/** The first form of each kind: the cast's forms are its kinds' plants in order. */
export function firstForms(cast: Cast): number[] {
  let next = 0;
  return cast.kinds.map((kind) => {
    const first = next;
    next += kind.plants.length;
    return first;
  });
}

/** The kind of each of the cast's forms. */
export function formKinds(cast: Cast): number[] {
  return cast.kinds.flatMap((kind, index) => kind.plants.map(() => index));
}

interface Layout {
  readonly kinds: ReturnType<typeof shares>;
  readonly forms: number[];
  readonly kindOf: number[];
}

const layouts = new WeakMap<Cast, Map<Layer, Layout>>();

/** A cast's shares, first forms and forms' kinds for a layer, worked out once a cast. */
function layout(cast: Cast, layer: Layer): Layout {
  const byLayer = layouts.get(cast) ?? new Map<Layer, Layout>();
  layouts.set(cast, byLayer);
  const known = byLayer.get(layer);
  if (known) return known;
  const made = { kinds: shares(cast, layer), forms: firstForms(cast), kindOf: formKinds(cast) };
  byLayer.set(layer, made);
  return made;
}

/**
 * One layer of one tile: each slot's plant, if the ground grows it, sorted by form and each form's by rank, so the
 * far plants thinned out at a distance are the end of each form's run. The low layer keeps off the feet
 * of the tile's tall plants (`tall`, that layer's scatter). Nothing grows on water, marks or the caller's cleared
 * ground.
 */
export function scatterTile(
  cast: Cast,
  layer: Layer,
  tileX: number,
  tileY: number,
  ground: ScatterGround,
  tall: Float32Array | null = null,
): Float32Array {
  const slot = SLOT_M[layer];
  const across = TILE_M / slot;
  const { kinds, forms, kindOf } = layout(cast, layer);
  const total = kinds[kinds.length - 1]?.to ?? 0;
  const planted: number[][] = [];
  const salt = layer === 'tall' ? 1 : 2;
  for (let index = 0; index < across * across; index++) {
    const seed = hashOf(tileX, tileY, salt, index);
    const pick = drawn(seed, 0);
    if (pick >= total) continue;
    const share = kinds.find((each) => pick < each.to);
    const kind = share && cast.kinds[share.kind];
    if (!share || !kind) continue;
    const [east, south] = [
      ((index % across) + drawn(seed, 1)) * slot,
      (Math.floor(index / across) + drawn(seed, 2)) * slot,
    ];
    const [x, y] = [tileX * TILE_M + east, tileY * TILE_M + south];
    const here = ground.sample(x, y);
    const growth = growthAt(kind, here, groveAt(x, y), ground.snowM);
    if (((pick - share.from) / (share.to - share.from)) * mostGrowth(kind) >= growth) continue;
    const width = kind.sizes[0] + (kind.sizes[1] - kind.sizes[0]) * drawn(seed, 3);
    if (tall && crowded(cast, kindOf, tall, east, south, kind.footM * width)) continue;
    if (ground.cleared(x, y)) continue;
    const plant = Math.min(kind.plants.length - 1, Math.floor(drawn(seed, 4) * kind.plants.length));
    const form = (forms[share.kind] ?? 0) + plant;
    // Sunk by its foot's rise across the slope, so its downhill side never stands clear of the ground.
    const foot = here.height - here.slope * kind.footM * width - 0.1;
    const height = width * (0.88 + 0.24 * drawn(seed, 5));
    planted.push([
      form,
      east,
      south,
      foot,
      drawn(seed, 6) * Math.PI * 2,
      width,
      height,
      drawn(seed, 7) * 2 - 1,
      drawn(seed, 8),
    ]);
  }
  planted.sort((a, b) => (a[0] ?? 0) - (b[0] ?? 0) || (a[8] ?? 0) - (b[8] ?? 0));
  return Float32Array.from(planted.flat());
}

/** Whether a point lies within `radius` (and a hand's breadth) of a tall plant's foot. */
function crowded(
  cast: Cast,
  kindOf: readonly number[],
  tall: Float32Array,
  east: number,
  south: number,
  radius: number,
) {
  for (let offset = 0; offset < tall.length; offset += PLANTED_FLOATS) {
    const kind = cast.kinds[kindOf[tall[offset] ?? 0] ?? -1];
    const reach = (kind?.footM ?? 0) * (tall[offset + 5] ?? 1) + radius + 0.3;
    if (Math.hypot((tall[offset + 1] ?? 0) - east, (tall[offset + 2] ?? 0) - south) < reach) return true;
  }
  return false;
}
