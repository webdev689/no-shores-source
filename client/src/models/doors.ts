// A piece's doors: kept as measured, so the world's door lookups read them as the classic's. The piece's own faces
// are cut clear of each door's passage (the space before it, a hand past its edges), and the door's picture and
// frame are laid. The frame runs back into the piece and forward through the cut, so a door set deep in a rock or
// a tent opens on a clean way in.
import type { ForgedModel, ModelDoor, ModelPart, Point } from './model.ts';
import type { MeasuredDoor } from './tables.ts';
import { doorAxes, inFrame, room, type DoorCorners, type Frame } from './frame.ts';
import { partBuilder, type PartBuilder } from './parts.ts';
import { cross, dot, minus, type Vector } from './vector.ts';

/** How wide a door's frame stands round it (m): the cut a passage makes lies inside it. */
export const DOOR_FRAME_M = 0.12;
/** How far past a door's edges its passage is cut (m), and how far before it the cut may run. */
const DOOR_CLEAR_M = 0.06;
const DOOR_REACH_M = 4;
/** A floor this far over a door's sill (m) is what the door opens onto, and is kept whole. */
const DOOR_FLOOR_M = 0.5;
/** A face this far before a door (m) that looks back at it is what the door opens onto, and is kept whole. */
const DOOR_ACROSS_M = 2;
/** How far a frame stands proud of its door at the least, and how far back into the piece it runs (m). */
const DOOR_PROUD_M = 0.04,
  DOOR_DEPTH_M = 0.5;
/** How far a door's picture stands off its face (m), clear of a wall in the same plane. */
const DOOR_OFF_M = 0.004;
/** How far either side of its own face an open doorway's passage is cut (m): through the wall it stands in, whose
 *  face lies in the door's plane or a little before it where the door is set back, and no further, since a measured
 *  door's normal may point in or out. */
const DOOR_THROUGH_M = 0.5;

/** What a piece's doors are cut, pictured and framed from. */
export type DoorMeasure = {
  readonly doors?: readonly MeasuredDoor[];
  readonly doorLook?: readonly number[] | null;
  readonly looks: readonly (readonly number[])[];
};

/** A corner of a face being cut: its point, normal and picture place. */
export type CutVertex = { p: Vector; n: Vector; uv: Vector };

/** A door's passage: the planes (within where dot(n, p) < d on all) of the space before it, from just off its face
 *  out to DOOR_REACH_M, DOOR_CLEAR_M past its jambs and head, and from just over its sill. */
export type Passage = { planes: { n: Vector; d: number }[]; n: Vector; face: number; sill: number };

const point = (measured: readonly number[]): Point => [measured[0], measured[1], measured[2]];

/** The piece's doors as a model gives them: the table's, as measured, each its classic index (its place in the
 *  list, unless the table names another). */
export const doorsOf = (measure: { readonly doors?: readonly MeasuredDoor[] }): ModelDoor[] =>
  (measure.doors ?? []).map((door, place) => ({
    index: door.index ?? place,
    type: door.type,
    corners: [point(door.a), point(door.b), point(door.c)],
    normal: point(door.n),
  }));

export function passageOf(door: DoorCorners, through = false): Passage {
  const { corners, centre, n, across, up } = doorAxes(door);
  const span = (axis: Vector): number[] => corners.map((corner) => dot(corner, axis));
  const face = dot(n, centre);
  // A pictured door leaves its own face whole for the picture to lie on; an open one is cut through it.
  const planes = through
    ? [
        { n: n.map((value) => -value), d: -(face - DOOR_THROUGH_M) },
        { n, d: face + DOOR_THROUGH_M },
      ]
    : [
        { n: n.map((value) => -value), d: -(face + 0.005) },
        { n, d: face + DOOR_REACH_M },
      ];
  // Past the jambs and the head by a hand; above the sill only, so a floor level with it stays whole.
  planes.push({ n: across, d: Math.max(...span(across)) + DOOR_CLEAR_M });
  planes.push({ n: across.map((value) => -value), d: -(Math.min(...span(across)) - DOOR_CLEAR_M) });
  planes.push({ n: up, d: Math.max(...span(up)) + DOOR_CLEAR_M });
  planes.push({ n: up.map((value) => -value), d: -(Math.min(...span(up)) + 0.005) });
  const sill = Math.min(...corners.map((corner) => corner[1]));
  return { planes, n, face, sill };
}

/** A vertex between two, `share` of the way. */
const between = (a: CutVertex, b: CutVertex, share: number): CutVertex => ({
  p: a.p.map((value, i) => value + (b.p[i] - value) * share),
  n: a.n.map((value, i) => value + (b.n[i] - value) * share),
  uv: a.uv.map((value, i) => value + (b.uv[i] - value) * share),
});

/** A polygon split by a plane: its part where dot(n, p) >= d, and its part where it is less. */
function split(poly: readonly CutVertex[], plane: { n: Vector; d: number }): [CutVertex[], CutVertex[]] {
  const out: CutVertex[] = [],
    inside: CutVertex[] = [];
  for (let k = 0; k < poly.length; k++) {
    const a = poly[k],
      b = poly[(k + 1) % poly.length];
    const fromA = dot(plane.n, a.p) - plane.d,
      fromB = dot(plane.n, b.p) - plane.d;
    (fromA >= 0 ? out : inside).push(a);
    if (fromA >= 0 !== fromB >= 0) {
      const cut = between(a, b, fromA / (fromA - fromB));
      out.push(cut);
      inside.push(cut);
    }
  }
  return [out, inside];
}

/** A polygon less a passage: the pieces of it outside, and the part cut away (null if none). A polygon wholly
 *  outside one of the passage's planes is kept whole, and so is one DOOR_ACROSS_M or more out that looks back at the
 *  door (the far side of a passage with a door at each end), or a floor up to DOOR_FLOOR_M over its sill. */
export function carve(poly: CutVertex[], passage: Passage): { kept: CutVertex[][]; cut: CutVertex[] | null } {
  const ahead = Math.min(...poly.map((vertex) => dot(vertex.p, passage.n) - passage.face));
  if (dot(poly[0].n, passage.n) < -0.5 && ahead >= DOOR_ACROSS_M) return { kept: [poly], cut: null };
  if (poly[0].n[1] > 0.9 && Math.max(...poly.map((vertex) => vertex.p[1])) <= passage.sill + DOOR_FLOOR_M)
    return { kept: [poly], cut: null };
  if (passage.planes.some((plane) => poly.every((vertex) => dot(plane.n, vertex.p) >= plane.d)))
    return { kept: [poly], cut: null };
  const kept: CutVertex[][] = [];
  let rest = poly;
  for (const plane of passage.planes) {
    const [out, inside] = split(rest, plane);
    if (out.length >= 3) kept.push(out);
    if (inside.length < 3) return { kept, cut: null };
    rest = inside;
  }
  return { kept, cut: rest };
}

/** One door's picture, laid once over its face, upright as one faces it, and its frame: two jambs, a lintel and a
 *  sill, back into the piece and forward to stand proud of it. Where the cut ran through the piece's own faces each
 *  side of the frame runs on as far as the cut beside it, lining the way in. A part that would leave the piece's box
 *  is left out (a sill under the floor). */
function dressDoor(
  parts: PartBuilder,
  door: DoorCorners,
  fit: Frame,
  face: readonly number[] | null,
  side: readonly number[],
  cut: readonly Vector[],
): void {
  const { corners, centre, n, across, up } = doorAxes(door);
  const wide = corners.map((corner) => dot(corner, across)),
    tall = corners.map((corner) => dot(corner, up));
  const [left, right, low, high] = [Math.min(...wide), Math.max(...wide), Math.min(...tall), Math.max(...tall)];
  const plane = dot(n, centre);
  const pointAt = (sideways: number, upward: number, forward: number): Vector =>
    [0, 1, 2].map((axis) => across[axis] * sideways + up[axis] * upward + n[axis] * (plane + forward));
  // The picture over the door's square in its own axes, so a door measured a little askew is covered to its frame.
  if (face)
    parts.quadUv(
      face,
      [
        pointAt(left, low, DOOR_OFF_M),
        pointAt(right, low, DOOR_OFF_M),
        pointAt(right, high, DOOR_OFF_M),
        pointAt(left, high, DOOR_OFF_M),
      ],
      n,
      [
        [0, 1],
        [1, 1],
        [1, 0],
        [0, 0],
      ],
    );
  // Back into the piece level with the ground, so a door that leans back at the floor still has a frame behind it.
  const level =
    Math.hypot(n[0], n[2]) > 0.3
      ? [-n[0], 0, -n[2]].map((value) => value / Math.hypot(n[0], n[2]))
      : n.map((value) => -value);
  /** How far forward the cut ran beside the door where `beside` holds: the frame on that side runs as far. */
  const reach = (beside: (corner: Vector) => boolean): number =>
    Math.max(DOOR_PROUD_M, ...cut.filter(beside).map((corner) => dot(n, corner) - plane + 0.02));
  const rim = DOOR_FRAME_M;
  /** A slab across `sideways` and up `rising`, its front as far forward as `forward` and the box allow, back into
   *  the piece. */
  const slab = (sideways: readonly number[], rising: readonly number[], forward: number): void => {
    const [sideFrom, sideTo] = sideways,
      [riseFrom, riseTo] = rising;
    const front = [
      pointAt(sideFrom, riseFrom, 0),
      pointAt(sideTo, riseFrom, 0),
      pointAt(sideTo, riseTo, 0),
      pointAt(sideFrom, riseTo, 0),
    ];
    const proud = Math.max(0.006, Math.min(forward, ...front.map((corner) => room(corner, n, fit) - 0.002)));
    const depth = Math.max(0.02, Math.min(DOOR_DEPTH_M, ...front.map((corner) => room(corner, level, fit))));
    const origin = pointAt(sideFrom, riseFrom, proud),
      acrossSlab = minus(pointAt(sideTo, riseFrom, proud), origin),
      upSlab = minus(pointAt(sideFrom, riseTo, proud), origin);
    const w = [0, 1, 2].map((axis) => -n[axis] * proud + level[axis] * depth);
    const eight = [0, 1].flatMap((i) =>
      [0, 1].flatMap((j) =>
        [0, 1].map((k) =>
          [0, 1, 2].map((axis) => origin[axis] + acrossSlab[axis] * i + upSlab[axis] * j + w[axis] * k),
        ),
      ),
    );
    if (!eight.every((corner) => inFrame(corner, fit))) return;
    parts.block(side, origin, acrossSlab, upSlab, w);
  };
  slab(
    [left - rim, left],
    [low, high],
    reach((corner) => dot(across, corner) <= left + 0.001),
  );
  slab(
    [right, right + rim],
    [low, high],
    reach((corner) => dot(across, corner) >= right - 0.001),
  );
  slab(
    [left - rim, right + rim],
    [high, high + rim],
    reach((corner) => dot(up, corner) >= high - 0.001),
  );
  slab(
    [left - rim, right + rim],
    [low - rim, low],
    reach((corner) => dot(up, corner) <= low + 0.001),
  );
}

/**
 * The model with its doors: its faces cut clear of each door's passage, each door's picture and frame laid, the
 * frames in `frameLook`, and the doors as measured. A room's kit, whose doors stand in its own faces already, asks
 * for neither cut nor picture: its doors are framed only. A model with no doors is itself.
 */
export function withDoors(
  model: ForgedModel,
  measure: DoorMeasure,
  fit: Frame,
  frameLook: readonly number[] = measure.looks[0],
  { cut = true, picture = true }: { cut?: boolean; picture?: boolean } = {},
): ForgedModel {
  const doors = measure.doors ?? [];
  if (!doors.length) return model;
  // A cut door with no picture is a doorway walked through: cut through its own wall.
  const passages = cut ? doors.map((door) => passageOf(door, !picture)) : [],
    cuts: Vector[][] = doors.map(() => []);
  const vertex = (i: number): CutVertex => ({
    p: [model.positions[i * 3], model.positions[i * 3 + 1], model.positions[i * 3 + 2]],
    n: [model.normals[i * 3], model.normals[i * 3 + 1], model.normals[i * 3 + 2]],
    uv: [model.uvs[i * 2], model.uvs[i * 2 + 1]],
  });
  const positions: number[] = [],
    normals: number[] = [],
    uvs: number[] = [],
    indices: number[] = [],
    parts: ModelPart[] = [];
  // A polygon laid as a fan, each sliver a cut left at an edge left out.
  const lay = (poly: readonly CutVertex[]): void => {
    const base = positions.length / 3;
    for (const corner of poly) {
      positions.push(...corner.p);
      normals.push(...corner.n);
      uvs.push(...corner.uv);
    }
    for (let k = 1; k < poly.length - 1; k++)
      if (Math.hypot(...cross(minus(poly[k].p, poly[0].p), minus(poly[k + 1].p, poly[0].p))) > 1e-6)
        indices.push(base, base + k, base + k + 1);
  };
  for (const part of model.parts) {
    const start = indices.length;
    for (let tri = 0; tri < part.count / 3; tri++) {
      let pieces = [[0, 1, 2].map((k) => vertex(model.indices[part.start + tri * 3 + k]))];
      passages.forEach((passage, index) => {
        pieces = pieces.flatMap((poly) => {
          const carved = carve(poly, passage);
          if (carved.cut) cuts[index].push(...carved.cut.map((corner) => corner.p));
          return carved.kept;
        });
      });
      pieces.forEach(lay);
    }
    if (indices.length > start) parts.push({ ...part, start, count: indices.length - start });
  }
  const dressing = partBuilder();
  // A door measured as two triangles of one face is one door: dressed once.
  const seen = new Set<string>();
  doors.forEach((door, index) => {
    const { centre, width, height } = doorAxes(door);
    const key = [...centre, width, height].map((value) => Math.round(value * 100)).join();
    if (seen.has(key)) return;
    seen.add(key);
    dressDoor(dressing, door, fit, picture ? (measure.doorLook ?? measure.looks[0]) : null, frameLook, cuts[index]);
  });
  const extra = dressing.model(),
    base = positions.length / 3;
  return {
    ...byPicture(
      [...positions, ...extra.positions],
      [...normals, ...extra.normals],
      [...uvs, ...extra.uvs],
      [...indices, ...Array.from(extra.indices, (i) => i + base)],
      [...parts, ...extra.parts.map((part) => ({ ...part, start: part.start + indices.length }))],
    ),
    doors: doorsOf(measure),
  };
}

/** A model's faces gathered by picture, one draw each, in the order each picture first came. */
function byPicture(
  positions: readonly number[],
  normals: readonly number[],
  uvs: readonly number[],
  indices: readonly number[],
  parts: readonly ModelPart[],
): Omit<ForgedModel, 'doors'> {
  const groups = new Map<string, { part: ModelPart; indices: number[] }>();
  for (const part of parts) {
    const key = `${part.archive}.${part.record}`;
    let group = groups.get(key);
    if (!group) {
      group = { part, indices: [] };
      groups.set(key, group);
    }
    group.indices.push(...indices.slice(part.start, part.start + part.count));
  }
  const gathered: number[] = [],
    drawn: ModelPart[] = [];
  for (const { part, indices: own } of groups.values()) {
    drawn.push({ archive: part.archive, record: part.record, start: gathered.length, count: own.length });
    gathered.push(...own);
  }
  return {
    positions: Float32Array.from(positions),
    normals: Float32Array.from(normals),
    uvs: Float32Array.from(uvs),
    indices: Uint32Array.from(gathered),
    parts: drawn,
  };
}
