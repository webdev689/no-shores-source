// An island's plan as the room module hands it to the page (crates/room-wasm/src/isle_door.rs `plan_json`), read and
// checked whole before anything is drawn from it. Every point is in the island's own frame: metres from its middle,
// x east, y south, z up.
import type { GroundLook } from './isleGround.ts';

export type Point2 = readonly [number, number];

/** One module set on the island: its number in the contract (the catalog's name order), where its base's middle
 *  stands, the bearing its front faces (clockwise from north, radians), its size against the module's, how much
 *  taller again, and whether its ember stands cold (1: a passage's lamp unlit; none or 0, it glows). */
export type IslePlacement = readonly [
  module: number,
  x: number,
  y: number,
  z: number,
  turn: number,
  scale: number,
  lift: number,
  cold?: number,
];

/** A solid as the room stands it: west, north, east, south, top. */
export type IsleBlock = readonly [west: number, north: number, east: number, south: number, top: number];

export type IsleKind = 'cove' | 'ruin' | 'quarry';

export interface IslePlan {
  readonly kind: IsleKind;
  readonly dungeon: string;
  readonly radius: number;
  readonly reach: number;
  /** The bearing from its middle its landing beach faces, radians clockwise from north. */
  readonly landing: number;
  readonly anchorage: Point2;
  readonly spawns: readonly Point2[];
  readonly facing: number;
  readonly door: { readonly at: Point2; readonly facing: number; readonly style: string };
  readonly landmark: readonly [Point2, number] | null;
  readonly guards: readonly Point2[];
  /** Its guards' camp, on an isle; null on a cove. */
  readonly camp: Point2 | null;
  readonly wrecks: readonly (readonly [x: number, y: number, lies: number])[];
  /** Where its resource nodes stand: the resource of the island whose waters it lies in. */
  readonly nodes: readonly Point2[];
  readonly ring: readonly Point2[];
  readonly placements: readonly IslePlacement[];
  /** The blocks the room stands the modules' solids as; empty from a room that does not send them. */
  readonly blocks: readonly IsleBlock[];
}

/** An island as the page shows it: its id, where its middle lies in the world (metres), its climate, its plan and its
 *  ground as `movement::Heights::to_floats` gives it (west, north, cell, columns, rows, then each height row by row
 *  from the north, NaN for none). */
export interface IsleShown {
  readonly id: number;
  readonly at: Point2;
  readonly climate: string;
  readonly plan: IslePlan;
  readonly heights: Float64Array;
  /** Its ground's look in place of its climate's (a passage's hollow, by its form). */
  readonly ground?: GroundLook;
}

const KINDS: readonly IsleKind[] = ['cove', 'ruin', 'quarry'];

const fail = (what: string): never => {
  throw new Error(`an island's plan ${what}`);
};

function numbers(value: unknown, count: number, what: string): number[] {
  if (!Array.isArray(value) || value.length !== count || !value.every((each) => Number.isFinite(each)))
    fail(`has ${what} that is not ${count} numbers`);
  return value as number[];
}

const finite = (value: unknown, what: string): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fail(`has no ${what}`);

const point = (value: unknown, what: string): Point2 => numbers(value, 2, what) as unknown as Point2;

function list<T>(value: unknown, what: string, each: (item: unknown) => T): T[] {
  if (!Array.isArray(value)) fail(`has no list of ${what}`);
  return (value as unknown[]).map(each);
}

/** Reads a plan's JSON, or throws saying what is wrong with it: anything missing, of the wrong shape, not a number. */
export function readIslePlan(text: string): IslePlan {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    fail('is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) fail('is not an object');
  const plan = raw as Record<string, unknown>;
  const kind = KINDS.find((known) => known === plan.kind) ?? fail(`is of kind ${String(plan.kind)}`);
  if (typeof plan.dungeon !== 'string') fail('names no dungeon');
  const door = (plan.door ?? {}) as Record<string, unknown>;
  if (typeof door.style !== 'string') fail("names no door's style");
  const landmark = plan.landmark as unknown[] | null;
  if (landmark !== null && (!Array.isArray(landmark) || landmark.length !== 2)) fail('has a landmark of no shape');
  const placements = list(plan.placements, 'placements', (each) => {
    const numbered = numbers(each, 7, 'a placement');
    if (!Number.isInteger(numbered[0]) || (numbered[0] ?? -1) < 0) fail('places a module by no whole number');
    return numbered as unknown as IslePlacement;
  });
  return {
    kind,
    dungeon: plan.dungeon as string,
    radius: finite(plan.radius, 'radius'),
    reach: finite(plan.reach, 'reach'),
    landing: finite(plan.landing, 'landing'),
    anchorage: point(plan.anchorage, 'an anchorage'),
    spawns: list(plan.spawns, 'spawns', (each) => point(each, 'a spawn')),
    facing: finite(plan.facing, 'facing'),
    door: {
      at: point(door.at, "a door's place"),
      facing: finite(door.facing, "door's facing"),
      style: door.style as string,
    },
    landmark:
      landmark === null ? null : [point(landmark[0], "a landmark's place"), finite(landmark[1], "landmark's facing")],
    guards: list(plan.guards, 'guards', (each) => point(each, "a guard's post")),
    camp: plan.camp === null ? null : point(plan.camp, 'a camp'),
    wrecks: list(
      plan.wrecks,
      'wrecks',
      (each) => numbers(each, 3, 'a wreck') as unknown as readonly [number, number, number],
    ),
    nodes: plan.nodes === undefined ? [] : list(plan.nodes, 'nodes', (each) => point(each, "a node's place")),
    ring: list(plan.ring, 'ring points', (each) => point(each, 'a ring point')),
    placements,
    blocks:
      plan.blocks === undefined
        ? []
        : list(plan.blocks, 'blocks', (each) => numbers(each, 5, 'a block') as unknown as IsleBlock),
  };
}

/** A ground's numbers read: its grid's north-west corner, cell, columns and rows, and the heights (NaN for none). */
export interface IsleGrid {
  readonly west: number;
  readonly north: number;
  readonly cell: number;
  readonly columns: number;
  readonly rows: number;
  readonly heights: Float64Array;
}

/** Splits `movement::Heights::to_floats` into its grid and its heights, or throws if the counts do not agree. */
export function gridOf(floats: Float64Array): IsleGrid {
  const [west = NaN, north = NaN, cell = NaN, columns = NaN, rows = NaN] = floats;
  if (![west, north, cell].every(Number.isFinite) || !(cell > 0)) throw new Error("an island's ground has no grid");
  if (!Number.isInteger(columns) || !Number.isInteger(rows) || columns < 2 || rows < 2)
    throw new Error("an island's ground is not a grid of whole columns and rows");
  if (floats.length !== 5 + columns * rows)
    throw new Error(`an island's ground of ${columns} by ${rows} is ${floats.length - 5} heights`);
  return { west, north, cell, columns, rows, heights: floats.subarray(5) };
}
