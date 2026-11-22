// A cave's rock walls: each cell's side bulging in and out by a lattice and never at its edges, so it meets the floor,
// the ceiling and the next wall without a gap. Behind what stands against it, an arch or a kit piece, the rock is
// drawn flat, so nothing stands in it; everywhere else it bulges as its lattice lays it.
import type { MeshBuilder } from '../models/model.ts';
import { CAVE_BULGE_M, roughness } from './dungeonCeilings.ts';
import { SIDE_STEPS } from './dungeonLayout.ts';
import { uvOf } from './dungeonUv.ts';

type Point = readonly [number, number, number];
type Picture = readonly [number, number];
type Spot = readonly [along: number, up: number];

/** How many strips a cave's wall is cut into each way: its lattice. */
const CUTS = 4;
/** The most an arch round the portal or the exit door spans along its wall either side of its middle, and its top
 *  (m), as the kits' envelopes allow (tools/dungeon/envelope.py). */
export const ARCH_M = { half: 1.3, top: 3.1 } as const;
/** How far past a flat span along its wall the rock stays flat, and how far past that, or past its top, the rock
 *  eases back to its bulge (m). */
const FLAT_PAD_M = 0.15;
const FLAT_EASE_M = 0.3;

/** A cell's side, by its column, its row, the side's number and the cell's size. */
export type WallAt = { readonly column: number; readonly row: number; readonly side: number; readonly cell: number };

/** A stretch of a cave's wall drawn flat, so a piece or an arch stands on flat rock: along the wall from `from` to
 *  `to` (m from its left end seen from the cell), from the floor up to `top` (m). */
export type FlatSpan = { readonly from: number; readonly to: number; readonly top: number };

/** How far a cave's rock wall stands back into the rock (less than nothing: out into the cell) at a point (x, y) of
 *  its cell's edge, `along` the edge and `up` the wall, each from 0 to 1: none at the edge's ends, its foot or its
 *  head. */
export function caveBulge(x: number, y: number, along: number, up: number): number {
  return (roughness(x, y + up * 7, 11) * 2 - 1) * CAVE_BULGE_M * Math.sin(Math.PI * along) * Math.sin(Math.PI * up);
}

/** How much of the rock's bulge stands at a spot of a wall (m): none over a flat span grown by FLAT_PAD_M along the
 *  wall, all of it FLAT_EASE_M past that or past the span's top, eased between. */
function bulgeShare(spans: readonly FlatSpan[], [along, up]: Spot): number {
  const shares = spans.map(({ from, to, top }) => {
    const past = Math.max(from - FLAT_PAD_M - along, along - to - FLAT_PAD_M, up - top, 0) / FLAT_EASE_M;
    const share = Math.min(1, past);
    return share * share * (3 - 2 * share);
  });
  return Math.min(1, ...shares);
}

/** The lines a wall is cut along one way, in order: its lattice's, and each edge given inside the wall. */
function cutsOf(lattice: readonly number[], edges: readonly number[], length: number): number[] {
  const all = [...lattice, ...edges.filter((edge) => edge > 1e-6 && edge < length - 1e-6)].sort((a, b) => a - b);
  return all.filter((cut, index) => index === 0 || cut - (all[index - 1] ?? 0) > 1e-6);
}

/** The part of a convex polygon where `side` is not below nothing, its corners in order. */
function clipped(polygon: readonly Spot[], side: (spot: Spot) => number): Spot[] {
  const kept: Spot[] = [];
  polygon.forEach((spot, index) => {
    const next = polygon[(index + 1) % polygon.length] ?? spot;
    const [here, there] = [side(spot), side(next)];
    if (here >= 0) kept.push(spot);
    if ((here > 0 && there < 0) || (here < 0 && there > 0)) {
      const share = here / (here - there);
      kept.push([spot[0] + (next[0] - spot[0]) * share, spot[1] + (next[1] - spot[1]) * share]);
    }
  });
  return kept;
}

/** A cave cell's rock wall on its side from the floor to its ceiling, `high`, facing into the cell, flat over each of
 *  `spans`. The lattice lays the rock flat across each of its quads' two triangles, cut from a quad's first corner to
 *  its opposite. Where a span's or its ease's edge cuts a quad, the wall is cut there too, each piece within one of
 *  the lattice's triangles, so past every ease the rock is exactly as the lattice lays it. */
export function caveWall(
  mesh: MeshBuilder,
  picture: Picture,
  where: WallAt,
  high: number,
  spans: readonly FlatSpan[] = [],
): void {
  const [east, south] = SIDE_STEPS[where.side] ?? [0, 0];
  const half = where.cell / 2;
  const [leftX, leftY] = [
    (where.column + 0.5) * where.cell + east * half - south * half,
    (where.row + 0.5) * where.cell + south * half + east * half,
  ];
  const [wide, tall] = [where.cell / CUTS, high / CUTS];
  const onLine = (along: number) => [leftX + south * along, leftY - east * along] as const;
  const lattice = Array.from({ length: CUTS + 1 }, (_unused, column) =>
    Array.from({ length: CUTS + 1 }, (_alsoUnused, row) => {
      const [x, y] = onLine(column * wide);
      return caveBulge(x, y, column / CUTS, row / CUTS);
    }),
  );
  const quadOf = ([along, up]: Spot) => {
    const column = Math.min(CUTS - 1, Math.max(0, Math.floor(along / wide)));
    const row = Math.min(CUTS - 1, Math.max(0, Math.floor(up / tall)));
    return { column, row, across: along / wide - column, rise: up / tall - row };
  };
  const rock = (spot: Spot) => {
    const { column, row, across, rise } = quadOf(spot);
    const corner = (step: number, lift: number) => lattice[column + step]?.[row + lift] ?? 0;
    const bulge =
      across >= rise
        ? corner(0, 0) + across * (corner(1, 0) - corner(0, 0)) + rise * (corner(1, 1) - corner(1, 0))
        : corner(0, 0) + rise * (corner(0, 1) - corner(0, 0)) + across * (corner(1, 1) - corner(0, 1));
    return bulge * bulgeShare(spans, spot);
  };
  const point = (spot: Spot): Point => {
    const [x, y] = onLine(spot[0]);
    const bulge = rock(spot);
    return [x + east * bulge, y + south * bulge, spot[1]];
  };
  const steps = (length: number) => Array.from({ length: CUTS + 1 }, (_unused, step) => step * length);
  const alongs = cutsOf(
    steps(wide),
    spans.flatMap(({ from, to }) => [
      from - FLAT_PAD_M - FLAT_EASE_M,
      from - FLAT_PAD_M,
      to + FLAT_PAD_M,
      to + FLAT_PAD_M + FLAT_EASE_M,
    ]),
    where.cell,
  );
  const ups = cutsOf(
    steps(tall),
    spans.flatMap(({ top }) => [top, top + FLAT_EASE_M]),
    high,
  );
  const facing: Point = [-east, -south, 0];
  for (let cutAlong = 0; cutAlong + 1 < alongs.length; cutAlong++)
    for (let cutUp = 0; cutUp + 1 < ups.length; cutUp++) {
      const [left = 0, right = 0] = [alongs[cutAlong], alongs[cutAlong + 1]];
      const [low = 0, top = 0] = [ups[cutUp], ups[cutUp + 1]];
      const piece: Spot[] = [
        [left, low],
        [right, low],
        [right, top],
        [left, top],
      ];
      const { column, row } = quadOf([(left + right) / 2, (low + top) / 2]);
      // Which side of its quad's diagonal a spot lies on: the two triangles the lattice lays flat.
      const side = ([along, up]: Spot) => along / wide - column - (up / tall - row);
      for (const sign of [1, -1]) {
        const part = clipped(piece, (spot) => sign * side(spot));
        for (let corner = 1; corner + 1 < part.length; corner++) {
          const [first, second, third] = [part[0], part[corner], part[corner + 1]] as [Spot, Spot, Spot];
          const area = (second[0] - first[0]) * (third[1] - first[1]) - (third[0] - first[0]) * (second[1] - first[1]);
          if (Math.abs(area) < 1e-9) continue;
          const corners = [first, second, third].map(point);
          mesh.tri(picture, corners, facing, corners.map(uvOf(facing, high)));
        }
      }
    }
}
