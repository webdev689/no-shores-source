// The regions of an island on the held map at sea
// ([[Each Island Has Three Regions, and Saltmere's Three Patrol Zones Stay, Linked]]): every island is cut into
// three, each point of its land in the region whose centre is nearest (`content/world/regions.json`). The regions of
// the island whose waters the ship is in light as the pointer passes over their land, named in the waters' own
// letters, and a click on one sets a course to its anchorage.
import type { Point2 } from '../overworld/ground.ts';
import type { HoverSaid, WaterJudge } from './heldMapAsk.ts';
import { fontOf, type Painter, word } from './mapLetters.ts';
import { INK } from './mapKey.ts';
import type { MapWaters } from './watersWash.ts';

/** One region as the map knows it: the island it is of (its continent's id), its name, its centre and the anchorage a
 *  ship sails for, 3 km off its coast where the coast is nearest its centre. */
export interface MapRegion {
  readonly island: string;
  readonly name: string;
  readonly centre: Point2;
  readonly anchorage: Point2;
}

/** The regions of `content/world/regions.json`, island by island. */
export function regionsOf(text: string): MapRegion[] {
  const islands = JSON.parse(text) as {
    readonly island: string;
    readonly regions: readonly { name: string; centre: Point2; anchorage: Point2 }[];
  }[];
  return islands.flatMap(({ island, regions }) =>
    regions.map(({ name, centre, anchorage }) => ({ island, name, centre, anchorage })),
  );
}

/** The region whose centre is nearest a point, of every island's. */
function nearest(regions: readonly MapRegion[], [x, y]: Point2): MapRegion | null {
  let best: MapRegion | null = null;
  let bestApart = Number.POSITIVE_INFINITY;
  for (const region of regions) {
    const apart = Math.hypot(region.centre[0] - x, region.centre[1] - y);
    if (apart < bestApart) [best, bestApart] = [region, apart];
  }
  return best;
}

/** Whether the waters' grid reads a point as land. */
function onLand(waters: MapWaters, [x, y]: Point2): boolean {
  const [column, row] = [Math.floor(x / waters.cellM), Math.floor(y / waters.cellM)];
  if (column < 0 || row < 0 || column >= waters.columns || row >= waters.rows) return false;
  return (waters.water[row * waters.columns + column] ?? -1) < 0;
}

/** The region of the island `island` whose land lies under a point; none over the sea or another island's land. */
export function regionAt(
  waters: MapWaters,
  regions: readonly MapRegion[],
  island: string | null,
  point: Point2,
): MapRegion | null {
  if (island === null || !onLand(waters, point)) return null;
  const region = nearest(regions, point);
  return region?.island === island ? region : null;
}

/** A byte a cell of the waters' grid, 255 over the land of `region`; all 0 for none. */
export function regionCells(waters: MapWaters, regions: readonly MapRegion[], region: MapRegion | null): Uint8Array {
  const { columns, rows, cellM, water } = waters;
  const lit = new Uint8Array(columns * rows);
  if (!region) return lit;
  for (let row = 0; row < rows; row++)
    for (let column = 0; column < columns; column++) {
      if ((water[row * columns + column] ?? -1) >= 0) continue;
      if (nearest(regions, [(column + 0.5) * cellM, (row + 0.5) * cellM]) === region) lit[row * columns + column] = 255;
    }
  return lit;
}

/** Paints a region's name as a water's is lettered, in the waters' face and the map's ink, centred at `x`, `y` (ink
 *  units, in the painter's ink transform, `scale` the lettering's). */
export function paintRegion(painter: Painter, name: string, x: number, y: number, scale: number): void {
  painter.save();
  painter.translate(x, y);
  painter.scale(scale, scale);
  painter.font = fontOf('water');
  painter.textAlign = 'center';
  painter.textBaseline = 'middle';
  word(painter, name, 0, 0, INK);
  painter.restore();
}

/** The regions on the map at sea: every island's, and the one of the ship's island lit under the pointer, with where
 *  its name stands (ink units). */
export class MapRegions {
  all: readonly MapRegion[] = [];
  lit: { readonly region: MapRegion; readonly x: number; readonly y: number } | null = null;

  /** The region of the ship's island (at `ship`, judged by the waters' rules) whose land lies under a world point. */
  under(
    waters: { readonly waters: MapWaters; readonly judge: WaterJudge } | null,
    ship: Point2,
    point: readonly number[],
  ): MapRegion | null {
    if (!waters) return null;
    const own = waters.judge(ship);
    const island = waters.waters.waters.find((water) => water.continent === own)?.id ?? null;
    return regionAt(waters.waters, this.all, island, [point[0] ?? 0, point[1] ?? 0]);
  }

  /** The cells to light as the pointer (`ask.pointer`, screen pixels, on the map `ink` showing `view`) moves: a
   *  region's land as it comes into one, the water `ask` lights under the pointer again as it leaves (or `water`, the
   *  cells `ask` answered this frame, while no region is lit); null while nothing changes. */
  hover(
    waters: { readonly waters: MapWaters; readonly judge: WaterJudge } | null,
    ship: Point2,
    view: { readonly left: number; readonly top: number; readonly scale: number },
    ink: { readonly x: number; readonly y: number },
    ask: {
      readonly pointer: { readonly x: number; readonly y: number } | null;
      cellsNow(waters: MapWaters): Uint8Array;
    },
    water: Uint8Array | null,
  ): Uint8Array | null {
    const inked = ask.pointer && { x: ask.pointer.x - ink.x, y: ask.pointer.y - ink.y };
    const world = inked && [view.left + inked.x / view.scale, view.top + inked.y / view.scale];
    const region = world && inked ? this.under(waters, ship, world) : null;
    if (region === (this.lit?.region ?? null)) return region ? null : water;
    this.lit = region && inked ? { region, ...inked } : null;
    if (!waters) return null;
    return region ? regionCells(waters.waters, this.all, region) : ask.cellsNow(waters.waters);
  }

  /** The lit region's name as the map letters it, where the pointer came into it; none for none. */
  said(): HoverSaid | null {
    return this.lit && { line: this.lit.region.name, x: this.lit.x, y: this.lit.y, region: true };
  }
}
