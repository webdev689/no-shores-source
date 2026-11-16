// A building's plan read as masses: each wing's rectangles in metres, what stands on each square, and the roof the
// Building Forge puts on each. The model, a far view's blocks and a collider all read the plan through here, so they
// agree on where the building stands and how high.
import type { BuildingMeasure, BuildingTable, MeasuredDoor, Wing } from './tables.ts';
import type { Frame } from './frame.ts';
import { boxFrame } from './frame.ts';
import { randomFromSeed } from './random.ts';

/** How far a roof's eave runs past its wall (m), where the box leaves room. */
const EAVE_M = 0.3;
/** The steepest a roof rises over its half-span. */
const ROOF_PITCH = 0.9;

/** One rectangle of a wing, in metres, from its base (the ground, or a covered way's underside) to its top. */
export type Block = {
  readonly wing: Wing;
  readonly index: number;
  readonly column0: number;
  readonly row0: number;
  readonly column1: number;
  readonly row1: number;
  readonly base: number;
  readonly top: number;
  readonly x0: number;
  readonly x1: number;
  readonly z0: number;
  readonly z1: number;
};

export type Plan = {
  readonly masses: readonly Block[];
  /** The block standing on a square, or null where the building leaves the ground open (or off the grid). */
  readonly blockAt: (column: number, row: number) => Block | null;
  readonly xAt: (column: number) => number;
  readonly zAt: (row: number) => number;
};

export function planOf(measure: BuildingMeasure): Plan {
  const [columns, rows] = measure.grid;
  const stepX = (measure.max[0] - measure.min[0]) / columns,
    stepZ = (measure.max[2] - measure.min[2]) / rows;
  const xAt = (column: number): number => measure.min[0] + column * stepX,
    zAt = (row: number): number => measure.min[2] + row * stepZ;
  const mass: (Block | null)[] = new Array<Block | null>(columns * rows).fill(null);
  const masses: Block[] = [];
  measure.plan.forEach((wing, index) => {
    const base = wing.low ?? measure.min[1];
    for (const rect of wing.rects) {
      const [column0, row0, column1, row1, stepTop] = rect;
      const top = stepTop ?? wing.eaves;
      const block: Block = {
        wing,
        index,
        column0,
        row0,
        column1,
        row1,
        base,
        top,
        x0: xAt(column0),
        x1: xAt(column1),
        z0: zAt(row0),
        z1: zAt(row1),
      };
      masses.push(block);
      for (let row = row0; row < row1; row++)
        for (let column = column0; column < column1; column++) mass[row * columns + column] = block;
    }
  });
  const blockAt = (column: number, row: number): Block | null =>
    column < 0 || row < 0 || column >= columns || row >= rows ? null : mass[row * columns + column];
  return { masses, blockAt, xAt, zAt };
}

/** A building's own seed: its first draw says whether its pitched roofs are gabled or hipped, the rest place its
 *  chimneys. */
export const seedOf = (id: number): number => (id * 2246822519) >>> 0;

/** Whether a door opens onto this mass's top at its eaves: a door whose sill stands at the top, the mass within two
 *  metres before it. Such a mass is a terrace, built flat. */
function terrace(block: Block, doors: readonly MeasuredDoor[]): boolean {
  return doors.some((door) => {
    const sill = Math.min(door.a[1], door.b[1], door.c[1]);
    if (Math.abs(sill - block.top) > 0.5) return false;
    const doorX = [door.a[0], door.b[0], door.c[0]],
      doorZ = [door.a[2], door.b[2], door.c[2]];
    const ahead = (low: number, high: number, normal: number): number[] =>
      normal > 0.5 ? [high, high + 2] : normal < -0.5 ? [low - 2, low] : [low - 0.3, high + 0.3];
    const [fromX, toX] = ahead(Math.min(...doorX), Math.max(...doorX), door.n[0]),
      [fromZ, toZ] = ahead(Math.min(...doorZ), Math.max(...doorZ), door.n[2]);
    return fromX < block.x1 && toX > block.x0 && fromZ < block.z1 && toZ > block.z0;
  });
}

/** Whether the squares beside a block's side leave it standing in the open: none of them, or all lower. */
export const openBeside = (block: Block, cells: readonly (Block | null)[]): boolean =>
  cells.every((cell) => !cell || cell.top < block.top - 0.05);

/** A pitched roof over a block: its eaves' extent, named as a mass's sides, and its rise over the block's top. */
export type Roof = {
  readonly west: number;
  readonly east: number;
  readonly south: number;
  readonly north: number;
  readonly rise: number;
};

/** The pitched roof the forge lays over a block, or null where it lays it flat: a step, a platform, a wing whose
 *  ridge barely clears its eaves, a narrow one, one at the top of its box, or a terrace. The eaves run out over open
 *  ground as far as the box allows. */
export function roofOf(block: Block, plan: Plan, fit: Frame, doors: readonly MeasuredDoor[]): Roof | null {
  const { wing } = block;
  const span = Math.min(block.x1 - block.x0, block.z1 - block.z0);
  const pitched =
    !wing.steps &&
    !wing.platform &&
    wing.ridge - wing.eaves > 0.5 &&
    span >= 1.2 &&
    fit.y1 - block.top > 0.3 &&
    !terrace(block, doors);
  if (!pitched) return null;
  const out = (side: readonly (Block | null)[]): number => (openBeside(block, side) ? EAVE_M : 0);
  const cellsAlong = (fixed: number, from: number, to: number, horizontal: boolean): (Block | null)[] =>
    Array.from({ length: to - from }, (unused, k) =>
      horizontal ? plan.blockAt(from + k, fixed) : plan.blockAt(fixed, from + k),
    );
  const west = Math.max(fit.x0, block.x0 - out(cellsAlong(block.column0 - 1, block.row0, block.row1, false))),
    east = Math.min(fit.x1, block.x1 + out(cellsAlong(block.column1, block.row0, block.row1, false))),
    south = Math.max(fit.z0, block.z0 - out(cellsAlong(block.row0 - 1, block.column0, block.column1, true))),
    north = Math.min(fit.z1, block.z1 + out(cellsAlong(block.row1, block.column0, block.column1, true)));
  const rise = Math.min(
    wing.ridge - wing.eaves,
    ROOF_PITCH * (Math.min(east - west, north - south) / 2),
    fit.y1 - block.top,
  );
  return { west, east, south, north, rise };
}

/**
 * A solid mass of a building's plan, in the model's frame: from x `west` to `east` and z `south` to `north`, from
 * `base` (the ground, or a covered way's underside) to `eaves`, roofed up to `ridge` as the forge roofs it, the
 * ridge running along `ridgeAlong`; the model's eaves may run up to 0.3 m past a side over open ground. Every
 * number comes of + - * /, min and max, so any engine reads the same masses.
 */
export type Mass = {
  readonly west: number;
  readonly east: number;
  readonly south: number;
  readonly north: number;
  readonly base: number;
  readonly eaves: number;
  readonly ridge: number;
  readonly roof: 'gable' | 'hip' | 'flat';
  readonly ridgeAlong: 'x' | 'z';
};

/** A building's plan as solid masses, one a wing's rectangle, for drawing it far away and for collision; empty for
 *  an id the Building Forge does not stand. */
export function buildingMasses(table: BuildingTable, id: number): Mass[] {
  const measure: BuildingMeasure | undefined = table[id];
  if (!measure) return [];
  const fit = boxFrame(measure);
  const plan = planOf(measure);
  const gabled = randomFromSeed(seedOf(id)).next() < 0.5;
  return plan.masses.map((block) => {
    const roof = roofOf(block, plan, fit, measure.doors ?? []);
    const [alongX, alongZ] = roof
      ? [roof.east - roof.west, roof.north - roof.south]
      : [block.x1 - block.x0, block.z1 - block.z0];
    return {
      west: block.x0,
      east: block.x1,
      south: block.z0,
      north: block.z1,
      base: block.base,
      eaves: block.top,
      ridge: roof ? block.top + roof.rise : block.top,
      roof: roof ? (gabled ? 'gable' : 'hip') : 'flat',
      ridgeAlong: alongX >= alongZ ? 'x' : 'z',
    };
  });
}

/** The box a building stands in, as Mass names its sides; null for an id the Building Forge does not stand. */
export function buildingBox(
  table: BuildingTable,
  id: number,
): { west: number; east: number; south: number; north: number; base: number; top: number } | null {
  const measure: BuildingMeasure | undefined = table[id];
  if (!measure) return null;
  const [west, base, south] = measure.min,
    [east, top, north] = measure.max;
  return { west, east, south, north, base, top };
}
