// What a dungeon's entrance is built as above ground, round its door: the style below says it. A crypt's mausoleum
// under a gabled roof among its graves, the halls' gatehouse between two crenellated towers, the cells' squat gaol
// beside a gibbet and its cage, the sanctum's portico of columns on a stepped plinth with one fallen, the caverns'
// mouth heaped with leaning slabs of rock, and the mines' timbered adit with its rails and headframe. Each is laid in
// the door's own frame (`doorOf`): across it, out from it and up, in the dungeon's stone, the climate's timber and
// iron. Drawn only: as the mound it stands round, a body passes through it.
import type { MeshBuilder } from '../models/model.ts';
import { IRON } from './dungeonMesh.ts';
import type { StyleKey } from './dungeonLayout.ts';
import { TILE_M } from './dungeonUv.ts';

type Point = readonly [number, number, number];
type Picture = readonly [number, number];

/** The door a facade is laid round: its middle on the ground, the way it looks out across the ground (a unit), and
 *  the seed its small differences are drawn from. */
export interface FacadeDoor {
  readonly middle: Point;
  readonly out: readonly [number, number];
  readonly seed: number;
}

/** What a facade wears: its style's wall, trim and floor pictures, and the climate's timber. */
export interface FacadeLook {
  readonly style: StyleKey;
  readonly wall: Picture;
  readonly trim: Picture;
  readonly floor: Picture;
  readonly timber: Picture;
}

/** A facade's own frame: points given across the door (`across`, to its right as one faces it), out from it (`out`)
 *  and up, laid into the world. */
interface Frame {
  readonly mesh: MeshBuilder;
  readonly at: (across: number, out: number, up: number) => Point;
  readonly draw: () => number;
}

/** A face of four corners, wound to face away from `inside` as the city's faces are, its picture laid in metres. */
function face(frame: Frame, picture: Picture, corners: readonly Point[], inside: Point): void {
  const [first, second, third] = corners as [Point, Point, Point];
  const normal: Point = [
    (second[1] - first[1]) * (third[2] - first[2]) - (second[2] - first[2]) * (third[1] - first[1]),
    (second[2] - first[2]) * (third[0] - first[0]) - (second[0] - first[0]) * (third[2] - first[2]),
    (second[0] - first[0]) * (third[1] - first[1]) - (second[1] - first[1]) * (third[0] - first[0]),
  ];
  const centre = [0, 1, 2].map(
    (axis) => corners.reduce((sum, corner) => sum + (corner[axis] ?? 0), 0) / corners.length,
  );
  const away = normal.reduce((sum, part, axis) => sum + part * ((centre[axis] ?? 0) - (inside[axis] ?? 0)), 0) >= 0;
  const wound = away ? corners : [...corners].reverse();
  const length = Math.hypot(...normal) || 1;
  const lit = normal.map((part) => (away ? part : -part) / length) as unknown as Point;
  // Upright faces lay their picture along the ground and down from the top; flat ones by x and y, as a floor's.
  const upright = Math.abs(lit[2]) < 0.5;
  const top = Math.max(...corners.map((corner) => corner[2]));
  const along = (corner: Point) => corner[0] * -lit[1] + corner[1] * lit[0];
  const mapping = wound.map((corner) =>
    upright ? [along(corner) / TILE_M, (top - corner[2]) / TILE_M] : [corner[0] / TILE_M, corner[1] / TILE_M],
  );
  frame.mesh.quad(picture, wound, lit, mapping);
}

/** A block in the frame: `low` to `high` across, out and up; its top and four sides. */
function block(frame: Frame, picture: Picture, low: Point, high: Point): void {
  const corner = (across: number, out: number, up: number) =>
    frame.at(across ? high[0] : low[0], out ? high[1] : low[1], up ? high[2] : low[2]);
  const inside = frame.at((low[0] + high[0]) / 2, (low[1] + high[1]) / 2, (low[2] + high[2]) / 2);
  face(frame, picture, [corner(0, 0, 1), corner(1, 0, 1), corner(1, 1, 1), corner(0, 1, 1)], inside);
  face(frame, picture, [corner(0, 0, 0), corner(1, 0, 0), corner(1, 0, 1), corner(0, 0, 1)], inside);
  face(frame, picture, [corner(0, 1, 0), corner(1, 1, 0), corner(1, 1, 1), corner(0, 1, 1)], inside);
  face(frame, picture, [corner(0, 0, 0), corner(0, 1, 0), corner(0, 1, 1), corner(0, 0, 1)], inside);
  face(frame, picture, [corner(1, 0, 0), corner(1, 1, 0), corner(1, 1, 1), corner(1, 0, 1)], inside);
}

/** A gabled roof over `across` by `out`, its eaves at `eaves` and its ridge, running out from the door, at `ridge`;
 *  its two slopes and the gables at either end. */
function gable(
  frame: Frame,
  picture: Picture,
  across: readonly [number, number],
  out: readonly [number, number],
  heights: readonly [number, number],
) {
  const [left, right] = across;
  const [back, front] = out;
  const [eaves, ridge] = heights;
  const middle = (left + right) / 2;
  const inside = frame.at(middle, (back + front) / 2, eaves);
  const point = (across: number, along: number, up: number) => frame.at(across, along, up);
  for (const [from, to] of [
    [left, middle],
    [right, middle],
  ] as const)
    face(
      frame,
      picture,
      [point(from, back, eaves), point(from, front, eaves), point(to, front, ridge), point(to, back, ridge)],
      inside,
    );
  for (const end of [back, front]) {
    const triangle = [
      point(left, end, eaves),
      point(right, end, eaves),
      point(middle, end, ridge),
      point(middle, end, ridge),
    ];
    face(frame, picture, triangle, inside);
  }
}

/** A column of eight sides from `foot` to `top` at (across, out), on a square base and under a square capital. */
function column(
  frame: Frame,
  look: FacadeLook,
  [across, out]: readonly [number, number],
  heights: readonly [number, number],
  radius: number,
) {
  const [foot, top] = heights;
  block(
    frame,
    look.trim,
    [across - radius * 1.4, out - radius * 1.4, foot],
    [across + radius * 1.4, out + radius * 1.4, foot + 0.3],
  );
  block(
    frame,
    look.trim,
    [across - radius * 1.4, out - radius * 1.4, top - 0.3],
    [across + radius * 1.4, out + radius * 1.4, top],
  );
  const inside = frame.at(across, out, (foot + top) / 2);
  for (let side = 0; side < 8; side++) {
    const [first, second] = [side, side + 1].map((nth) => (nth / 8) * Math.PI * 2);
    const rim = (turn: number, up: number) =>
      frame.at(across + Math.cos(turn) * radius, out + Math.sin(turn) * radius, up);
    face(
      frame,
      look.wall,
      [
        rim(first ?? 0, foot + 0.3),
        rim(second ?? 0, foot + 0.3),
        rim(second ?? 0, top - 0.3),
        rim(first ?? 0, top - 0.3),
      ],
      inside,
    );
  }
}

/** A crypt's mausoleum: a stone house round the mound, its door's lintel and a portico of two columns before it, under
 *  a gabled roof, and headstones leaning round it. */
function mausoleum(frame: Frame, look: FacadeLook): void {
  block(frame, look.floor, [-3, -4.6, -0.3], [3, 1.6, 0.14]);
  block(frame, look.wall, [-2.5, -4.4, 0], [2.5, -4.1, 3.4]);
  for (const side of [-1, 1]) {
    block(frame, look.wall, side < 0 ? [-2.5, -4.4, 0] : [2.2, -4.4, 0], side < 0 ? [-2.2, 0.2, 3.4] : [2.5, 0.2, 3.4]);
    block(
      frame,
      look.wall,
      side < 0 ? [-2.5, -0.1, 0] : [0.85, -0.1, 0],
      side < 0 ? [-0.85, 0.2, 3.4] : [2.5, 0.2, 3.4],
    );
    column(frame, look, [side * 1.45, 1.05], [0.14, 3.4], 0.2);
  }
  block(frame, look.trim, [-0.85, -0.1, 2.45], [0.85, 0.2, 3.4]);
  block(frame, look.trim, [-2.7, -4.6, 3.4], [2.7, 1.45, 3.62]);
  gable(frame, look.trim, [-2.7, 2.7], [-4.6, 1.45], [3.62, 4.8]);
  for (let grave = 0; grave < 6; grave++) {
    const side = grave % 2 === 0 ? -1 : 1;
    const [across, out] = [side * (3.8 + frame.draw() * 3), -3 + frame.draw() * 6];
    const tall = 0.6 + frame.draw() * 0.5;
    block(frame, look.trim, [across - 0.3, out - 0.08, 0], [across + 0.3, out + 0.08, tall]);
  }
}

/** The halls' gatehouse: a crenellated tower either side, the wall between them over the door with its parapet, and
 *  the portcullis drawn up in the arch. */
function gatehouse(frame: Frame, look: FacadeLook): void {
  for (const side of [-1, 1]) {
    const [inner, outer] = [side * 1.5, side * 3.7];
    const [low, high] = [Math.min(inner, outer), Math.max(inner, outer)];
    block(frame, look.wall, [low, -3, 0], [high, 0.9, 6.2]);
    block(frame, look.trim, [low - 0.1, -3.1, 6.2], [high + 0.1, 1, 6.4]);
    for (let merlon = low; merlon < high - 0.2; merlon += 0.9) {
      block(frame, look.wall, [merlon, 0.6, 6.4], [merlon + 0.5, 1, 7.0]);
      block(frame, look.wall, [merlon, -3.1, 6.4], [merlon + 0.5, -2.7, 7.0]);
    }
  }
  block(frame, look.wall, [-1.5, -0.6, 2.7], [1.5, 0.5, 4.8]);
  block(frame, look.trim, [-1.6, -0.7, 4.8], [1.6, 0.6, 5.0]);
  for (let merlon = -1.5; merlon < 1.3; merlon += 0.9)
    block(frame, look.wall, [merlon, 0.2, 5.0], [merlon + 0.5, 0.6, 5.5]);
  for (let bar = -0.8; bar <= 0.81; bar += 0.27) block(frame, IRON, [bar - 0.03, 0.35, 2.35], [bar + 0.03, 0.42, 2.75]);
  block(frame, IRON, [-0.85, 0.34, 2.32], [0.85, 0.43, 2.4]);
}

/** The cells' gaol: a squat stone house round the mound with a parapet, iron grates in its sides, and a gibbet on
 *  the green before it, its cage hung from the arm. */
function gaol(frame: Frame, look: FacadeLook): void {
  block(frame, look.wall, [-2.4, -3.8, 0], [-0.8, 0.3, 2.9]);
  block(frame, look.wall, [0.8, -3.8, 0], [2.4, 0.3, 2.9]);
  block(frame, look.wall, [-0.8, -3.8, 2.45], [0.8, 0.3, 2.9]);
  block(frame, look.wall, [-2.4, -3.8, 0], [2.4, -3.5, 2.9]);
  block(frame, look.trim, [-2.6, -4, 2.9], [2.6, 0.5, 3.15]);
  for (const side of [-1, 1])
    for (let bar = -1.1; bar <= -0.3; bar += 0.2) {
      const across = side * 2.42;
      block(frame, IRON, [across - 0.03, bar - 0.03, 1.2], [across + 0.03, bar + 0.03, 2.0]);
    }
  const post = frame.draw() < 0.5 ? -4.2 : 4.2;
  const toward = post < 0 ? 1 : -1;
  block(frame, look.timber, [post - 0.15, 2.0, 0], [post + 0.15, 2.3, 4.4]);
  block(
    frame,
    look.timber,
    [Math.min(post, post + toward * 1.6), 2.05, 4.1],
    [Math.max(post, post + toward * 1.6), 2.25, 4.35],
  );
  const hang = post + toward * 1.4;
  block(frame, IRON, [hang - 0.02, 2.13, 3.6], [hang + 0.02, 2.17, 4.1]);
  for (const [across, out] of [
    [-0.3, -0.3],
    [0.3, -0.3],
    [-0.3, 0.3],
    [0.3, 0.3],
  ] as const)
    block(frame, IRON, [hang + across - 0.03, 2.15 + out - 0.03, 2.3], [hang + across + 0.03, 2.15 + out + 0.03, 3.6]);
  block(frame, IRON, [hang - 0.33, 1.82, 3.55], [hang + 0.33, 2.48, 3.62]);
  block(frame, IRON, [hang - 0.33, 1.82, 2.27], [hang + 0.33, 2.48, 2.34]);
}

/** The sanctum's portico: a plinth of three steps, a temple's front round the mound under a gabled roof, and four
 *  columns before its door, one broken and its drum lying on the steps. */
function portico(frame: Frame, look: FacadeLook): void {
  for (let step = 0; step < 3; step++)
    block(
      frame,
      look.floor,
      [-3.6 + step * 0.3, -4.4, -0.3],
      [3.6 - step * 0.3, 2.4 - step * 0.35, 0.05 + step * 0.13],
    );
  const floor = 0.31;
  block(frame, look.wall, [-3, -4.2, floor], [-0.85, 0.1, 4.6]);
  block(frame, look.wall, [0.85, -4.2, floor], [3, 0.1, 4.6]);
  block(frame, look.wall, [-0.85, -4.2, 2.6], [0.85, 0.1, 4.6]);
  block(frame, look.trim, [-3.3, -4.4, 4.6], [3.3, 1.95, 5.0]);
  gable(frame, look.trim, [-3.3, 3.3], [-4.4, 1.95], [5.0, 6.2]);
  const broken = Math.floor(frame.draw() * 4);
  [-2.6, -1.0, 1.0, 2.6].forEach((across, nth) => {
    const top = nth === broken ? 1.6 + frame.draw() : 4.6;
    column(frame, look, [across, 1.4], [floor, top], 0.24);
  });
  const lying = [-2.6, -1.0, 1.0, 2.6][broken] ?? 0;
  block(frame, look.wall, [lying + 0.5, 2.0, 0.05], [lying + 1.6, 2.45, 0.5]);
}

/** The caverns' mouth: slabs of rock leaning in over the door from either side, a capstone across them, and rocks
 *  heaped round. */
function caveMouth(frame: Frame, look: FacadeLook): void {
  for (const side of [-1, 1]) {
    for (let slab = 0; slab < 3; slab++) {
      const across = side * (1.1 + slab * 0.7 + frame.draw() * 0.3);
      const tall = 3.2 - slab * 0.7 + frame.draw() * 0.6;
      block(frame, look.wall, [across - 0.45, -1.4 + slab * -0.6, 0], [across + 0.45, 0.4 - slab * 0.3, tall]);
    }
  }
  block(frame, look.wall, [-1.9, -1.2, 2.55], [1.9, 0.5, 3.4]);
  block(frame, look.wall, [-1.4, -2.2, 3.3], [1.2, 0.1, 4.0]);
  for (let rock = 0; rock < 7; rock++) {
    const side = rock % 2 === 0 ? -1 : 1;
    const [across, out] = [side * (2.4 + frame.draw() * 2.5), -1.5 + frame.draw() * 4];
    const size = 0.3 + frame.draw() * 0.5;
    block(frame, look.wall, [across - size, out - size, 0], [across + size, out + size * 0.8, size * 1.3]);
  }
}

/** The mines' adit: a timber frame of posts, lintel and cribbing round the door, rails on their sleepers running out
 *  of it to an ore cart, and a headframe behind with its wheel. */
function adit(frame: Frame, look: FacadeLook): void {
  for (const side of [-1, 1]) {
    block(frame, look.timber, [side * 0.95 - 0.16, 0.05, 0], [side * 0.95 + 0.16, 0.37, 2.85]);
    for (let board = 0; board < 6; board++) {
      const up = board * 0.45;
      block(
        frame,
        look.timber,
        side < 0 ? [-2.4, -0.1, up] : [1.1, -0.1, up],
        side < 0 ? [-1.1, 0.12, up + 0.38] : [2.4, 0.12, up + 0.38],
      );
    }
  }
  block(frame, look.timber, [-1.5, 0.0, 2.65], [1.5, 0.42, 3.0]);
  for (let sleeper = 0.5; sleeper < 7.5; sleeper += 0.6)
    block(frame, look.timber, [-0.75, sleeper, -0.05], [0.75, sleeper + 0.22, 0.06]);
  for (const rail of [-0.45, 0.45]) block(frame, IRON, [rail - 0.04, 0.4, 0.06], [rail + 0.04, 7.6, 0.14]);
  const cart = 3.5 + frame.draw() * 2.5;
  block(frame, look.timber, [-0.6, cart, 0.35], [0.6, cart + 1.3, 1.15]);
  for (const [across, along] of [
    [-0.62, 0.25],
    [0.62, 0.25],
    [-0.62, 1.05],
    [0.62, 1.05],
  ] as const)
    block(frame, IRON, [across - 0.05, cart + along - 0.18, 0.06], [across + 0.05, cart + along + 0.18, 0.42]);
  for (const side of [-1, 1]) {
    block(frame, look.timber, [side * 1.6 - 0.15, -3.6, 0], [side * 1.6 + 0.15, -3.3, 7.2]);
    block(frame, look.timber, [side * 1.6 - 0.12, -6.2, 0], [side * 1.6 + 0.12, -5.9, 6.4]);
  }
  block(frame, look.timber, [-1.75, -6.2, 6.4], [1.75, -3.3, 6.7]);
  block(frame, look.timber, [-1.75, -3.6, 7.2], [1.75, -3.3, 7.45]);
  for (let spoke = 0; spoke < 12; spoke++) {
    const turn = (spoke / 12) * Math.PI * 2;
    const [across, up] = [Math.cos(turn) * 1.1, 8.3 + Math.sin(turn) * 1.1];
    block(frame, IRON, [across - 0.08, -3.55, up - 0.08], [across + 0.08, -3.4, up + 0.08]);
  }
  block(frame, IRON, [-0.12, -3.6, 7.45], [0.12, -3.35, 8.4]);
}

const FACADES: Readonly<Record<StyleKey, (frame: Frame, look: FacadeLook) => void>> = {
  crypt: mausoleum,
  halls: gatehouse,
  cells: gaol,
  sanctum: portico,
  caverns: caveMouth,
  mines: adit,
  chalk: caveMouth,
  barrow: mausoleum,
};

/** Lays the facade of `look`'s style round `door` into `mesh`, from `origin` (x, y). */
export function layFacade(mesh: MeshBuilder, door: FacadeDoor, look: FacadeLook, origin: readonly [number, number]) {
  const [outX, outY] = door.out;
  const [rightX, rightY] = [-outY, outX];
  let seed = door.seed >>> 0;
  const frame: Frame = {
    mesh,
    at: (across, out, up) => [
      door.middle[0] - origin[0] + rightX * across + outX * out,
      door.middle[1] - origin[1] + rightY * across + outY * out,
      door.middle[2] + up,
    ],
    draw: () => {
      seed = Math.imul(seed ^ (seed >>> 15), 0x2c1b3c6d) >>> 0;
      seed ^= seed >>> 12;
      return (seed >>> 0) / 4_294_967_296;
    },
  };
  FACADES[look.style](frame, look);
}
