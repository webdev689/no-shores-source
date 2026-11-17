// The Room Kit: the floors, walls, ceilings, posts, stairs and room cells a town's interiors are put together from.
// A room's kit is flat faces whose places are the room, so each face is laid where its plan stands it, its picture
// anchored at its own corner, with a skirting where a wall meets a floor, a cornice where it meets a ceiling, and a
// frame round each door.
import type { ForgedModel } from './model.ts';
import type { KitMeasure, KitTable, MeasuredDoor } from './tables.ts';
import { boxFrame } from './frame.ts';
import { TEXELS_PER_METRE, partBuilder } from './parts.ts';
import { withDoors } from './doors.ts';
import { dot } from './vector.ts';

/** The skirting's height and how far it stands off its wall (m). */
export const SKIRTING_M = [0.12, 0.02];
/** The cornice's height and how far it stands off its wall (m). */
const CORNICE_M = [0.1, 0.03];
/** A wall short of this (m) is a step's riser or a sill, and takes no skirting or cornice. */
const TRIM_WALL_M = 1.5;
/** How near a wall's foot or head must come to a floor's or a ceiling's height to meet it (m). */
const MEET_M = 0.05;

/** Each side's outward normal: -x, +x, -y, +y, -z, +z. */
const NORMALS = [
  [-1, 0, 0],
  [1, 0, 0],
  [0, -1, 0],
  [0, 1, 0],
  [0, 0, -1],
  [0, 0, 1],
];

/** A face's four corners round its edge: on `side`'s plane at `plane`, spanning its other two axes in order. */
function cornersOf(
  side: number,
  plane: number,
  acrossFrom: number,
  alongFrom: number,
  acrossTo: number,
  alongTo: number,
): number[][] {
  const axis = side >> 1;
  const [acrossAxis, alongAxis] = [0, 1, 2].filter((other) => other !== axis);
  const pointAt = (across: number, along: number): number[] => {
    const corner = [0, 0, 0];
    corner[axis] = plane;
    corner[acrossAxis] = across;
    corner[alongAxis] = along;
    return corner;
  };
  return [
    pointAt(acrossFrom, alongFrom),
    pointAt(acrossTo, alongFrom),
    pointAt(acrossTo, alongTo),
    pointAt(acrossFrom, alongTo),
  ];
}

/** The picture's place at each corner: a wall's laid from its top left as one faces it, a floor's or a ceiling's
 *  from its corner along x and z, at TEXELS_PER_METRE; or once over a door's face. */
function mappingOf(side: number, corners: readonly number[][], picture: readonly number[], once: boolean): number[][] {
  const [, , wide, tall] = picture;
  const normal = NORMALS[side];
  const level = side >> 1 === 1;
  // As one faces a wall, its right is up crossed with its normal: (normal z, 0, -normal x).
  const across = level ? [1, 0, 0] : [normal[2], 0, -normal[0]];
  const down = level ? [0, 0, 1] : [0, -1, 0];
  const acrossAt = corners.map((corner) => dot(corner, across)),
    downAt = corners.map((corner) => dot(corner, down));
  const [acrossLow, acrossHigh, downLow, downHigh] = [
    Math.min(...acrossAt),
    Math.max(...acrossAt),
    Math.min(...downAt),
    Math.max(...downAt),
  ];
  return corners.map((unused, k) =>
    once
      ? [(acrossAt[k] - acrossLow) / (acrossHigh - acrossLow || 1), (downAt[k] - downLow) / (downHigh - downLow || 1)]
      : [((acrossAt[k] - acrossLow) * TEXELS_PER_METRE) / wide, ((downAt[k] - downLow) * TEXELS_PER_METRE) / tall],
  );
}

/** Whether a wall's face lies on one of the piece's doors: in its plane and within its square. */
function onDoor(corners: readonly number[][], doors: readonly MeasuredDoor[]): boolean {
  return doors.some((door) => {
    const points = [door.a, door.b, door.c];
    return [0, 1, 2].every((axis) => {
      const low = Math.min(...points.map((point) => point[axis])) - 0.02,
        high = Math.max(...points.map((point) => point[axis])) + 0.02;
      return corners.every((corner) => corner[axis] >= low && corner[axis] <= high);
    });
  });
}

/**
 * The piece's model: its plan's faces in their pictures, a skirting and a cornice along each wall that meets a floor
 * or a ceiling, a frame round each door where its box leaves room, its doors kept. Null for an id the table does
 * not hold.
 */
export function kitModel(table: KitTable, id: number): ForgedModel | null {
  const measure: KitMeasure | undefined = table[id];
  if (!measure) return null;
  const fit = boxFrame(measure);
  const parts = partBuilder();
  const doors = measure.doors ?? [];
  const floors = measure.faces.filter((face) => face[0] === 3).map((face) => face[1]),
    ceilings = measure.faces.filter((face) => face[0] === 2).map((face) => face[1]);
  const most = (side: number): readonly number[] | null => {
    const area = new Map<number, number>();
    for (const [face, , acrossFrom, alongFrom, acrossTo, alongTo, picture] of measure.faces)
      if (face === side) area.set(picture, (area.get(picture) ?? 0) + (acrossTo - acrossFrom) * (alongTo - alongFrom));
    const best = [...area].sort((a, b) => b[1] - a[1])[0];
    return best ? measure.pictures[best[0]] : null;
  };
  const floorLook = most(3),
    ceilingLook = most(2);
  for (const [side, plane, acrossFrom, alongFrom, acrossTo, alongTo, pictureAt] of measure.faces) {
    const corners = cornersOf(side, plane, acrossFrom, alongFrom, acrossTo, alongTo);
    const picture = measure.pictures[pictureAt];
    const door = side >> 1 !== 1 && onDoor(corners, doors);
    parts.quadUv(picture, corners, NORMALS[side], mappingOf(side, corners, picture, door));
    if (side >> 1 === 1 || door) continue;
    const normal = NORMALS[side];
    const heights = corners.map((corner) => corner[1]);
    const [foot, head] = [Math.min(...heights), Math.max(...heights)];
    if (head - foot < TRIM_WALL_M) continue;
    // A strip is its face off the wall and its lip (a skirting's top, a cornice's underside), the two a room sees,
    // kept in the box.
    const strip = (look: readonly number[], low: number, high: number, out: number, lip: number): void => {
      const moved = corners.map((corner) => corner.map((value, axis) => value + normal[axis] * out));
      const spanX = [...corners, ...moved].map((corner) => corner[0]),
        spanZ = [...corners, ...moved].map((corner) => corner[2]);
      const inBox =
        Math.min(...spanX) >= fit.x0 - 0.011 &&
        Math.max(...spanX) <= fit.x1 + 0.011 &&
        Math.min(...spanZ) >= fit.z0 - 0.011 &&
        Math.max(...spanZ) <= fit.z1 + 0.011;
      if (!inBox) return;
      const ends = moved.filter((corner) => Math.abs(corner[1] - foot) < 1e-6);
      const along = (corner: readonly number[], y: number): number[] => [corner[0], y, corner[2]];
      parts.quad(look, [along(ends[0], low), along(ends[1], low), along(ends[1], high), along(ends[0], high)], normal);
      const back = ends.map((corner) => corner.map((value, axis) => value - normal[axis] * out));
      parts.quad(
        look,
        [along(ends[0], lip), along(ends[1], lip), along(back[1], lip), along(back[0], lip)],
        [0, lip === high ? 1 : -1, 0],
      );
    };
    const meets = (levels: readonly number[], y: number): boolean =>
      levels.some((level) => Math.abs(level - y) < MEET_M);
    if (floorLook && meets(floors, foot))
      strip(floorLook, foot, foot + SKIRTING_M[0], SKIRTING_M[1], foot + SKIRTING_M[0]);
    if (ceilingLook && meets(ceilings, head))
      strip(ceilingLook, head - CORNICE_M[0], head, CORNICE_M[1], head - CORNICE_M[0]);
  }
  for (const [pictureAt, ...flat] of measure.sloped ?? [])
    parts.tri(measure.pictures[pictureAt], [flat.slice(0, 3), flat.slice(3, 6), flat.slice(6, 9)]);
  const wall = most(0) ?? most(1) ?? most(4) ?? most(5) ?? measure.pictures[0];
  return withDoors(parts.model(), { ...measure, looks: [wall] }, fit, wall, { cut: false, picture: false });
}
