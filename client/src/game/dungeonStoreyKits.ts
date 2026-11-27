// The kit pieces that join a dungeon's storeys, laid from its layout as the other kit pieces are: each style's
// `stair.head`, an arch over a flight's head and its foot on their landings' side, as the portal's arch is over the
// portal; its `stair.side`, a course along each side wall of each of a flight's cells, sheared to the flight's slope;
// and its `balustrade` along each gallery edge over open air. Each from the pack of the style of the cell it stands
// in; where a pack lacks the piece the mesh draws its own (`dungeonFlights.ts`, `dungeonJoins.ts`).
import type { KitPlacement } from './dungeonKits.ts';
import { flightFrame, flightSlope } from './dungeonFlights.ts';
import {
  type DungeonLayout,
  floorOf,
  ROCK,
  SIDE_STEPS,
  STAIR,
  storeysOf,
  styleAt,
  type StyleKey,
  VOID,
} from './dungeonLayout.ts';
import { type ModulePack, type Place, turnAbout, wallTurns } from './dungeonModules.ts';

/** The joining pieces laid, and what the mesh draws in their stead: the arches (`stair * 2`, `+ 1` at the foot), the
 *  flights coursed, and the galleries' edges railed (`cell * 4 + side`). */
export interface StoreyKits {
  readonly placed: readonly KitPlacement[];
  readonly arches: ReadonlySet<number>;
  readonly courses: ReadonlySet<number>;
  readonly rails: ReadonlySet<number>;
}

/** Every joining piece of a layout, with points and cells in the whole layout's frame. */
export function storeyKits(layout: DungeonLayout, packs: ReadonlyMap<StyleKey, ModulePack>): StoreyKits {
  const { columns, rows, cell: size } = layout;
  const plane = columns * rows;
  const placed: KitPlacement[] = [];
  // A pack names each piece by its style: `crypt.stair.head`.
  const nameOf = (cell: number, piece: string) => {
    const style = styleAt(layout, cell);
    return style && packs.get(style)?.modules.has(`${style}.${piece}`) ? `${style}.${piece}` : null;
  };
  const has = (cell: number, piece: string) => nameOf(cell, piece) !== null;
  // The middle of a plane cell's edge on `side`, and the side of `from` that `to` lies on.
  const edge = (cell: number, side: number) => {
    const [east, south] = SIDE_STEPS[side] ?? [0, 0];
    return [((cell % columns) + 0.5 + east / 2) * size, (Math.floor(cell / columns) + 0.5 + south / 2) * size] as const;
  };
  const sideTo = (from: number, to: number) =>
    SIDE_STEPS.findIndex(([east, south]) => from + east + south * columns === to);
  const lay = (piece: string, cell: number, place: Place) => {
    const module = nameOf(cell, piece);
    if (module) placed.push({ module, place, cell });
  };
  const arches = new Set<number>();
  const courses = new Set<number>();
  (layout.stairs ?? []).forEach((stair, number) => {
    const ends = [
      { storey: stair.upper, landing: stair.top, to: stair.cells[0] ?? 0 },
      { storey: stair.upper + 1, landing: stair.bottom, to: stair.cells[stair.cells.length - 1] ?? 0 },
    ];
    ends.forEach(({ storey, landing, to }, end) => {
      const cell = storey * plane + landing;
      const side = sideTo(landing, to);
      if (!has(cell, 'stair.head') || side < 0) return;
      lay('stair.head', cell, { origin: [...edge(landing, side), floorOf(layout, storey)], turns: wallTurns(side) });
      arches.add(number * 2 + end);
    });
    const frame = flightFrame(layout, stair);
    const fall = (frame.upper - frame.lower) / frame.length;
    const cells = stair.cells.map((each) => stair.upper * plane + each);
    if (!cells.every((each) => has(each, 'stair.side'))) return;
    stair.cells.forEach((each, index) => {
      const middle = flightSlope(frame, (index + 0.5) * size);
      for (const side of SIDE_STEPS.keys()) {
        const [east, south] = SIDE_STEPS[side] ?? [0, 0];
        // Only the walls along the flight, across its way down.
        if (east * frame.down[0] + south * frame.down[1] !== 0) continue;
        const turns = wallTurns(side);
        const [alongX, alongY] = turnAbout([1, 0, 0], turns);
        const slope = -fall * (alongX * frame.down[0] + alongY * frame.down[1]);
        lay('stair.side', cells[index] ?? 0, { origin: [...edge(each, side), middle], turns, slope });
      }
    });
    courses.add(number);
  });
  const rails = new Set<number>();
  for (let storey = 0; storey + 1 < storeysOf(layout); storey++)
    for (let air = 0; air < plane; air++) {
      const hall = layout.cells[(storey + 1) * plane + air] ?? ROCK;
      if (layout.cells[storey * plane + air] !== VOID || hall === ROCK || hall === STAIR || hall === VOID) continue;
      SIDE_STEPS.forEach(([east, south], side) => {
        const [column, row] = [(air % columns) + east, Math.floor(air / columns) + south];
        if (column < 0 || row < 0 || column >= columns || row >= rows) return;
        const gallery = row * columns + column;
        const kind = layout.cells[storey * plane + gallery] ?? ROCK;
        const cell = storey * plane + gallery;
        const toAir = (side + 2) % 4;
        if (kind === ROCK || kind === STAIR || kind === VOID || !has(cell, 'balustrade')) return;
        lay('balustrade', cell, {
          origin: [...edge(gallery, toAir), floorOf(layout, storey)],
          turns: wallTurns(toAir),
        });
        rails.add(cell * 4 + toAir);
      });
    }
  return { placed, arches, courses, rails };
}
