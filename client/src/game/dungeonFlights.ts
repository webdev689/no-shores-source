// A dungeon's flights of stairs as the mesh draws them: 40 treads in the floor's picture and their risers in the
// trim, each tread's middle on the slope the rules walk, so a body's feet never stand more than half a riser off a
// step; the flight's side walls, a trim band at their foot following the steps; its ceiling FLIGHT_CEILING_M over the
// slope, sloped with it; and an arch, two posts and a lintel, framing its head and its foot on their landings' side,
// as a doorway is framed, unless a kit's arch stands there.
import type { MeshBuilder } from '../models/model.ts';
import { type DungeonLayout, floorOf, type Stair } from './dungeonLayout.ts';
import { BASE_M, box, face, lookAt, ROLE } from './dungeonMesh.ts';
import { TILE_M } from './dungeonUv.ts';

type Point = readonly [number, number, number];

/** How many treads a flight has, and its ceiling over its slope (m). */
export const TREADS = 40;
export const FLIGHT_CEILING_M = 3.2;
/** The arch at each end of a flight, metres: each post's width, the lintel's depth, and how far both stand onto the
 *  landing. */
export const FLIGHT_ARCH = { post: 0.3, lintel: 0.3, proud: 0.18 } as const;
/** A tread's nosing in the trim (m), and how far each tread's picture is shifted from the last's (pictures). */
const NOSING_M = 0.06;
const TREAD_SHIFT = 0.37;

/** A flight's frame: its head edge's middle, the way down it and across it (x east, y south), its length, and its
 *  two floors. A point `along` metres down from the head edge and `across` from its middle line. */
export interface FlightFrame {
  readonly head: readonly [number, number];
  readonly down: readonly [number, number];
  readonly across: readonly [number, number];
  readonly length: number;
  readonly upper: number;
  readonly lower: number;
}

/** The frame of a flight, read from its landing on top and its first cell. */
export function flightFrame(layout: DungeonLayout, stair: Stair): FlightFrame {
  const { columns, cell } = layout;
  const first = stair.cells[0] ?? stair.top;
  const [topColumn, topRow] = [stair.top % columns, Math.floor(stair.top / columns)];
  const down = [(first % columns) - topColumn, Math.floor(first / columns) - topRow] as const;
  return {
    head: [(topColumn + 0.5 + down[0] / 2) * cell, (topRow + 0.5 + down[1] / 2) * cell],
    down,
    across: [-down[1], down[0]],
    length: stair.cells.length * cell,
    upper: floorOf(layout, stair.upper),
    lower: floorOf(layout, stair.upper + 1),
  };
}

/** A point of a flight by how far down it from its head edge and across it from its middle line, at height `z`. */
export function flightPoint(frame: FlightFrame, along: number, across: number, z: number): Point {
  return [
    frame.head[0] + frame.down[0] * along + frame.across[0] * across,
    frame.head[1] + frame.down[1] * along + frame.across[1] * across,
    z,
  ];
}

/** The slope's height `along` metres down a flight, as the rules walk it. */
export function flightSlope(frame: FlightFrame, along: number): number {
  return frame.upper + ((frame.lower - frame.upper) * along) / frame.length;
}

/** Tread `index`'s top: the slope at its middle. */
export function treadTop(frame: FlightFrame, index: number): number {
  return flightSlope(frame, ((index + 0.5) * frame.length) / TREADS);
}

/** Every flight of a layout drawn into `mesh`: `arched` the ends (`stair * 2`, `+ 1` at the foot) whose arch a kit
 *  piece stands for, `coursed` the flights whose side courses kit pieces lay. */
export function flightsMesh(
  mesh: MeshBuilder,
  layout: DungeonLayout,
  arched: ReadonlySet<number> = new Set(),
  coursed: ReadonlySet<number> = new Set(),
): void {
  const plane = layout.columns * layout.rows;
  (layout.stairs ?? []).forEach((stair, number) => {
    const frame = flightFrame(layout, stair);
    const half = layout.cell / 2;
    const run = frame.length / TREADS;
    // Each tread wears the look of the cell it lies in on the flight's upper storey.
    const lookOfTread = (index: number) =>
      lookAt(layout, stair.upper * plane + (stair.cells[Math.floor((index * run) / layout.cell)] ?? stair.top));
    const ceilingAt = (along: number) => flightSlope(frame, along) + FLIGHT_CEILING_M;
    const quad = (picture: readonly [number, number], corners: Point[], normal: Point, top: number) =>
      face(mesh, picture, corners, normal, top);
    const downward: Point = [frame.down[0], frame.down[1], 0];
    for (let index = 0; index <= TREADS; index++) {
      const look = lookOfTread(Math.min(index, TREADS - 1));
      const [from, to] = [index * run, (index + 1) * run];
      const top = index < TREADS ? treadTop(frame, index) : frame.lower;
      const above = index === 0 ? frame.upper : treadTop(frame, index - 1);
      // The riser at the tread's near edge, facing down the flight, up to the tread before it.
      quad(
        [look.set, ROLE.trim],
        [
          flightPoint(frame, from, -half, top),
          flightPoint(frame, from, half, top),
          flightPoint(frame, from, half, above),
          flightPoint(frame, from, -half, above),
        ],
        downward,
        above,
      );
      if (index === TREADS) break;
      // Its nosing in the trim, and the tread's picture started afresh on each, so the steps read from above, where
      // the risers face away.
      const nosed = from + NOSING_M;
      quad(
        [look.set, ROLE.trim],
        [
          flightPoint(frame, from, -half, top),
          flightPoint(frame, nosed, -half, top),
          flightPoint(frame, nosed, half, top),
          flightPoint(frame, from, half, top),
        ],
        [0, 0, 1],
        top,
      );
      const tread = [
        flightPoint(frame, nosed, -half, top),
        flightPoint(frame, to, -half, top),
        flightPoint(frame, to, half, top),
        flightPoint(frame, nosed, half, top),
      ];
      const shift = index * TREAD_SHIFT;
      mesh.quad(
        [look.set, ROLE.floor],
        tread,
        [0, 0, 1],
        tread.map(([x, y]) => [x / TILE_M + shift, y / TILE_M + shift]),
      );
      // Each side wall over the tread, facing into the flight, its foot in the trim unless a kit's course runs there.
      for (const side of [-1, 1]) {
        const facing: Point = [-frame.across[0] * side, -frame.across[1] * side, 0];
        const band = coursed.has(number) ? top : top + BASE_M;
        const strip = (low: number, high: [number, number], record: number) =>
          quad(
            [look.set, record],
            [
              flightPoint(frame, from, half * side, low),
              flightPoint(frame, to, half * side, low),
              flightPoint(frame, to, half * side, high[1]),
              flightPoint(frame, from, half * side, high[0]),
            ],
            facing,
            frame.upper + FLIGHT_CEILING_M,
          );
        if (band > top) strip(top, [band, band], ROLE.trim);
        strip(band, [ceilingAt(from), ceilingAt(to)], look.wall);
      }
    }
    // The ceiling, a cell at a time, sloped with the flight and facing down into it.
    const fall = (frame.upper - frame.lower) / frame.length;
    const length = Math.hypot(fall, 1);
    const under: Point = [(-frame.down[0] * fall) / length, (-frame.down[1] * fall) / length, -1 / length];
    stair.cells.forEach((cell, index) => {
      const look = lookAt(layout, stair.upper * plane + cell);
      const [from, to] = [index * layout.cell, (index + 1) * layout.cell];
      quad(
        [look.set, ROLE.ceiling],
        [
          flightPoint(frame, from, -half, ceilingAt(from)),
          flightPoint(frame, to, -half, ceilingAt(to)),
          flightPoint(frame, to, half, ceilingAt(to)),
          flightPoint(frame, from, half, ceilingAt(from)),
        ],
        under,
        ceilingAt(from),
      );
    });
    // The arches: at the head on its landing's side (up the flight), at the foot on its landing's (down it).
    const ends = [
      { key: number * 2, at: 0, out: -1, floor: frame.upper, landing: stair.upper * plane + stair.top },
      {
        key: number * 2 + 1,
        at: frame.length,
        out: 1,
        floor: frame.lower,
        landing: (stair.upper + 1) * plane + stair.bottom,
      },
    ];
    for (const end of ends) {
      if (arched.has(end.key)) continue;
      const trim = [lookAt(layout, end.landing).set, ROLE.trim] as const;
      const near = end.at;
      const far = end.at + end.out * FLIGHT_ARCH.proud;
      const piece = (left: number, right: number, low: number, high: number) => {
        const corners = [flightPoint(frame, near, left, low), flightPoint(frame, far, right, high)];
        box(
          mesh,
          trim,
          [Math.min(corners[0]![0], corners[1]![0]), Math.min(corners[0]![1], corners[1]![1]), end.floor + low],
          [Math.max(corners[0]![0], corners[1]![0]), Math.max(corners[0]![1], corners[1]![1]), end.floor + high],
        );
      };
      const inner = half - FLIGHT_ARCH.post;
      const lintel = FLIGHT_CEILING_M - FLIGHT_ARCH.lintel;
      piece(-half, -inner, 0, lintel);
      piece(inner, half, 0, lintel);
      piece(-half, half, lintel, FLIGHT_CEILING_M);
    }
  });
}
