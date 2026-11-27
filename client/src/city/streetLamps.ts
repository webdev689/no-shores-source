// The street lamps along a lit city's blocks' own streets ([[Overlook's City Below Is Lit at Night, in Detail]]). The
// plan places the avenues', the ramps' and the harbour's lights (the city crate's `lights`); a block's streets are its
// dirt tiles, which only the page holds, so their lamps are placed here, by one rule from the blocks as laid, the same
// on every machine: on a street tile's edge where the street ends beside it, never in or before a building, nor in a
// prop, and never nearer another lamp than STREET_APART_M.
import type { BuildingTable, PropTable } from '../models/tables.ts';
import { groundTiles, type RmbBlock, TILE_M, TILES } from './blocks.ts';
import { cellCorner, type CityLight, type CityPlan, type PlanCell } from './plan.ts';
import { finished } from './steps.ts';

/** A street's ground tile: plain dirt, the terrain set's record 1 (`content/world/rmb`: streets are dirt). */
const DIRT = 1;
/** How far in from the street's edge a post stands, metres. */
const EDGE_INSET_M = 0.6;
/** The least distance between two lamps along the streets, metres, and between a block's lamp and any other light. */
export const STREET_APART_M = 22;
/** How far a post keeps from a building's box, so it stands clear of its doorways too, and from a prop's, metres. */
export const BUILDING_CLEAR_M = 2;
export const PROP_CLEAR_M = 0.6;
/** How far round the plaza no street lamp stands, metres: past its parapet and the reach of a lamp's pool. */
export const PLAZA_CLEAR_M = 12;

/** A piece standing in a block cell: its model's id, its origin (east, south, world metres) and yaw, radians. */
export interface StandingPiece {
  readonly id: number;
  readonly at: readonly [number, number];
  readonly yaw: number;
}

/** The ground near which a lamp would be too close to another: a grid of buckets STREET_APART_M wide. */
class Spaced {
  private readonly buckets = new Map<number, [number, number][]>();

  add(place: readonly [number, number]): void {
    const key = this.key(Math.floor(place[0] / STREET_APART_M), Math.floor(place[1] / STREET_APART_M));
    const list = this.buckets.get(key) ?? [];
    list.push([place[0], place[1]]);
    this.buckets.set(key, list);
  }

  /** Whether a point stands nearer than STREET_APART_M to any added. */
  crowds(place: readonly [number, number]): boolean {
    const [column, row] = [Math.floor(place[0] / STREET_APART_M), Math.floor(place[1] / STREET_APART_M)];
    for (let down = -1; down <= 1; down++)
      for (let across = -1; across <= 1; across++)
        for (const other of this.buckets.get(this.key(column + across, row + down)) ?? [])
          if (Math.hypot(other[0] - place[0], other[1] - place[1]) < STREET_APART_M) return true;
    return false;
  }

  /** A bucket's number: its column and row, each well within 2^20 for a city some kilometres across. */
  private key(column: number, row: number): number {
    return (row + (1 << 20)) * (1 << 21) + column + (1 << 20);
  }
}

/** Whether a piece's box (its model's, grown by `margin`) holds a point, world metres. A model's x right and z
 *  forward are turned by its yaw into east and south (`blocks.ts` `toWorld`), so the point is turned back. */
export function inPiece(
  piece: StandingPiece,
  box: { readonly min: readonly number[]; readonly max: readonly number[] },
  point: readonly [number, number],
  margin: number,
): boolean {
  const [east, south] = [point[0] - piece.at[0], point[1] - piece.at[1]];
  const [cosine, sine] = [Math.cos(piece.yaw), Math.sin(piece.yaw)];
  const [x, z] = [east * cosine + south * sine, east * sine - south * cosine];
  return (
    x > (box.min[0] ?? 0) - margin &&
    x < (box.max[0] ?? 0) + margin &&
    z > (box.min[2] ?? 0) - margin &&
    z < (box.max[2] ?? 0) + margin
  );
}

/** Each street tile's sides, in order, with the step to the tile beside it: north, east, south, west. */
const SIDES = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
] as const;

/**
 * The lamps along a lit city's blocks' streets: for each block cell in the plan's order, each of its dirt tiles row
 * by row, each side where the tile beside it in the block is not dirt, a lamp just in from that edge's middle, on
 * the cell's level, kept where it stands clear of the cell's pieces, of the plaza and of every light already placed
 * (the plan's own first). A side on the block's edge is never lit: the street may carry on into the next block.
 * None for a city the plan does not light.
 */
export function streetLamps(
  plan: CityPlan,
  blocks: ReadonlyMap<string, RmbBlock>,
  tables: { readonly buildings: BuildingTable; readonly props: PropTable },
  piecesOf: (cell: PlanCell) => readonly StandingPiece[],
): CityLight[] {
  return finished(streetLampSteps(plan, blocks, tables, piecesOf));
}

/** The lamps as `streetLamps` places them, a block a step (`steps.ts`). */
export function* streetLampSteps(
  plan: CityPlan,
  blocks: ReadonlyMap<string, RmbBlock>,
  tables: { readonly buildings: BuildingTable; readonly props: PropTable },
  piecesOf: (cell: PlanCell) => readonly StandingPiece[],
): Generator<void, CityLight[]> {
  const lights = plan.lights ?? [];
  if (!lights.length) return [];
  const spaced = new Spaced();
  // the blocks built under the plaza's pad are hidden by it, and their light would show through its floor
  const [plazaWest, plazaNorth, plazaEast, plazaSouth] = plan.social.bounds;
  const underPlaza = (point: readonly [number, number]) =>
    point[0] > plazaWest - PLAZA_CLEAR_M &&
    point[0] < plazaEast + PLAZA_CLEAR_M &&
    point[1] > plazaNorth - PLAZA_CLEAR_M &&
    point[1] < plazaSouth + PLAZA_CLEAR_M;
  for (const light of lights) spaced.add([light.at[0], light.at[1]]);
  const placed: CityLight[] = [];
  for (const cell of plan.cells) {
    const block = cell.use === 'block' && cell.block !== undefined ? blocks.get(cell.block) : undefined;
    if (!block || cell.level === undefined) continue;
    const street = groundTiles(block).map((tile) => tile.record === DIRT);
    const [west, north] = cellCorner(plan, cell);
    const boxes = piecesOf(cell).flatMap((piece) => {
      const building = tables.buildings[piece.id];
      const box = building ?? tables.props[piece.id];
      return box ? [{ piece, box, margin: building ? BUILDING_CLEAR_M : PROP_CLEAR_M }] : [];
    });
    const clear = (point: readonly [number, number]) =>
      boxes.every(({ piece, box, margin }) => !inPiece(piece, box, point, margin));
    for (let row = 0; row < TILES; row++)
      for (let column = 0; column < TILES; column++) {
        if (!street[row * TILES + column]) continue;
        for (const [east, south] of SIDES) {
          const [besideColumn, besideRow] = [column + east, row + south];
          const inBlock = besideColumn >= 0 && besideRow >= 0 && besideColumn < TILES && besideRow < TILES;
          if (!inBlock || street[besideRow * TILES + besideColumn]) continue;
          const reach = TILE_M / 2 - EDGE_INSET_M;
          const point: [number, number] = [
            west + (column + 0.5) * TILE_M + east * reach,
            north + (row + 0.5) * TILE_M + south * reach,
          ];
          if (underPlaza(point) || spaced.crowds(point) || !clear(point)) continue;
          spaced.add(point);
          placed.push({ at: [point[0], point[1], cell.level], kind: 'lamp' });
        }
      }
    yield;
  }
  return placed;
}
