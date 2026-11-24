import { type Planes, sphereSeen, viewPlanes } from '../frustum.ts';
import type { Group, Packed } from './field.ts';
import { TILE_M } from './scatter.ts';

/** The view's planes, kept: a cull reads them only while it runs, so each frame lays them over the last's. */
const PLANES: Planes = new Float64Array(24);

/**
 * Which packed tiles the camera may see: each tile's bounding sphere against the view's planes, read from the
 * view-projection of points measured from the eye. `anchorFromEye` is the packing's anchor from the eye (metres east,
 * south, and the eye's drawn height negated); heights are drawn times `exaggeration`.
 */
export function tilesInView(
  packed: Packed,
  fromEye: Float32Array,
  anchorFromEye: readonly [number, number, number],
  exaggeration: number,
  out: Uint8Array = new Uint8Array(packed.tiles.length / 4),
): Uint8Array {
  const planes = viewPlanes(fromEye, PLANES);
  const { tiles } = packed;
  const across = TILE_M * Math.SQRT1_2 + packed.spread;
  const tileSeen = (tile: number): number => {
    const lowest = tiles[tile * 4 + 2] ?? 0;
    const highest = tiles[tile * 4 + 3] ?? 0;
    const centreX = (tiles[tile * 4] ?? 0) + anchorFromEye[0];
    const centreY = (tiles[tile * 4 + 1] ?? 0) + anchorFromEye[1];
    const centreZ = ((lowest + highest) / 2) * exaggeration + anchorFromEye[2];
    const rise = ((highest - lowest) / 2) * exaggeration;
    return sphereSeen(planes, centreX, centreY, centreZ, Math.sqrt(across * across + rise * rise)) ? 1 : 0;
  };
  const { blocks } = packed;
  if (!blocks) {
    for (let tile = 0; tile < tiles.length / 4; tile++) out[tile] = tileSeen(tile);
    return out;
  }
  // A block's sphere holds each of its tiles' (their middles' spread, a tile's own reach, the block's whole height),
  // and a metre more for the rounding: a block out of view has every tile of it out.
  out.fill(0);
  const { firsts, members, spans } = blocks;
  for (let block = 0; block + 1 < firsts.length; block++) {
    const row = block * 6;
    const west = spans[row]!;
    const north = spans[row + 1]!;
    const low = spans[row + 2]!;
    const east = spans[row + 3]!;
    const south = spans[row + 4]!;
    const high = spans[row + 5]!;
    const halfAcross = (east - west) / 2;
    const halfDown = (south - north) / 2;
    const radius =
      Math.sqrt(halfAcross * halfAcross + halfDown * halfDown) + across + ((high - low) / 2) * exaggeration + 1;
    const centreX = (west + east) / 2 + anchorFromEye[0];
    const centreY = (north + south) / 2 + anchorFromEye[1];
    if (!sphereSeen(planes, centreX, centreY, ((low + high) / 2) * exaggeration + anchorFromEye[2], radius)) continue;
    for (let member = firsts[block]!; member < firsts[block + 1]!; member++) {
      const tile = members[member]!;
      out[tile] = tileSeen(tile);
    }
  }
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
  const { firsts, members, spans } = blocks;
  const fromX = anchorFromEye[0] - 1;
  const fromY = anchorFromEye[1] - 1;
  const toX = anchorFromEye[0] + 1;
  const toY = anchorFromEye[1] + 1;
  for (let block = 0; block + 1 < firsts.length; block++) {
    const row = block * 6;
    const west = spans[row]!;
    const north = spans[row + 1]!;
    const lowest = spans[row + 2]!;
    const east = spans[row + 3]!;
    const south = spans[row + 4]!;
    const highest = spans[row + 5]!;
    if (!boxCasts(west + fromX, north + fromY, east + toX, south + toY, lowest - 1, highest + 1)) continue;
    for (let member = firsts[block]!; member < firsts[block + 1]!; member++) {
      const tile = members[member]!;
      out[tile] = tileCasts(tile);
    }
  }
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

/** The packed tiles' rows gathered in blocks, once a packing: blocks in the order their first tile comes, each
 *  one's tiles in their order. */
export function blocksOf(tiles: Float32Array): TileBlocks {
  const count = tiles.length / 4;
  const blockOf = new Uint32Array(count);
  const numbered = new Map<number, number>();
  for (let tile = 0; tile < count; tile++) {
    // A block's place as one number: the tiles lie within a few kilometres of the packing's anchor.
    const key = (Math.floor(tiles[tile * 4]! / BLOCK_M) + BLOCK_KEY_HALF) * BLOCK_KEY_ROW;
    const place = key + Math.floor(tiles[tile * 4 + 1]! / BLOCK_M) + BLOCK_KEY_HALF;
    let block = numbered.get(place);
    if (block === undefined) numbered.set(place, (block = numbered.size));
    blockOf[tile] = block;
  }
  const blocks = numbered.size;
  const firsts = new Uint32Array(blocks + 1);
  for (let tile = 0; tile < count; tile++) firsts[blockOf[tile]! + 1]! += 1;
  for (let block = 0; block < blocks; block++) firsts[block + 1]! += firsts[block]!;
  const members = new Uint32Array(count);
  const laid = firsts.slice(0, blocks);
  const spans = new Float32Array(blocks * 6);
  for (let block = 0; block < blocks; block++) spans.set(EMPTY_SPAN, block * 6);
  for (let tile = 0; tile < count; tile++) {
    const block = blockOf[tile]!;
    members[laid[block]!++] = tile;
    for (let part = 0; part < 3; part++) {
      const [least, most] = [tiles[tile * 4 + part]!, tiles[tile * 4 + (part === 2 ? 3 : part)]!];
      spans[block * 6 + part] = Math.min(spans[block * 6 + part]!, least);
      spans[block * 6 + part + 3] = Math.max(spans[block * 6 + part + 3]!, most);
    }
  }
  return { firsts, members, spans };
}

/** A block's place as one number, its column offset by half a row so no tile's goes below zero. */
const BLOCK_KEY_ROW = 1 << 16;
const BLOCK_KEY_HALF = 1 << 15;
const EMPTY_SPAN = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];

/** Draws laid out a frame at a time into arrays kept from frame to frame, so laying them makes nothing: the first
 *  `length` are each a part and a run of the list, from `firsts` for `counts` instances. */
export class Runs<Part> {
  readonly parts: Part[] = [];
  firsts = new Uint32Array(64);
  counts = new Uint32Array(64);
  length = 0;

  /** Empties the list, keeping its room. */
  clear(): void {
    this.length = 0;
  }

  /** Adds a draw of `part`, `count` instances from `first`. */
  add(part: Part, first: number, count: number): void {
    if (this.length === this.firsts.length) {
      const [firsts, counts] = [new Uint32Array(this.length * 2), new Uint32Array(this.length * 2)];
      firsts.set(this.firsts);
      counts.set(this.counts);
      [this.firsts, this.counts] = [firsts, counts];
    }
    this.parts[this.length] = part;
    this.firsts[this.length] = first;
    this.counts[this.length] = count;
    this.length += 1;
  }
}

/** Adds to `into` a group's instances in view as draws of `part`, each a run of the list: neighbouring tiles in view
 *  join into one draw. */
export function addRunsInView<Part>(group: Group, visible: Uint8Array, part: Part, into: Runs<Part>): void {
  const from = into.length;
  const { tiles, counts } = group;
  let next = group.first;
  for (let index = 0; index < tiles.length; index++) {
    const count = counts[index] ?? 0;
    if (visible[tiles[index]!]) {
      const last = into.length - 1;
      if (last >= from && into.firsts[last]! + into.counts[last]! === next) into.counts[last]! += count;
      else into.add(part, next, count);
    }
    next += count;
  }
}
