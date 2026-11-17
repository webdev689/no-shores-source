// Daggerfall's RMB town blocks as content/world/rmb holds them, and where a block's pieces stand in the world: a
// placement is in its block's frame (x east of its west edge, y south of its north edge, z up from its ground, yaw
// clockwise from north turning a model's +z toward east), and the block stands on its cell at the cell's level.
import { CELL_M } from './plan.ts';

/** A building's model: [modelId, x, y, z, yaw, buildingType, record]. */
export type BuildingRow = readonly [number, number, number, number, number, number, number];
/** A prop: [modelId, x, y, z, yaw, scale]. */
export type PropRow = readonly [number, number, number, number, number, number];

export type RmbBlock = {
  readonly name: string;
  readonly buildings: readonly BuildingRow[];
  readonly props: readonly PropRow[];
  /** Base64 of the 16 x 16 ground tiles, row by row from the north-west one. */
  readonly ground: string;
};

/** Tiles along a block's side, and a tile's side in metres. */
export const TILES = 16;
export const TILE_M = CELL_M / TILES;

/** The blocks of one of content/world/rmb's files, one block a line. */
export function parseBlockFile(text: string): RmbBlock[] {
  const blocks: RmbBlock[] = [];
  for (const line of text.split('\n')) {
    const row = line.trim().replace(/,$/, '');
    if (row.startsWith('{')) blocks.push(JSON.parse(row) as RmbBlock);
  }
  return blocks;
}

/** The files of content/world/rmb that hold the named blocks, read from the index's text. */
export function blockFiles(indexText: string, names: Iterable<string>): string[] {
  const index = JSON.parse(indexText) as { blocks: readonly (readonly [string, string, ...unknown[]])[] };
  const fileOf = new Map(index.blocks.map((row) => [row[0], row[1]]));
  const files = new Set<string>();
  for (const name of names) {
    const file = fileOf.get(name);
    if (file) files.add(file);
  }
  return [...files].sort();
}

/** A ground tile: its record in the climate's terrain set (water, dirt, grass, stone, then the edges between them)
 *  and its quarter turns, a flip read as a half turn as Daggerfall Unity reads it. */
export type GroundTile = { readonly record: number; readonly turns: number };

/** Records past the terrain set's last, Daggerfall's random-ground markers, are drawn as grass. */
const LAST_RECORD = 55;
const GRASS = 2;

/** A block's 256 ground tiles, row by row from the north-west one. */
export function groundTiles(block: RmbBlock): GroundTile[] {
  const bytes = Uint8Array.from(atob(block.ground), (character) => character.charCodeAt(0));
  return Array.from(bytes, (byte) => {
    const record = byte & 63;
    return { record: record > LAST_RECORD ? GRASS : record, turns: ((byte >> 6) & 1) | (((byte >> 7) & 1) << 1) };
  });
}

/** Where a piece stands: its origin in world metres (east, south, up) and its yaw in radians. */
export type Placement = { readonly east: number; readonly south: number; readonly up: number; readonly yaw: number };

/** A block's piece placed on a cell whose north-west corner and level are given. */
export function placed(
  corner: readonly [number, number],
  level: number,
  row: readonly [number, number, number, number, number, ...number[]],
): Placement {
  return { east: corner[0] + row[1], south: corner[1] + row[2], up: level + row[3], yaw: (row[4] * Math.PI) / 180 };
}

/** A point of a model (x right, y up, z forward) where its placement stands it, in world metres (east, south, up). */
export function toWorld(
  placement: Placement,
  point: readonly [number, number, number],
): [east: number, south: number, up: number] {
  const [cosine, sine] = [Math.cos(placement.yaw), Math.sin(placement.yaw)];
  return [
    placement.east + point[0] * cosine + point[2] * sine,
    placement.south + point[0] * sine - point[2] * cosine,
    placement.up + point[1],
  ];
}

/** A model's direction turned as its placement turns it, in world axes (east, south, up). */
export function turnedToWorld(yaw: number, direction: readonly [number, number, number]): [number, number, number] {
  const [cosine, sine] = [Math.cos(yaw), Math.sin(yaw)];
  return [direction[0] * cosine + direction[2] * sine, direction[0] * sine - direction[2] * cosine, direction[1]];
}
