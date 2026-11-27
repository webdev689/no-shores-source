// What joins a dungeon's storeys, as the mesh draws it: its flights (`dungeonFlights.ts`), and its open air, a hall
// rising through the storey over it. Under open air the hall keeps its floor but no ceiling; its walls go on up to
// the open air's ceiling where rock stands beside it on both storeys, up to the gallery's floor where a gallery
// stands over the rock, and from the next room's ceiling up where a room stands beside it; a gallery's edge over the
// open air is closed by its balustrade, waist high, unless a kit's balustrade stands there.
import type { MeshBuilder } from '../models/model.ts';
import { closeEdge, ceilingHeights } from './dungeonCeilings.ts';
import { flightsMesh } from './dungeonFlights.ts';
import { type DungeonLayout, floorOf, ROCK, SIDE_STEPS, STAIR, storeysOf, VOID } from './dungeonLayout.ts';
import { box, face, type Kitted, lookAt, ROLE, wall } from './dungeonMesh.ts';

type Point = readonly [number, number, number];

/** A gallery's balustrade, metres: its height (a body's waist, which a body climbs) and how deep it stands on the
 *  gallery's floor from the edge; its plinth's and its rail's height, and its balusters, how many to a cell and how
 *  wide. The rules stand a solid of its height and depth along the edge. */
export const BALUSTRADE = { height: 1, depth: 0.25, plinth: 0.15, rail: 0.12, balusters: 7, baluster: 0.12 } as const;

/** What a storey's own drawing leaves to the joins, by its plane's cells: the cells under open air, which keep only
 *  their floor, and the landings' sides that open onto a flight, `cell * 4 + side`; every other side meeting a
 *  flight is walled as rock. */
export interface Joined {
  readonly opened: ReadonlySet<number>;
  readonly landings: ReadonlySet<number>;
}

/** Each storey's joins, by its number. */
export function joinedOn(layout: DungeonLayout): (storey: number) => Joined {
  const plane = layout.columns * layout.rows;
  const kind = (storey: number, cell: number) => layout.cells[storey * plane + cell] ?? ROCK;
  const sideTo = (from: number, to: number) =>
    SIDE_STEPS.findIndex(([east, south]) => from + east + south * layout.columns === to);
  return (storey) => {
    const opened = new Set<number>();
    if (storey > 0) for (let cell = 0; cell < plane; cell++) if (kind(storey - 1, cell) === VOID) opened.add(cell);
    const landings = new Set<number>();
    for (const stair of layout.stairs ?? []) {
      const [first, last] = [stair.cells[0] ?? 0, stair.cells[stair.cells.length - 1] ?? 0];
      if (stair.upper === storey) landings.add(stair.top * 4 + sideTo(stair.top, first));
      if (stair.upper + 1 === storey) landings.add(stair.bottom * 4 + sideTo(stair.bottom, last));
    }
    return { opened, landings };
  };
}

/** The flights and the open air of a layout, drawn into `mesh` at their own heights. */
export function joinsMesh(mesh: MeshBuilder, layout: DungeonLayout, kitted: Kitted): void {
  flightsMesh(mesh, layout, kitted.arches, kitted.courses);
  const plane = layout.columns * layout.rows;
  const heightOf = ceilingHeights(layout);
  const joined = joinedOn(layout);
  const { columns, rows, cell } = layout;
  for (let storey = 1; storey < storeysOf(layout); storey++) {
    const [base, up] = [floorOf(layout, storey), floorOf(layout, storey - 1)];
    const { landings } = joined(storey);
    for (let row = 0; row < rows; row++)
      for (let column = 0; column < columns; column++) {
        const index = row * columns + column;
        const [air, hall] = [(storey - 1) * plane + index, storey * plane + index];
        const hallKind = layout.cells[hall] ?? ROCK;
        if (layout.cells[air] !== VOID || hallKind === ROCK || hallKind === STAIR || hallKind === VOID) continue;
        const top = up + (layout.ceilings[air] ?? 0);
        const [airLook, hallLook] = [lookAt(layout, air), lookAt(layout, hall)];
        const [west, north] = [column * cell, row * cell];
        const square: Point[] = [
          [west, north, top],
          [west + cell, north, top],
          [west + cell, north + cell, top],
          [west, north + cell, top],
        ];
        face(mesh, [airLook.set, ROLE.ceiling], square, [0, 0, -1], top);
        SIDE_STEPS.forEach(([east, south], side) => {
          const [nextColumn, nextRow] = [column + east, row + south];
          const inside = nextColumn >= 0 && nextRow >= 0 && nextColumn < columns && nextRow < rows;
          const next = nextRow * columns + nextColumn;
          const kindOf = (level: number) => (inside ? (layout.cells[level * plane + next] ?? ROCK) : ROCK);
          const [lower, upper] = [kindOf(storey), kindOf(storey - 1)];
          // A flight is open to its landing alone, and open air over rock opens nothing.
          const lowerOpen = lower !== ROCK && (lower !== STAIR || landings.has(index * 4 + side));
          const upperOpen = upper !== ROCK && upper !== STAIR && (upper !== VOID || lowerOpen);
          if (upper === VOID && lowerOpen) return;
          const where = { column, row, side, cell };
          const half = cell / 2;
          const [edgeX, edgeY] = [(column + 0.5) * cell + east * half, (row + 0.5) * cell + south * half];
          const edge = {
            from: [edgeX - south * half, edgeY + east * half] as const,
            to: [edgeX + south * half, edgeY - east * half] as const,
            facing: [-east, -south, 0] as const,
            top,
          };
          if (!lowerOpen) wall(mesh, hallLook, where, [base, upperOpen ? up : top], { foot: true, head: true, top });
          else {
            const ceiling = heightOf(storey * plane + next);
            const reach = upperOpen ? up : top;
            closeEdge(
              mesh,
              [hallLook.set, hallLook.wall],
              edge,
              (x, y) => base + ceiling(x, y),
              () => reach,
            );
          }
          if (!upperOpen || upper === VOID) return;
          const gallery = (storey - 1) * plane + next;
          const step = up + (layout.ceilings[gallery] ?? 0);
          if (step < top) wall(mesh, airLook, where, [step, top], { foot: false, head: true, top });
          if (!kitted.rails?.has(gallery * 4 + ((side + 2) % 4))) balustrade(mesh, layout, gallery, edge, up);
        });
      }
  }
}

/** A gallery's code-drawn balustrade on its edge over open air (`edge` faces into the air), on its floor `floor`: a
 *  plinth, balusters and a rail, in the gallery's trim. */
function balustrade(
  mesh: MeshBuilder,
  layout: DungeonLayout,
  gallery: number,
  edge: { readonly from: readonly [number, number]; readonly to: readonly [number, number]; readonly facing: Point },
  floor: number,
): void {
  const trim = [lookAt(layout, gallery).set, ROLE.trim] as const;
  const [inX, inY] = [-edge.facing[0], -edge.facing[1]];
  // A box along the edge from `start` to `end` of its length (0 to 1), `from` to `to` deep into the gallery.
  const piece = (start: number, end: number, from: number, to: number, low: number, high: number) => {
    const along = (share: number) => [
      edge.from[0] + (edge.to[0] - edge.from[0]) * share,
      edge.from[1] + (edge.to[1] - edge.from[1]) * share,
    ];
    const points = [along(start), along(end)].flatMap(([x = 0, y = 0]) => [
      [x + inX * from, y + inY * from],
      [x + inX * to, y + inY * to],
    ]);
    const [eastings, southings] = [points.map(([x = 0]) => x), points.map(([, y = 0]) => y)];
    box(
      mesh,
      trim,
      [Math.min(...eastings), Math.min(...southings), floor + low],
      [Math.max(...eastings), Math.max(...southings), floor + high],
    );
  };
  const { height, depth, plinth, rail, balusters, baluster } = BALUSTRADE;
  const length = layout.cell;
  piece(0, 1, 0, depth, 0, plinth);
  piece(0, 1, 0, depth, height - rail, height);
  const [inset, thick] = [(depth - baluster) / 2, baluster / length];
  for (let index = 0; index < balusters; index++) {
    const middle = (index + 0.5) / balusters;
    piece(middle - thick / 2, middle + thick / 2, inset, inset + baluster, plinth, height - rail);
  }
}
