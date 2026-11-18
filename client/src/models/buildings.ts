// The Building Forge: a town building made in code from its plan alone. Each wing's masses are walled where they
// stand in the open, roofed (gabled or hipped by the building's own seed) or flat with a parapet, windowed a storey
// apart, and dressed in the pictures the classic building's walls and roofs wore. Its doors are kept as measured.
import type { ForgedModel } from './model.ts';
import type { BuildingMeasure, BuildingTable, MeasuredDoor } from './tables.ts';
import { boxFrame, type Frame } from './frame.ts';
import { partBuilder, type PartBuilder } from './parts.ts';
import { withDoors } from './doors.ts';
import { openBeside, planOf, roofOf, seedOf, type Block, type Plan } from './buildingPlan.ts';
import { randomFromSeed } from './random.ts';

/** A flat roof's parapet: its height and its thickness (m). */
const PARAPET_M = [0.35, 0.2];
/** A window: its side, a storey's height, its sill over the storey's floor and the clearance at a run's ends (m). */
const WINDOW_M = [1.6, 3.2, 0.9, 0.5];
/** How far inside a wall's outer face a walked-into room's lining shows its face (m): the layout crate's
 *  interiors.rs INSET_M + LINING_M, and a hand more so the picture lies over the lining. */
const LINING_FACE_M = 0.243;
/** A chimney: the shortest roof that carries one (m), the share of those that do, its stack's side (m), and the most
 *  a building stands. */
const CHIMNEY_M = [6, 0.6, 0.6, 2];

type Span = number[];
/** A wall's run along one side of a mass, for its windows. */
type Run = { normal: number[]; fixed: number; from: number; to: number; low: number; high: number };

/** Where [low, high] stands clear of a neighbour's mass: zero, one or two spans. */
function exposed(low: number, high: number, other: Block | null): Span[] {
  if (!other || other.top <= low || other.base >= high) return [[low, high]];
  const spans: Span[] = [];
  if (other.base > low + 1e-4) spans.push([low, other.base]);
  if (other.top < high - 1e-4) spans.push([other.top, high]);
  return spans;
}

const sameSpans = (a: readonly Span[], b: readonly Span[]): boolean =>
  a.length === b.length && a.every((span, k) => span[0] === b[k][0] && span[1] === b[k][1]);

/** Each side of a mass that stands in the open, as quads along the side's squares, joining those exposed alike.
 *  Under a covered mass beside it that starts above its top (a tower's crown) a side rises to meet that mass's
 *  underside, as the classic's wall does. Answers the runs laid, for the windows. */
function sides(add: PartBuilder, look: readonly number[], block: Block, plan: Plan): Run[] {
  const { blockAt, xAt, zAt } = plan;
  const laid: Run[] = [];
  const open = (other: Block | null): Span[] =>
    exposed(block.base, other?.wing.low !== undefined && other.base > block.top ? other.base : block.top, other);
  const runs = [
    {
      normal: [-1, 0, 0],
      fixed: block.x0,
      from: block.row0,
      to: block.row1,
      neighbour: (k: number) => blockAt(block.column0 - 1, k),
      along: zAt,
    },
    {
      normal: [1, 0, 0],
      fixed: block.x1,
      from: block.row0,
      to: block.row1,
      neighbour: (k: number) => blockAt(block.column1, k),
      along: zAt,
    },
    {
      normal: [0, 0, -1],
      fixed: block.z0,
      from: block.column0,
      to: block.column1,
      neighbour: (k: number) => blockAt(k, block.row0 - 1),
      along: xAt,
    },
    {
      normal: [0, 0, 1],
      fixed: block.z1,
      from: block.column0,
      to: block.column1,
      neighbour: (k: number) => blockAt(k, block.row1),
      along: xAt,
    },
  ];
  for (const run of runs) {
    let start = run.from,
      spans = open(run.neighbour(run.from));
    for (let k = run.from + 1; k <= run.to; k++) {
      const next = k < run.to ? open(run.neighbour(k)) : null;
      if (next && sameSpans(next, spans)) continue;
      for (const [low, high] of spans) {
        const [from, to] = [run.along(start), run.along(k)];
        const corners = run.normal[0]
          ? [
              [run.fixed, low, from],
              [run.fixed, low, to],
              [run.fixed, high, to],
              [run.fixed, high, from],
            ]
          : [
              [from, low, run.fixed],
              [to, low, run.fixed],
              [to, high, run.fixed],
              [from, high, run.fixed],
            ];
        add.quad(look, corners, run.normal);
        laid.push({ normal: run.normal, fixed: run.fixed, from, to, low, high });
      }
      start = k;
      if (next) spans = next;
    }
  }
  return laid;
}

/** Whether a window's corners come within a hand of a door's square. */
function near(door: MeasuredDoor, corners: readonly (readonly number[])[]): boolean {
  const doorX = [door.a[0], door.b[0], door.c[0]],
    doorY = [door.a[1], door.b[1], door.c[1]],
    doorZ = [door.a[2], door.b[2], door.c[2]];
  const span = (values: readonly number[], pick: (corner: readonly number[]) => number): number[] => [
    Math.min(...values) - 0.3,
    Math.max(...values) + 0.3,
    Math.min(...corners.map(pick)),
    Math.max(...corners.map(pick)),
  ];
  return [
    span(doorX, (corner) => corner[0]),
    span(doorY, (corner) => corner[1]),
    span(doorZ, (corner) => corner[2]),
  ].every(([low, high, from, to]) => from <= high && to >= low);
}

/** Windows along a wall's run, a storey apart, each its glass's whole picture laid once just off the wall, clear of
 *  the run's ends and of every door. */
function windows(
  add: PartBuilder,
  glass: readonly number[],
  run: Run,
  base: number,
  doors: readonly MeasuredDoor[],
  inside = false,
): void {
  const [side, storey, sill, clear] = WINDOW_M;
  const length = run.to - run.from;
  const count = Math.floor((length - clear * 2 + storey - side) / storey);
  if (count < 1) return;
  const first = run.from + (length - (count - 1) * storey) / 2;
  const off = run.fixed + (run.normal[0] + run.normal[2]) * 0.003;
  for (let level = base + sill; level + side <= run.high - 0.3; level += storey) {
    if (level < run.low) continue;
    for (let k = 0; k < count; k++) {
      const middle = first + k * storey;
      const [left, right] = [middle - side / 2, middle + side / 2];
      const point = (along: number, y: number): number[] => (run.normal[0] ? [off, y, along] : [along, y, off]);
      const corners = [point(left, level), point(right, level), point(right, level + side), point(left, level + side)];
      if (doors.some((door) => near(door, corners))) continue;
      // Upright and unmirrored as one faces the wall: its left is the run's start on a wall facing -x or +z.
      const flip = run.normal[2] < 0 || run.normal[0] > 0;
      if (inside) {
        // The same window seen from the room: on the lining's face, facing in, mirrored so it reads as from outside.
        const back = run.fixed - (run.normal[0] + run.normal[2]) * LINING_FACE_M;
        const within = (along: number, y: number): number[] => (run.normal[0] ? [back, y, along] : [along, y, back]);
        add.quadUv(
          glass,
          [within(right, level), within(left, level), within(left, level + side), within(right, level + side)],
          run.normal.map((value) => -value),
          flip
            ? [
                [0, 1],
                [1, 1],
                [1, 0],
                [0, 0],
              ]
            : [
                [1, 1],
                [0, 1],
                [0, 0],
                [1, 0],
              ],
        );
      }
      add.quadUv(
        glass,
        corners,
        run.normal,
        flip
          ? [
              [1, 1],
              [0, 1],
              [0, 0],
              [1, 0],
            ]
          : [
              [0, 1],
              [1, 1],
              [1, 0],
              [0, 0],
            ],
      );
    }
  }
}

/** A hipped roof over the x and z ranges from `eaves` up `rise`: its ridge along the longer side, its four slopes;
 *  over a square, a pyramid. */
function hip(
  add: PartBuilder,
  look: readonly number[],
  spanX: readonly number[],
  spanZ: readonly number[],
  eaves: number,
  rise: number,
): void {
  const [west, east] = [spanX[0], spanX[1]],
    [south, north] = [spanZ[0], spanZ[1]];
  const long = east - west >= north - south;
  const half = (long ? north - south : east - west) / 2,
    centre = long ? (south + north) / 2 : (west + east) / 2;
  const top = eaves + rise;
  const ridge = long
    ? [
        [west + half, top, centre],
        [east - half, top, centre],
      ]
    : [
        [centre, top, south + half],
        [centre, top, north - half],
      ];
  const inside = [(west + east) / 2, eaves, (south + north) / 2];
  if (Math.abs(east - west - (north - south)) < 1e-3)
    return add.pyramid(look, [west, east], [eaves, top], [south, north]);
  const corner00 = [west, eaves, south],
    corner10 = [east, eaves, south],
    corner11 = [east, eaves, north],
    corner01 = [west, eaves, north];
  if (long) {
    add.facing(look, [corner00, corner10, ridge[1], ridge[0]], inside);
    add.facing(look, [corner11, corner01, ridge[0], ridge[1]], inside);
    add.facing(look, [corner01, corner00, ridge[0]], inside);
    add.facing(look, [corner10, corner11, ridge[1]], inside);
  } else {
    add.facing(look, [corner01, corner00, ridge[0], ridge[1]], inside);
    add.facing(look, [corner10, corner11, ridge[1], ridge[0]], inside);
    add.facing(look, [corner00, corner10, ridge[0]], inside);
    add.facing(look, [corner11, corner01, ridge[1]], inside);
  }
}

/** A chimney on a long pitched roof, by the building's own seed: a stack beside the ridge, a third of the way along,
 *  from the eaves to a little over the ridge, kept in the box. Answers whether it stood one. */
function chimney(
  add: PartBuilder,
  look: readonly number[],
  block: Block,
  rise: number,
  fit: Frame,
  random: { next(): number },
): boolean {
  const along = block.x1 - block.x0 >= block.z1 - block.z0;
  const long = along ? block.x1 - block.x0 : block.z1 - block.z0;
  if (long < CHIMNEY_M[0] || random.next() > CHIMNEY_M[1]) return false;
  const side = CHIMNEY_M[2],
    top = Math.min(fit.y1, block.top + rise + 0.6);
  const place = (along ? block.x0 : block.z0) + long * (random.next() < 0.5 ? 0.3 : 0.7);
  const across = (along ? (block.z0 + block.z1) / 2 : (block.x0 + block.x1) / 2) + side;
  const lengthwise = [place - side / 2, place + side / 2],
    crosswise = [across - side / 2, across + side / 2];
  const [spanX, spanZ] = along ? [lengthwise, crosswise] : [crosswise, lengthwise];
  add.box(look, spanX, [block.top, top], spanZ);
  return true;
}

/** A flat roof's parapet: a low wall inside each edge that stands over open ground or a lower roof. */
function parapet(add: PartBuilder, look: readonly number[], block: Block, blockAt: Plan['blockAt'], fit: Frame): void {
  const [high, thick] = PARAPET_M;
  const top = Math.min(block.top + high, fit.y1);
  if (top - block.top < 0.05) return;
  const edge = (cells: readonly (Block | null)[]): boolean => openBeside(block, cells);
  const columns = Array.from({ length: block.column1 - block.column0 }, (unused, k) => block.column0 + k),
    rows = Array.from({ length: block.row1 - block.row0 }, (unused, k) => block.row0 + k);
  if (edge(columns.map((column) => blockAt(column, block.row0 - 1))))
    add.box(look, [block.x0, block.x1], [block.top, top], [block.z0, block.z0 + thick]);
  if (edge(columns.map((column) => blockAt(column, block.row1))))
    add.box(look, [block.x0, block.x1], [block.top, top], [block.z1 - thick, block.z1]);
  if (edge(rows.map((row) => blockAt(block.column0 - 1, row))))
    add.box(look, [block.x0, block.x0 + thick], [block.top, top], [block.z0, block.z1]);
  if (edge(rows.map((row) => blockAt(block.column1, row))))
    add.box(look, [block.x1 - thick, block.x1], [block.top, top], [block.z0, block.z1]);
}

/** Each model buildingModel built with its doors, to its table and id: withoutDoors builds it again with none. */
const built = new WeakMap<ForgedModel, { table: BuildingTable; id: number }>();

/**
 * The building's model: its plan's masses, each side that stands in the open walled, its pitched wings roofed (the
 * eaves out over the open where the box allows, a soffit under them), its flat ones walled with a parapet, its doors
 * kept. With `doors` false it has none: its faces whole, no door's picture or frame laid. Null for an id the
 * table does not hold.
 */
export function buildingModel(
  table: BuildingTable,
  id: number,
  { doors = true, open = false }: { doors?: boolean; open?: boolean } = {},
): ForgedModel | null {
  const measure: BuildingMeasure | undefined = table[id];
  if (!measure) return null;
  const fit = boxFrame(measure);
  const parts = partBuilder();
  const wall = measure.walls[0] ?? measure.looks[0],
    trim = measure.walls[1] ?? wall,
    roof = measure.roofs[0] ?? trim;
  const plan = planOf(measure);
  const random = randomFromSeed(seedOf(id));
  const gabled = random.next() < 0.5;
  let stacks = 0;
  for (const block of plan.masses) {
    const { wing } = block;
    const span = Math.min(block.x1 - block.x0, block.z1 - block.z0);
    const pitched = roofOf(block, plan, fit, measure.doors ?? []);
    const runs = sides(parts, block.top - block.base < 1.2 ? trim : wall, block, plan);
    if (measure.glass && !wing.steps && !wing.platform && wing.low === undefined && block.top - block.base >= 2.6)
      for (const run of runs) windows(parts, measure.glass, run, block.base, measure.doors ?? [], open);
    if (wing.low !== undefined)
      parts.box(
        trim,
        [block.x0, block.x1],
        [block.base, block.base + 0.001],
        [block.z0, block.z1],
        ['top', '-x', '+x', '-z', '+z'],
      );
    if (!pitched) {
      parts.box(
        wing.steps || wing.platform ? trim : roof,
        [block.x0, block.x1],
        [block.top - 0.001, block.top],
        [block.z0, block.z1],
        ['bottom', '-x', '+x', '-z', '+z'],
      );
      if (!wing.steps && !wing.platform && block.top - fit.y0 > 2.5 && span >= 1.2)
        parapet(parts, trim, block, plan.blockAt, fit);
      continue;
    }
    const { west, east, south, north, rise } = pitched;
    if (gabled)
      parts.gable(
        roof,
        [west, east],
        [block.top, block.top + rise],
        [south, north],
        east - west >= north - south ? 'x' : 'z',
        wall,
      );
    else hip(parts, roof, [west, east], [south, north], block.top, rise);
    if (stacks < CHIMNEY_M[3] && chimney(parts, trim, block, rise, fit, random)) stacks++;
    // The soffits under the eaves, round the walls.
    for (const [from, to] of [
      [
        [west, south],
        [block.x0, north],
      ],
      [
        [block.x1, south],
        [east, north],
      ],
      [
        [block.x0, south],
        [block.x1, block.z0],
      ],
      [
        [block.x0, block.z1],
        [block.x1, north],
      ],
    ])
      if (to[0] - from[0] > 1e-3 && to[1] - from[1] > 1e-3)
        parts.quad(
          trim,
          [
            [from[0], block.top, from[1]],
            [from[0], block.top, to[1]],
            [to[0], block.top, to[1]],
            [to[0], block.top, from[1]],
          ],
          [0, -1, 0],
        );
  }
  if (!doors) return { ...parts.model(), doors: [] };
  // An open building's doorways are cut and framed with no door in them: a body walks straight in.
  const model = withDoors(parts.model(), measure, fit, trim, { picture: !open });
  built.set(model, { table, id });
  return model;
}

/** A model buildingModel built, built again with no door (a town wall's length or gate that opens into no
 *  interior), or null for a model it did not build. */
export function withoutDoors(model: ForgedModel): ForgedModel | null {
  const source = built.get(model);
  return source ? buildingModel(source.table, source.id, { doors: false }) : null;
}
