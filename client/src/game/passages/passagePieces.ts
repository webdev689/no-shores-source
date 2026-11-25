// The passages' own pieces as the page stands them until their packs are published (tools/dungeon, tools/islands:
// `passage.*`): each piece built of plain boxes to the sizes its solids are (crates/passage/src/plan.rs `Kind::solids`),
// grey-green stone, iron and timber, with the lamp's and a dead lamp's light gold when lit and grey when cold, and a
// mouth's iron leaf standing in its frame while it is shut. A vein's nodes are the game's own resource nodes, drawn
// from the room's word as anywhere (`nodeCards`), so none is built here.
import type { PassagePiece } from '../../rules/passageRules.ts';

type Colour = readonly [number, number, number];

export const STONE: Colour = [0.4, 0.45, 0.4];
export const IRON: Colour = [0.24, 0.25, 0.27];
export const TIMBER: Colour = [0.38, 0.29, 0.19];
/** Gold is for home: a lamp lit. */
export const LIT: Colour = [1, 0.76, 0.32];
export const COLD: Colour = [0.42, 0.42, 0.42];

/** A box of a piece in its own frame (x east, y south, z up from its foot, its front to the north): its west, north,
 *  east and south, its foot and top, its colour, and whether it gives light. */
export interface PieceBox {
  readonly sides: readonly [west: number, north: number, east: number, south: number];
  readonly foot: number;
  readonly top: number;
  readonly colour: Colour;
  readonly glows: boolean;
}

/** What the room says of a zone's pieces now: whether the lamp is lit for this player, which onward mouths are open
 *  (by their number), and which dead lamps are lit and which tally posts are broken (each by its number). */
export interface PieceState {
  readonly lampLit: boolean;
  readonly openMouths: readonly number[];
  readonly kindled: readonly number[];
  readonly broken: readonly number[];
}

export const UNTOUCHED: PieceState = { lampLit: false, openMouths: [], kindled: [], broken: [] };

const square = (x: number, y: number, half: number): PieceBox['sides'] => [x - half, y - half, x + half, y + half];
const box = (sides: PieceBox['sides'], foot: number, top: number, colour: Colour, glows = false): PieceBox => ({
  sides,
  foot,
  top,
  colour,
  glows,
});

/** A frame 2.4 m wide and 3 m tall, its jambs and lintel stone, an iron leaf filling it while it is shut. */
function doorway(shut: boolean): PieceBox[] {
  const frame = [
    box([-1.2, -0.4, -0.85, 0.4], 0, 3, STONE),
    box([0.85, -0.4, 1.2, 0.4], 0, 3, STONE),
    box([-0.85, -0.4, 0.85, 0.4], 2.6, 3, STONE),
  ];
  return shut ? [...frame, box([-0.85, -0.12, 0.85, 0.12], 0, 2.6, IRON)] : frame;
}

/** The lamp: a plinth of the grey-green stone, its light on it, in a ring of five standing stones 3.5 m out. */
function lamp(lit: boolean): PieceBox[] {
  const stones = Array.from({ length: 5 }, (unused, stone) => {
    const turn = (2 * Math.PI * stone) / 5;
    return box(square(3.5 * Math.sin(turn), -3.5 * Math.cos(turn), 0.5), 0, 2.2, STONE);
  });
  return [box(square(0, 0, 0.8), 0, 1.4, STONE), box(square(0, 0, 0.3), 1.4, 2, lit ? LIT : COLD, lit), ...stones];
}

/** Each box a piece stands as, as `state` finds it. */
export function piecesBoxes(piece: PassagePiece, state: PieceState): PieceBox[] {
  switch (piece.kind) {
    case 'way-in':
      return doorway(true);
    case 'mouth':
      return doorway(!state.openMouths.includes(piece.number));
    case 'lamp':
      return lamp(state.lampLit);
    case 'kindle': {
      const lit = state.kindled.includes(piece.number);
      return [box(square(0, 0, 0.12), 0, 2.1, IRON), box(square(0, 0, 0.25), 2.1, 2.4, lit ? LIT : COLD, lit)];
    }
    case 'post':
      return state.broken.includes(piece.number)
        ? [box(square(0, 0, 0.35), 0, 0.5, TIMBER)]
        : [box(square(0, 0, 0.35), 0, 1.8, TIMBER), box(square(0, 0, 0.38), 1.2, 1.3, IRON)];
    case 'reliquary':
      return [box([-0.7, -0.45, 0.7, 0.45], 0, 0.75, STONE), box([-0.72, -0.47, 0.72, 0.47], 0.75, 0.9, IRON)];
    case 'node':
      return [];
  }
}

/** Floats a vertex: its place in the zone's frame, its normal, its colour and its light (0 or 1). */
export const PIECE_FLOATS = 10;

export interface PieceMesh {
  readonly vertices: Float32Array;
  readonly indices: Uint32Array;
}

/** Every piece's boxes turned to its facing (clockwise from north) and stood at its foot, in the zone's frame: four
 *  corners a face, each face its own normal. */
export function pieceMesh(pieces: readonly PassagePiece[], state: PieceState): PieceMesh {
  const vertices: number[] = [];
  const indices: number[] = [];
  for (const piece of pieces) {
    const [sine, cosine] = [Math.sin(piece.facing), Math.cos(piece.facing)];
    const turned = (x: number, y: number): [number, number] => [
      piece.at[0] + x * cosine - y * sine,
      piece.at[1] + x * sine + y * cosine,
    ];
    for (const { sides, foot, top, colour, glows } of piecesBoxes(piece, state)) {
      const [west, north, east, south] = sides;
      const corners = [turned(west, north), turned(east, north), turned(east, south), turned(west, south)];
      const [low, high] = [piece.at[2] + foot, piece.at[2] + top];
      const face = (points: readonly (readonly [number, number, number])[], normal: readonly number[]) => {
        const first = vertices.length / PIECE_FLOATS;
        for (const point of points) vertices.push(...point, ...normal, ...colour, glows ? 1 : 0);
        indices.push(first, first + 1, first + 2, first, first + 2, first + 3);
      };
      const ring = corners.map(([x, y]) => [x, y] as const);
      face(
        ring.map(([x, y]) => [x, y, high] as const),
        [0, 0, 1],
      );
      face(
        [...ring].reverse().map(([x, y]) => [x, y, low] as const),
        [0, 0, -1],
      );
      ring.forEach(([x, y], side) => {
        const [nextX, nextY] = ring[(side + 1) % 4] ?? [x, y];
        const length = Math.hypot(nextY - y, x - nextX) || 1;
        // Wound clockwise on the map from the north-west corner (x east, y south), an edge (dx, dy) faces out (dy, -dx).
        const normal = [(nextY - y) / length, (x - nextX) / length, 0];
        face(
          [
            [x, y, low],
            [nextX, nextY, low],
            [nextX, nextY, high],
            [x, y, high],
          ],
          normal,
        );
      });
    }
  }
  return { vertices: new Float32Array(vertices), indices: new Uint32Array(indices) };
}
