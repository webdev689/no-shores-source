// An open building's rooms are lined just inside its walls (the layout crate's interiors.rs). Where its model's
// windows go through a wall (buildings.ts openingsOf), the lining is cut away round each, so the window is seen
// through from the room and into it.
import { openingsOf, type Opening, type WindowFrameOf } from '../models/buildings.ts';
import type { BuildingTable } from '../models/tables.ts';
import type { Piece, Solid } from './plan.ts';

/** How deep behind a wall's outer face its room's lining is cut, metres: past interiors.rs INSET_M + LINING_M. */
const LINING_DEPTH_M = 0.3;

/** West, north, east, south, bottom, top. */
type Box = [number, number, number, number, number, number];
/** A window's opening in the world: its box through the wall, and the axis (east 0, south 1) its wall runs along. */
type Hole = { readonly box: Box; readonly along: 0 | 1 };

/** The solids with every open building's lining cut round its windows; the rest as they are. */
export function cutAtWindows(
  solids: readonly Solid[],
  pieces: readonly Piece[],
  buildings: BuildingTable,
  frameOf?: WindowFrameOf,
): Solid[] {
  const openings = new Map<number, Opening[]>();
  // Each open building's holes, and the box round them all: a lining is cut only by the building it stands in.
  const windowed = pieces
    .filter((piece) => piece.open && piece.building && buildings[piece.model]?.glass)
    .map((piece) => {
      const known = openings.get(piece.model) ?? openingsOf(buildings, piece.model, frameOf);
      openings.set(piece.model, known);
      const holes = known.map((opening) => holeOf(piece, opening));
      const round = holes.reduce<Box>(
        (box, { box: hole }) => [
          Math.min(box[0], hole[0]),
          Math.min(box[1], hole[1]),
          Math.max(box[2], hole[2]),
          Math.max(box[3], hole[3]),
          Math.min(box[4], hole[4]),
          Math.max(box[5], hole[5]),
        ],
        [Infinity, Infinity, -Infinity, -Infinity, Infinity, -Infinity],
      );
      return { holes, round };
    });
  return solids.flatMap((solid) => {
    if (!lining(solid)) return [solid];
    const box = boxOf(solid);
    const near = windowed.filter(({ round }) => overlap(box, round));
    return near.flatMap(({ holes }) => holes).reduce((kept, hole) => kept.flatMap((each) => cut(each, hole)), [solid]);
  });
}

/** A solid's box square to the world, as it stands unturned. */
const boxOf = (solid: Solid): Box => [
  solid.at[0] - solid.size[0] / 2,
  solid.at[1] - solid.size[1] / 2,
  solid.at[0] + solid.size[0] / 2,
  solid.at[1] + solid.size[1] / 2,
  solid.at[2],
  solid.at[2] + solid.size[2],
];

/** Whether two boxes share some volume. */
const overlap = (a: Box, b: Box): boolean =>
  a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3] && a[4] < b[5] && b[4] < a[5];

/** Whether a solid is a room's lining: an upright block of plaster, square to the world. */
const lining = (solid: Solid): boolean =>
  solid.shape === 'block' && solid.material === 'plaster' && !solid.turn && !solid.lean && !solid.roll;

/** A window's opening in the world, through its wall from the outer face to past the lining, its building turned a
 *  whole quarter at a time as interiors.rs turns its rooms. */
export function holeOf(piece: Piece, { normal, fixed, middle, level, width, height }: Opening): Hole {
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
  const [deep, side] = [fixed - (normal[0] + normal[2]) * LINING_DEPTH_M, [middle - width / 2, middle + width / 2]];
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
    bottom + height,
  ];
  const eastward = normal[0] ? cosine : sine;
  return { box, along: Math.abs(eastward) > 0.5 ? 1 : 0 };
}

/** A solid with a hole's box cut out of it, the whole of its depth: up to four pieces round the hole. */
export function cut(solid: Solid, { box: hole, along }: Hole): Solid[] {
  const box = boxOf(solid);
  if (!overlap(box, hole)) return [solid];
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
