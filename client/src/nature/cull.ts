import type { Group, Packed } from './field.ts';
import { TILE_M } from './scatter.ts';

/**
 * Which packed tiles the camera may see: each tile's bounding sphere against the view's four sides and its near
 * plane, read from the view-projection of points measured from the eye. `anchorFromEye` is the packing's anchor
 * from the eye (metres east, south, and the eye's drawn height negated); heights are drawn times `exaggeration`.
 */
export function tilesInView(
  packed: Packed,
  fromEye: Float32Array,
  anchorFromEye: readonly [number, number, number],
  exaggeration: number,
  out: Uint8Array = new Uint8Array(packed.tiles.length / 4),
): Uint8Array {
  const row = (index: number) => [0, 4, 8, 12].map((column) => fromEye[column + index] ?? 0);
  const [first, second, , last] = [row(0), row(1), row(2), row(3)];
  const depth = row(2);
  const planes = [
    last.map((value, index) => value + (first[index] ?? 0)),
    last.map((value, index) => value - (first[index] ?? 0)),
    last.map((value, index) => value + (second[index] ?? 0)),
    last.map((value, index) => value - (second[index] ?? 0)),
    last.map((value, index) => value - (depth[index] ?? 0)),
  ].map(([a = 0, b = 0, third = 0, fourth = 0]) => {
    const length = Math.hypot(a, b, third) || 1;
    return [a / length, b / length, third / length, fourth / length] as const;
  });
  // Every tile every frame, thousands of them: each plane's four numbers read by index, nothing made a tile.
  const sides = Float64Array.from(planes.flat());
  const { tiles } = packed;
  const across = TILE_M * Math.SQRT1_2 + packed.spread;
  /** Whether a sphere about (x, y, z) clears none of the sides. */
  const sphereSeen = (centreX: number, centreY: number, centreZ: number, radius: number): number => {
    for (let side = 0; side < sides.length; side += 4) {
      const reach = sides[side]! * centreX + sides[side + 1]! * centreY + sides[side + 2]! * centreZ + sides[side + 3]!;
      if (!(reach >= -radius)) return 0;
    }
    return 1;
  };
  const tileSeen = (tile: number): number => {
    const [lowest, highest] = [tiles[tile * 4 + 2] ?? 0, tiles[tile * 4 + 3] ?? 0];
    const centreX = (tiles[tile * 4] ?? 0) + anchorFromEye[0];
    const centreY = (tiles[tile * 4 + 1] ?? 0) + anchorFromEye[1];
    const centreZ = ((lowest + highest) / 2) * exaggeration + anchorFromEye[2];
    const rise = ((highest - lowest) / 2) * exaggeration;
    return sphereSeen(centreX, centreY, centreZ, Math.sqrt(across * across + rise * rise));
  };
  const { blocks } = packed;
  if (!blocks) {
    for (let tile = 0; tile < tiles.length / 4; tile++) out[tile] = tileSeen(tile);
    return out;
  }
  // A block's sphere holds each of its tiles' (their middles' spread, a tile's own reach, the block's whole height),
  // and a metre more for the rounding: a block out of view has every tile of it out.
  out.fill(0);
  forEachBlock(blocks, (span, first, last) => {
    const [west, north, low, east, south, high] = span;
    const radius = Math.hypot((east - west) / 2, (south - north) / 2) + across + ((high - low) / 2) * exaggeration + 1;
    const centreX = (west + east) / 2 + anchorFromEye[0];
    const centreY = (north + south) / 2 + anchorFromEye[1];
    if (!sphereSeen(centreX, centreY, ((low + high) / 2) * exaggeration + anchorFromEye[2], radius)) return;
    for (let member = first; member < last; member++) {
      const tile = blocks.members[member] ?? 0;
      out[tile] = tileSeen(tile);
    }
  });
  return out;
}

/** Marks the tiles whose plants may cast into the sun's shadow square, as `reaches` judges a box measured from the eye
 *  (west, north, low, then east, south, high): those behind the camera too, whose shadows fall forward into view. */
export function tilesCasting(
  packed: Packed,
  anchorFromEye: readonly [number, number, number],
  exaggeration: number,
  reaches: (low: readonly [number, number, number], high: readonly [number, number, number]) => boolean,
  out: Uint8Array = new Uint8Array(packed.tiles.length / 4),
): Uint8Array {
  const { tiles } = packed;
  const half = TILE_M / 2 + packed.spread;
  // The box asked about, laid afresh for each tile: `reaches` keeps neither.
  const low: [number, number, number] = [0, 0, 0];
  const high: [number, number, number] = [0, 0, 0];
  /** Whether the box from (west, north) to (east, south), its feet from `lowest` to `highest`, may cast. */
  const boxCasts = (west: number, north: number, east: number, south: number, lowest: number, highest: number) => {
    low[0] = west - half;
    low[1] = north - half;
    low[2] = lowest * exaggeration + anchorFromEye[2];
    high[0] = east + half;
    high[1] = south + half;
    // A tile records its plants' feet; the tallest tree stands some 40 m over its foot.
    high[2] = highest * exaggeration + anchorFromEye[2] + 40;
    return reaches(low, high) ? 1 : 0;
  };
  const tileCasts = (tile: number): number => {
    const east = (tiles[tile * 4] ?? 0) + anchorFromEye[0];
    const south = (tiles[tile * 4 + 1] ?? 0) + anchorFromEye[1];
    return boxCasts(east, south, east, south, tiles[tile * 4 + 2] ?? 0, tiles[tile * 4 + 3] ?? 0);
  };
  const { blocks } = packed;
  if (!blocks) {
    for (let tile = 0; tile < tiles.length / 4; tile++) out[tile] = tileCasts(tile);
    return out;
  }
  // A block's box holds each of its tiles' boxes, and a metre more for the rounding: a block that casts nowhere has
  // no tile that does.
  out.fill(0);
  forEachBlock(blocks, (span, first, last) => {
    const [west, north, lowest, east, south, highest] = span;
    const [fromX, fromY] = [anchorFromEye[0] - 1, anchorFromEye[1] - 1];
    const [toX, toY] = [anchorFromEye[0] + 1, anchorFromEye[1] + 1];
    if (!boxCasts(west + fromX, north + fromY, east + toX, south + toY, lowest - 1, highest + 1)) return;
    for (let member = first; member < last; member++) {
      const tile = blocks.members[member] ?? 0;
      out[tile] = tileCasts(tile);
    }
  });
  return out;
}

/** The side of a block of tiles, metres: eight tiles. */
const BLOCK_M = 8 * TILE_M;

/** The packed tiles (`Packed.tiles`'s rows: middle east, south, then lowest and highest) gathered in squares
 *  BLOCK_M a side: each block's tiles and the box their rows span, for a cull to pass over a whole square at once. */
export interface TileBlocks {
  /** Where each block's tiles begin in `members`, and where the last ends. */
  readonly firsts: Uint32Array;
  readonly members: Uint32Array;
  /** Each block's least east, south and lowest, then its most east, south and highest, from its tiles' rows. */
  readonly spans: Float32Array;
}

/** The packed tiles' rows gathered in blocks, once a packing. */
export function blocksOf(tiles: Float32Array): TileBlocks {
  const byBlock = new Map<string, number[]>();
  for (let tile = 0; tile < tiles.length / 4; tile++) {
    const key = `${Math.floor((tiles[tile * 4] ?? 0) / BLOCK_M)} ${Math.floor((tiles[tile * 4 + 1] ?? 0) / BLOCK_M)}`;
    const block = byBlock.get(key);
    if (block) block.push(tile);
    else byBlock.set(key, [tile]);
  }
  const firsts = new Uint32Array(byBlock.size + 1);
  const members = new Uint32Array(tiles.length / 4);
  const spans = new Float32Array(byBlock.size * 6);
  let [block, laid] = [0, 0];
  for (const inBlock of byBlock.values()) {
    firsts[block] = laid;
    const span = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (const tile of inBlock) {
      members[laid++] = tile;
      for (let part = 0; part < 3; part++) {
        const [least, most] = [tiles[tile * 4 + part] ?? 0, tiles[tile * 4 + (part === 2 ? 3 : part)] ?? 0];
        span[part] = Math.min(span[part] ?? 0, least);
        span[part + 3] = Math.max(span[part + 3] ?? 0, most);
      }
    }
    spans.set(span, block * 6);
    block += 1;
  }
  firsts[block] = laid;
  return { firsts, members, spans };
}

/** Each block's span (west, north, lowest, east, south, highest) and its tiles' place in `members`, in turn. */
function forEachBlock(
  blocks: TileBlocks,
  each: (span: readonly [number, number, number, number, number, number], first: number, last: number) => void,
): void {
  for (let block = 0; block + 1 < blocks.firsts.length; block++) {
    const row = block * 6;
    const { spans } = blocks;
    const span = [
      spans[row]!,
      spans[row + 1]!,
      spans[row + 2]!,
      spans[row + 3]!,
      spans[row + 4]!,
      spans[row + 5]!,
    ] as const;
    each(span, blocks.firsts[block] ?? 0, blocks.firsts[block + 1] ?? 0);
  }
}

/** A group's instances in view, as (first, count) pairs: neighbouring tiles in view join into one draw. */
export function runsInView(group: Group, visible: Uint8Array): number[] {
  const runs: number[] = [];
  let next = group.first;
  for (const [index, tile] of group.tiles.entries()) {
    const count = group.counts[index] ?? 0;
    if (visible[tile]) {
      const last = runs.length - 2;
      if (last >= 0 && (runs[last] ?? 0) + (runs[last + 1] ?? 0) === next)
        runs[last + 1] = (runs[last + 1] ?? 0) + count;
      else runs.push(next, count);
    }
    next += count;
  }
  return runs;
}
