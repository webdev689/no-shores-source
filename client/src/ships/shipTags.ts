// What a ship's mesh is, beyond its parts, worked out once when it loads: which of its hull's faces are the outside
// of its shell, where a side's paint goes; and which of its spars are the yards of its square sails, which turn
// round their masts as each sail is braced. The tags ride in the vertex's spare part bytes.
import { SHIP_PARTS } from '../textures/shipPictures.ts';
import type { SailCorners } from './sails.ts';
import { mastsOf } from './shipHarm.ts';
import { type ShipMesh, VERTEX_BYTES } from './shipMesh.ts';

type Point = readonly [number, number, number];

/** The vertex's part bytes: the part, then 1 where it is the outside of its shell, then its yard's number plus one. */
const PART_BYTE = 24;
const SHELL_BYTE = 25;
const YARD_BYTE = 26;
const MAST_BYTE = 27;
/** A spar stands on a mast when its forward end lies within this of the mast along the ship, metres: the mast itself, its
 *  yards and tops, and a gaff's or boom's jaws; a bowsprit is far forward of any. */
const ON_MAST_M = 1.2;
/** Any other piece of its rig (a shroud, a stay, ratlines, crosstrees) is the mast's whose top lies within this of it
 *  along the ship and this far over its foot, metres: a rope is made fast to the mast it holds up. */
const ROPE_ON_MAST_M = 2.5;
const ROPE_OVER_FOOT_M = 3;
/** A piece in a cell this wide, or one beside it, holding a mast's spar hangs from it (within about twice this),
 *  metres. */
const HUNG_M = 0.3;
/** What is never a mast's: its hull, its deck and its canvas. */
const NOT_RIG = new Set(['hull', 'deck', 'sail']);
/** Its breadth is measured in slices this long along it and this deep, metres; a vertex within `SHELL_M` of its
 *  breadth in its slice, facing outboard, is its shell. */
const SLICE = { alongM: 0.25, acrossM: 0.25, upM: 0.1 } as const;
const SHELL_M = 0.15;
/** A face facing inboard is its shell only this close to its breadth, metres: under any bulwark's thickness. */
const FLUSH_M = 0.03;
/** A slice is its side only where it is this share of its greatest breadth at that station at or below it: a
 *  deckhouse standing above its rail is the widest thing in its own slices, but far inboard of its sides under it,
 *  while its bow flares out above its narrow forefoot. */
const TOPSIDE_SHARE = 0.6;
/** Its stem or transom in a slice across it is its end only within this of as far as it reaches at that height,
 *  metres: a deckhouse's front or back stands well inboard of it. */
const END_M = 0.6;
/** Its sides' planking: a piece of its hull this long along it, metres. */
const PLANK_M = 5;
/** Its hull's faces are sampled this finely for its breadth, metres: under a slice's depth. */
const SAMPLE_M = 0.08;
/** Slices a station holds, for a slice's number: more than any hull is tall. */
const SLICES_UP = 1000;
/** A yard's pieces lie within this of the line through its sail's head, metres, and reach this share of its head's
 *  width (each yard is modelled as two halves). */
const YARD_REACH_M = 0.8;
const YARD_SPAN_SHARE = 0.3;
/** A yard's piece is round, its thickness between these, and lies across the ship, a piece of a sail's yard this long at
 *  least and a bare yard's this; a bare yard stands within this of its mast along the ship, and this high. */
const YARD = { thickM: 0.02, thinM: 0.5, pieceM: 1, bareM: 2.5, mastM: 1, overM: 7 } as const;
/** Square sails whose heads stand this close along the ship hang from one mast. */
const MAST_M = 1.5;

/** A yard: the sail whose brace turns it, and the point of its centreline it turns about, in its frame. */
export interface Yard {
  readonly sail: number;
  readonly pivot: Point;
}

/** A mast as its spars stand on it: the height of its foot and of its head, in its frame, metres. */
export interface MastSpan {
  readonly footZ: number;
  readonly topZ: number;
}

/** Its mesh's vertices with their tags, its yards, each sail's pivot (a square sail's yard's; none for others), and
 *  its masts fore to aft (`mastsOf`), whose spars fall with them. */
export interface ShipTags {
  readonly vertices: ArrayBuffer;
  readonly yards: readonly Yard[];
  readonly pivots: readonly (Point | null)[];
  readonly masts: readonly MastSpan[];
}

const distance = (one: Point, other: Point) => Math.hypot(one[0] - other[0], one[1] - other[1], one[2] - other[2]);

/** Its mesh's vertices joined by its faces into pieces, each a list of its vertices. */
function piecesOf(mesh: ShipMesh): number[][] {
  const above = Int32Array.from({ length: mesh.vertexCount }, (unused, index) => index);
  const root = (vertex: number): number => {
    let found = vertex;
    while (above[found] !== found) found = above[found] = above[above[found] ?? found] ?? found;
    return found;
  };
  for (let corner = 0; corner < mesh.indices.length; corner += 3) {
    const first = root(mesh.indices[corner] ?? 0);
    for (const next of [1, 2]) above[root(mesh.indices[corner + next] ?? 0)] = first;
  }
  const pieces = new Map<number, number[]>();
  for (let vertex = 0; vertex < mesh.vertexCount; vertex++) {
    const piece = root(vertex);
    const listed = pieces.get(piece);
    if (listed) listed.push(vertex);
    else pieces.set(piece, [vertex]);
  }
  return [...pieces.values()];
}

/** Every point over its hull's faces, sampled finely enough for its slices: a long plank has vertices only at its
 *  ends. */
function sampleFaces(
  mesh: ShipMesh,
  pointOf: (vertex: number) => Point,
  sample: (x: number, y: number, z: number, vertex: number) => void,
): void {
  for (let corner = 0; corner < mesh.indices.length; corner += 3) {
    const first = mesh.indices[corner] ?? 0;
    const [from, toward, across] = [0, 1, 2].map((next) => pointOf(mesh.indices[corner + next] ?? 0)) as [
      Point,
      Point,
      Point,
    ];
    const steps = Math.ceil(
      Math.max(distance(from, toward), distance(from, across), distance(toward, across)) / SAMPLE_M,
    );
    const along = [0, 1, 2].map((axis) => (toward[axis] - from[axis]) / steps) as unknown as Point;
    const over = [0, 1, 2].map((axis) => (across[axis] - from[axis]) / steps) as unknown as Point;
    for (let one = 0; one <= steps; one++)
      for (let other = 0; other <= steps - one; other++)
        sample(
          from[0] + along[0] * one + over[0] * other,
          from[1] + along[1] * one + over[1] * other,
          from[2] + along[2] * one + over[2] * other,
          first,
        );
  }
}

/** The greatest of a number kept under a key. */
const raise = (kept: Map<number, number>, key: number, value: number) => {
  if (value > (kept.get(key) ?? -Infinity)) kept.set(key, value);
};

/** Tags the outside of its shell. Its sides: a vertex of its hull within `SHELL_M` of its breadth in its slice (along
 *  it and up), facing outboard, where over its waterline its breadth there is a fair share of its greatest at that
 *  station. Its stem and transom the same way along it: within `SHELL_M` of how far forward or aft it reaches in
 *  its slice (across it and up), facing that way, where that is near as far as it reaches at that height and its
 *  breadth there is its side's, not a deckhouse's. */
function tagShell(
  mesh: ShipMesh,
  view: DataView,
  pointOf: (vertex: number) => Point,
  partOf: (vertex: number) => number,
  pieces: readonly (readonly number[])[],
): void {
  const hull = SHIP_PARTS.indexOf('hull');
  const sliceOf = (across: number, z: number) => across * SLICES_UP + Math.floor(z / SLICE.upM);
  const [stationOf, rowOf, heightOf] = [SLICE.alongM, SLICE.acrossM, SLICE.upM].map(
    (size) => (value: number) => Math.floor(value / size),
  ) as [(x: number) => number, (y: number) => number, (z: number) => number];
  const [breadth, planked, ahead, astern, aheadAt, asternAt] = Array.from(
    { length: 6 },
    () => new Map<number, number>(),
  );
  // Its sides' planks and wales run long along it; its channels, chainplates, catheads and deckhouses are short,
  // and stand proud of it or inboard of it.
  const alongHull = new Uint8Array(mesh.vertexCount);
  for (const piece of pieces) {
    if (partOf(piece[0] ?? 0) !== hull) continue;
    const along = piece.map((vertex) => pointOf(vertex)[0]);
    const long = Math.max(...along) - Math.min(...along) >= PLANK_M ? 1 : 0;
    for (const vertex of piece) alongHull[vertex] = long;
  }
  const hullFaces = {
    ...mesh,
    indices: mesh.indices.filter((unused, corner) => partOf(mesh.indices[corner - (corner % 3)] ?? 0) === hull),
  };
  sampleFaces(hullFaces, pointOf, (x, y, z, vertex) => {
    raise(breadth, sliceOf(stationOf(x), z), Math.abs(y));
    if (alongHull[vertex]) raise(planked, sliceOf(stationOf(x), z), Math.abs(y));
    raise(ahead, sliceOf(rowOf(y), z), x);
    raise(astern, sliceOf(rowOf(y), z), -x);
    raise(aheadAt, heightOf(z), x);
    raise(asternAt, heightOf(z), -x);
  });
  // Its greatest breadth in each slice's station, at or below it.
  const below = new Map<number, number>();
  let [running, runningStation] = [0, NaN];
  for (const slice of [...breadth.keys()].sort((one, other) => one - other)) {
    const station = Math.round(slice / SLICES_UP);
    if (station !== runningStation) [running, runningStation] = [0, station];
    running = Math.max(running, breadth.get(slice) ?? 0);
    below.set(slice, running);
  }
  for (let vertex = 0; vertex < mesh.vertexCount; vertex++) {
    if (partOf(vertex) !== hull) continue;
    const [x, y, z] = pointOf(vertex);
    const [normalX, normalY] = [12, 13].map((byte) => view.getInt8(vertex * VERTEX_BYTES + byte));
    const sideOf = (along: number, height: number) => {
      const broadest = breadth.get(sliceOf(along, height));
      const share = TOPSIDE_SHARE * (below.get(sliceOf(along, height)) ?? 0);
      return broadest !== undefined && broadest >= share ? (planked.get(sliceOf(along, height)) ?? broadest) : null;
    };
    const topside = sideOf(stationOf(x), z) !== null;
    // Where it narrows fast a slice's breadth is its wide end's: its side is measured by the narrowest round it.
    const narrowest = Math.min(
      ...[-1, 0, 1].flatMap((along) =>
        [-1, 0, 1].map((up) => sideOf(stationOf(x) + along, z + up * SLICE.upM) ?? Infinity),
      ),
    );
    // A face modelled inside out faces inboard on its outside: it counts only flush with its breadth in its own
    // slice, where the inside of a bulwark never lies, even where it narrows to its bow.
    const outboard = (normalY ?? 0) * Math.sign(y) > 0;
    const flush = Math.abs(y) >= (breadth.get(sliceOf(stationOf(x), z)) ?? Infinity) - FLUSH_M;
    const side = topside && (outboard ? Math.abs(y) >= narrowest - SHELL_M : flush);
    const end = ([reach, reachAt, sign]: readonly [Map<number, number>, Map<number, number>, number]) => {
      const farthest = reach.get(sliceOf(rowOf(y), z)) ?? -Infinity;
      const outermost = (reachAt.get(heightOf(z)) ?? -Infinity) - farthest < END_M;
      return sign * x >= farthest - SHELL_M && (normalX ?? 0) * sign > 0 && outermost;
    };
    const shell = side || (topside && (end([ahead, aheadAt, 1]) || end([astern, asternAt, -1])));
    view.setUint8(vertex * VERTEX_BYTES + SHELL_BYTE, shell ? 1 : 0);
  }
}

/** Tags its mesh's vertices: its shell, and its square sails' yards (each to its sail, a bare one to its mast's
 *  lowest sail). */
export function tagShip(mesh: ShipMesh, sails: readonly SailCorners[]): ShipTags {
  const vertices = mesh.vertices.slice(0);
  const view = new DataView(vertices);
  const pointOf = (vertex: number): Point =>
    [0, 4, 8].map((offset) => view.getFloat32(vertex * VERTEX_BYTES + offset, true)) as unknown as Point;
  const partOf = (vertex: number) => view.getUint8(vertex * VERTEX_BYTES + PART_BYTE);
  const spar = SHIP_PARTS.indexOf('spar');
  const pieces = piecesOf(mesh);
  tagShell(mesh, view, pointOf, partOf, pieces);
  // Its yards, by the spar pieces along each square sail's head; a round spar across a mast that holds none is bare.
  const sparPieces = pieces.filter((piece) => piece.every((vertex) => partOf(vertex) === spar));
  const yards: Yard[] = [];
  const pivots: (Point | null)[] = sails.map(() => null);
  const taken = new Set<number[]>();
  const mark = (pieces: readonly number[][], sail: number) => {
    const points = pieces.flatMap((piece) => piece.map(pointOf));
    const middle = points.reduce((sum, point) => sum + point[0], 0) / points.length;
    const pivot: Point = [middle, 0, points.reduce((sum, point) => sum + point[2], 0) / points.length];
    for (const piece of pieces)
      for (const vertex of piece) view.setUint8(vertex * VERTEX_BYTES + YARD_BYTE, yards.length + 1);
    pieces.forEach((piece) => taken.add(piece));
    yards.push({ sail, pivot });
    return pivot;
  };
  const extent = (points: readonly Point[], axis: number) =>
    Math.max(...points.map((point) => point[axis] ?? 0)) - Math.min(...points.map((point) => point[axis] ?? 0));
  // A piece of a round spar lying across the ship at least `acrossM` long: a top's flat rim is not one.
  const roundAcross = (points: readonly Point[], acrossM: number) =>
    extent(points, 1) >= acrossM &&
    [0, 2].every((axis) => extent(points, axis) > YARD.thickM && extent(points, axis) < YARD.thinM);
  sails.forEach((sail, index) => {
    if (sail.kind !== 'square') return;
    const [x, z] = [(sail.head_port[0] + sail.head_starboard[0]) / 2, (sail.head_port[2] + sail.head_starboard[2]) / 2];
    const width = Math.abs(sail.head_starboard[1] - sail.head_port[1]);
    const along = sparPieces.filter((piece) => {
      const points = piece.map(pointOf);
      const near = points.every((point) => Math.hypot(point[0] - x, point[2] - z) < YARD_REACH_M);
      return near && (extent(points, 1) >= YARD_SPAN_SHARE * width || roundAcross(points, YARD.pieceM));
    });
    if (along.length > 0) pivots[index] = mark(along, index);
  });
  // A mast's sails, by where their heads stand along the ship; a bare yard turns with the lowest of them.
  const masts: { x: number; lowest: number; z: number }[] = [];
  sails.forEach((sail, index) => {
    if (sail.kind !== 'square') return;
    const [x, z] = [sail.head_port[0], sail.head_port[2]];
    const mast = masts.find((each) => Math.abs(each.x - x) < MAST_M);
    if (!mast) masts.push({ x, lowest: index, z });
    else if (z < mast.z) [mast.lowest, mast.z] = [index, z];
  });
  for (const mast of masts) {
    const bare = sparPieces.filter((piece) => {
      if (taken.has(piece)) return false;
      const points = piece.map(pointOf);
      const [x, z] = [points[0]?.[0] ?? 0, points[0]?.[2] ?? 0];
      return roundAcross(points, YARD.bareM) && Math.abs(x - mast.x) < YARD.mastM && z > YARD.overM;
    });
    if (bare.length > 0) mark(bare, mast.lowest);
  }
  return { vertices, yards, pivots, masts: tagMasts(view, pieces, pointOf, partOf, mastsOf(sails).masts) };
}

/** Tags each spar standing on a mast with the mast's number plus one, and answers each mast's span; then every other
 *  piece of its rig (its shrouds, stays, ratlines and crosstrees) whose top is on that mast, so nothing of a mast
 *  stands where it fell. */
function tagMasts(
  view: DataView,
  pieces: readonly (readonly number[])[],
  pointOf: (vertex: number) => Point,
  partOf: (vertex: number) => number,
  masts: readonly number[],
): MastSpan[] {
  const spans = masts.map(() => ({ footZ: Infinity, topZ: -Infinity }));
  const tag = (piece: readonly number[], mast: number) => {
    for (const vertex of piece) view.setUint8(vertex * VERTEX_BYTES + MAST_BYTE, mast + 1);
  };
  const spar = SHIP_PARTS.indexOf('spar');
  const rigging = pieces.filter((piece) => !NOT_RIG.has(SHIP_PARTS[partOf(piece[0] ?? 0)] ?? 'hull'));
  const rest: (readonly number[])[] = [];
  for (const piece of rigging) {
    const points = piece.map(pointOf);
    const forward = Math.max(...points.map((point) => point[0]));
    const mast = partOf(piece[0] ?? 0) === spar ? masts.findIndex((x) => Math.abs(forward - x) < ON_MAST_M) : -1;
    const span = spans[mast];
    if (!span) {
      rest.push(piece);
      continue;
    }
    tag(piece, mast);
    for (const point of points)
      [span.footZ, span.topZ] = [Math.min(span.footZ, point[2]), Math.max(span.topZ, point[2])];
  }
  // What hangs off a mast's spars, a gaff's peak block or a boom's end, goes with them: found by a grid of cells
  // `HUNG_M` wide, each holding the mast of a spar point in it.
  const cellOf = (point: Point) => point.map((value) => Math.floor(value / HUNG_M));
  // A cell's key as one number: a ship is well under 1000 cells (300 m) every way, so 1024 apart never collide.
  const keyOf = (x: number, y: number, z: number) => ((x + 512) * 1024 + (y + 512)) * 1024 + (z + 512);
  const sparCells = new Map<number, number>();
  for (const piece of rigging) {
    const mast = view.getUint8((piece[0] ?? 0) * VERTEX_BYTES + MAST_BYTE) - 1;
    if (mast >= 0)
      for (const vertex of piece) sparCells.set(keyOf(...(cellOf(pointOf(vertex)) as [number, number, number])), mast);
  }
  const hungFrom = (point: Point) => {
    const [x = 0, y = 0, z = 0] = cellOf(point);
    for (const along of [-1, 0, 1])
      for (const across of [-1, 0, 1])
        for (const up of [-1, 0, 1]) {
          const mast = sparCells.get(keyOf(x + along, y + across, z + up));
          if (mast !== undefined) return mast;
        }
    return -1;
  };
  for (const piece of rest) {
    const points = piece.map(pointOf);
    const top = points.reduce((best, point) => (point[2] > best[2] ? point : best));
    const hung = points.reduce((found, point) => (found >= 0 ? found : hungFrom(point)), -1);
    if (hung >= 0) {
      tag(piece, hung);
      continue;
    }
    const mast = masts.findIndex(
      (x, index) =>
        Math.abs(top[0] - x) < ROPE_ON_MAST_M && top[2] > (spans[index]?.footZ ?? Infinity) + ROPE_OVER_FOOT_M,
    );
    if (mast >= 0) tag(piece, mast);
  }
  return spans.map((span) => (span.footZ === Infinity ? { footZ: 0, topZ: 0 } : span));
}

/** A point of its frame turned about a vertical line through `pivot` by `degrees` of brace, its leeward arm aft (the
 *  canvas's own turn): what the shader does to a yard. */
export function braced(point: Point, pivot: Point, degrees: number): [number, number, number] {
  const turn = (degrees * Math.PI) / 180;
  const [x, y] = [point[0] - pivot[0], point[1] - pivot[1]];
  return [
    pivot[0] + x * Math.cos(turn) - y * Math.sin(turn),
    pivot[1] + x * Math.sin(turn) + y * Math.cos(turn),
    point[2],
  ];
}
