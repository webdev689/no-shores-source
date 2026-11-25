// An open building's rooms are lined just inside its walls (the layout crate's interiors.rs). Where its model's
// windows go through a wall (buildings.ts openingsOf), the lining is cut away round each, so the window is seen
// through from the room and into it.
import { openingsOf, WINDOW_SIDE_M, type Opening } from '../models/buildings.ts';
import type { BuildingTable } from '../models/tables.ts';
import type { Piece, Solid } from './plan.ts';

/** How deep behind a wall's outer face its room's lining is cut, metres: past interiors.rs INSET_M + LINING_M. */
const LINING_DEPTH_M = 0.3;

/** West, north, east, south, bottom, top. */
type Box = [number, number, number, number, number, number];
/** A window's opening in the world: its box through the wall, and the axis (east 0, south 1) its wall runs along. */
type Hole = { readonly box: Box; readonly along: 0 | 1 };

/** The solids with every open building's lining cut round its windows; the rest as they are. */
export function cutAtWindows(solids: readonly Solid[], pieces: readonly Piece[], buildings: BuildingTable): Solid[] {
  const openings = new Map<number, Opening[]>();
  const holes = pieces
    .filter((piece) => piece.open && piece.building && buildings[piece.model]?.glass)
    .flatMap((piece) => {
      const known = openings.get(piece.model) ?? openingsOf(buildings[piece.model]);
      openings.set(piece.model, known);
      return known.map((opening) => holeOf(piece, opening));
    });
  if (!holes.length) return [...solids];
  return solids.flatMap((solid) =>
    lining(solid) ? holes.reduce((kept, hole) => kept.flatMap((each) => cut(each, hole)), [solid]) : [solid],
  );
}

/** Whether a solid is a room's lining: an upright block of plaster, square to the world. */
const lining = (solid: Solid): boolean =>
  solid.shape === 'block' && solid.material === 'plaster' && !solid.turn && !solid.lean && !solid.roll;

/** A window's opening in the world, through its wall from the outer face to past the lining, its building turned a
 *  whole quarter at a time as interiors.rs turns its rooms. */
export function holeOf(piece: Piece, { normal, fixed, middle, level }: Opening): Hole {
  const quarter = (((Math.round(piece.yaw / 90) % 4) + 4) % 4) as 0 | 1 | 2 | 3;
  const [cosine, sine] = (
    [
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, -1],
    ] as const
  )[quarter];
  const world = (x: number, z: number): [number, number] => [
    piece.at[0] + x * cosine + z * sine,
    piece.at[1] + x * sine - z * cosine,
  ];
  const [deep, side] = [
    fixed - (normal[0] + normal[2]) * LINING_DEPTH_M,
    [middle - WINDOW_SIDE_M / 2, middle + WINDOW_SIDE_M / 2],
  ];
  const corners = [fixed, deep].flatMap((across) =>
    side.map((along) => (normal[0] ? world(across, along) : world(along, across))),
  );
  const [easts, souths] = [corners.map((corner) => corner[0]), corners.map((corner) => corner[1])];
  const bottom = piece.at[2] + level;
  const box: Box = [
    Math.min(...easts),
    Math.min(...souths),
    Math.max(...easts),
    Math.max(...souths),
    bottom,
    bottom + WINDOW_SIDE_M,
  ];
  const eastward = normal[0] ? cosine : sine;
  return { box, along: Math.abs(eastward) > 0.5 ? 1 : 0 };
}

/** A solid with a hole's box cut out of it, the whole of its depth: up to four pieces round the hole. */
export function cut(solid: Solid, { box: hole, along }: Hole): Solid[] {
  const [half0, half1] = [solid.size[0] / 2, solid.size[1] / 2];
  const box: Box = [
    solid.at[0] - half0,
    solid.at[1] - half1,
    solid.at[0] + half0,
    solid.at[1] + half1,
    solid.at[2],
    solid.at[2] + solid.size[2],
  ];
  const overlaps = (from: number, to: number) => box[from] < hole[to] && hole[from] < box[to];
  if (!(overlaps(0, 2) && overlaps(1, 3) && overlaps(4, 5))) return [solid];
  const [start, end] = along === 0 ? [0, 2] : [1, 3];
  const [low, high] = [Math.max(box[4], hole[4]), Math.min(box[5], hole[5])];
  const changed = (changes: Readonly<Record<number, number>>): Box =>
    box.map((value, axis) => changes[axis] ?? value) as Box;
  const pieces = [
    changed({ 5: hole[4] }),
    changed({ 4: hole[5] }),
    changed({ 4: low, 5: high, [end]: hole[start] }),
    changed({ 4: low, 5: high, [start]: hole[end] }),
  ];
  return pieces
    .filter((each) => each[2] - each[0] > 1e-3 && each[3] - each[1] > 1e-3 && each[5] - each[4] > 1e-3)
    .map((each) => ({
      ...solid,
      at: [(each[0] + each[2]) / 2, (each[1] + each[3]) / 2, each[4]],
      size: [each[2] - each[0], each[3] - each[1], each[5] - each[4]],
    }));
}
