// What a ship's mesh is, beyond its parts, worked out once when it loads: which of her hull's faces are the outside
// of her shell, where a side's paint goes; and which of her spars are the yards of her square sails, which turn
// round their masts as each sail is braced. The tags ride in the vertex's spare part bytes.
import { SHIP_PARTS } from '../textures/shipPictures.ts';
import type { SailCorners } from './sails.ts';
import { type ShipMesh, VERTEX_BYTES } from './shipMesh.ts';

type Point = readonly [number, number, number];

/** The vertex's part bytes: the part, then 1 where it is the outside of her shell, then its yard's number plus one. */
const PART_BYTE = 24;
const SHELL_BYTE = 25;
const YARD_BYTE = 26;
/** Her breadth is measured in slices this long along her and this deep, metres; a vertex within `SHELL_M` of her
 *  breadth in its slice, facing outboard, is her shell. */
const SLICE = { alongM: 0.25, upM: 0.1 } as const;
const SHELL_M = 0.15;
/** Over her waterline a slice is her side only where she is this share of her greatest breadth at that station:
 *  a deckhouse standing above her rail is the widest thing in its own slices, but far inboard of her sides. */
const TOPSIDE_SHARE = 0.6;
/** Her hull's faces are sampled this finely for her breadth, metres: under a slice's depth. */
const SAMPLE_M = 0.08;
/** Slices a station holds, for a slice's number: more than any hull is tall. */
const SLICES_UP = 1000;
/** A yard's pieces lie within this of the line through its sail's head, metres, and reach this share of its head's
 *  width (each yard is modelled as two halves). */
const YARD_REACH_M = 0.8;
const YARD_SPAN_SHARE = 0.3;
/** A yard's piece is round, its thickness between these, and lies across her, a piece of a sail's yard this long at
 *  least and a bare yard's this; a bare yard stands within this of her mast along her, and this high. */
const YARD = { thickM: 0.05, thinM: 0.5, pieceM: 1, bareM: 2.5, mastM: 1, overM: 7 } as const;
/** Square sails whose heads stand this close along her hang from one mast. */
const MAST_M = 1.5;

/** A yard: the sail whose brace turns it, and the point of her centreline it turns about, in her frame. */
export interface Yard {
  readonly sail: number;
  readonly pivot: Point;
}

/** Her mesh's vertices with their tags, her yards, and each sail's pivot (a square sail's yard's; none for others). */
export interface ShipTags {
  readonly vertices: ArrayBuffer;
  readonly yards: readonly Yard[];
  readonly pivots: readonly (Point | null)[];
}

const distance = (one: Point, other: Point) => Math.hypot(one[0] - other[0], one[1] - other[1], one[2] - other[2]);

/** Her mesh's vertices joined by her faces into pieces, each a list of its vertices. */
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

/** Tags her mesh's vertices: her shell, and her square sails' yards (each to its sail, a bare one to its mast's
 *  lowest sail). */
export function tagShip(mesh: ShipMesh, sails: readonly SailCorners[]): ShipTags {
  const vertices = mesh.vertices.slice(0);
  const view = new DataView(vertices);
  const pointOf = (vertex: number): Point =>
    [0, 4, 8].map((offset) => view.getFloat32(vertex * VERTEX_BYTES + offset, true)) as unknown as Point;
  const partOf = (vertex: number) => view.getUint8(vertex * VERTEX_BYTES + PART_BYTE);
  const [hull, spar] = [SHIP_PARTS.indexOf('hull'), SHIP_PARTS.indexOf('spar')];
  // Her breadth in each slice, from her hull's faces sampled across: a long plank has vertices only at its ends.
  const stationOf = (x: number) => Math.floor(x / SLICE.alongM);
  const sliceOf = (x: number, z: number) => stationOf(x) * SLICES_UP + Math.floor(z / SLICE.upM);
  const [breadth, station] = [new Map<number, number>(), new Map<number, number>()];
  const widen = (x: number, y: number, z: number) => {
    const [slice, along] = [sliceOf(x, z), stationOf(x)];
    if (Math.abs(y) > (breadth.get(slice) ?? 0)) breadth.set(slice, Math.abs(y));
    if (Math.abs(y) > (station.get(along) ?? 0)) station.set(along, Math.abs(y));
  };
  for (let corner = 0; corner < mesh.indices.length; corner += 3) {
    const [first, second, third] = [0, 1, 2].map((next) => mesh.indices[corner + next] ?? 0) as [
      number,
      number,
      number,
    ];
    if (partOf(first) !== hull) continue;
    const [from, toward, across] = [pointOf(first), pointOf(second), pointOf(third)];
    const steps = Math.ceil(
      Math.max(distance(from, toward), distance(from, across), distance(toward, across)) / SAMPLE_M,
    );
    const [alongX, alongY, alongZ] = [0, 1, 2].map((axis) => (toward[axis] - from[axis]) / steps) as [
      number,
      number,
      number,
    ];
    const [overX, overY, overZ] = [0, 1, 2].map((axis) => (across[axis] - from[axis]) / steps) as [
      number,
      number,
      number,
    ];
    for (let along = 0; along <= steps; along++)
      for (let over = 0; over <= steps - along; over++)
        widen(
          from[0] + alongX * along + overX * over,
          from[1] + alongY * along + overY * over,
          from[2] + alongZ * along + overZ * over,
        );
  }
  for (let vertex = 0; vertex < mesh.vertexCount; vertex++) {
    if (partOf(vertex) !== hull) continue;
    const [x, y, z] = pointOf(vertex);
    const broadest = breadth.get(sliceOf(x, z)) ?? 0;
    const outboard = view.getInt8(vertex * VERTEX_BYTES + 13) * Math.sign(y) > 0;
    const side = z <= 0 || broadest >= TOPSIDE_SHARE * (station.get(stationOf(x)) ?? 0);
    const shell = Math.abs(y) >= broadest - SHELL_M && outboard && side;
    view.setUint8(vertex * VERTEX_BYTES + SHELL_BYTE, shell ? 1 : 0);
  }
  // Her yards, by the spar pieces along each square sail's head; a round spar across a mast that holds none is bare.
  const sparPieces = piecesOf(mesh).filter((piece) => piece.every((vertex) => partOf(vertex) === spar));
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
  // A piece of a round spar lying across her at least `acrossM` long: a top's flat rim is not one.
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
  // A mast's sails, by where their heads stand along her; a bare yard turns with the lowest of them.
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
  return { vertices, yards, pivots };
}

/** A point of her frame turned about a vertical line through `pivot` by `degrees` of brace, its leeward arm aft (the
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
