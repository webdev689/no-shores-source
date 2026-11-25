// The regions of an island on the held map at sea
// ([[Each Island Has Three Regions, and Saltmere's Three Patrol Zones Stay, Linked]]): every island is cut into
// three, each point of its land (inside its outline) in the region of that island whose centre is nearest
// (`content/world/regions.json`). The regions of the island whose waters the ship is in light as the pointer passes
// over their land, named in the waters' own letters, and a click on one sets a course to its anchorage.
import type { Point2 } from '../overworld/ground.ts';
import type { MapRegion } from '../overworld/regions.ts';
import type { HoverSaid, WaterJudge } from './heldMapAsk.ts';
import { fontOf, type Painter, word } from './mapLetters.ts';
import { INK } from './mapKey.ts';
import type { MapWaters } from './watersWash.ts';

/** The region whose centre is nearest a point, of those given. */
function nearest(regions: readonly MapRegion[], [x, y]: Point2): MapRegion | null {
  let best: MapRegion | null = null;
  let bestApart = Number.POSITIVE_INFINITY;
  for (const region of regions) {
    const apart = Math.hypot(region.centre[0] - x, region.centre[1] - y);
    if (apart < bestApart) [best, bestApart] = [region, apart];
  }
  return best;
}

/** The cells of the waters' grid whose middles lie inside `outline`, a byte each (1 inside), laid a row at a time by
 *  where the outline crosses it (even-odd); kept for each outline while the grid is the same. */
const insides = new WeakMap<readonly Point2[], { readonly waters: MapWaters; readonly cells: Uint8Array }>();
function insideCells(waters: MapWaters, outline: readonly Point2[]): Uint8Array {
  const kept = insides.get(outline);
  if (kept?.waters === waters) return kept.cells;
  const { columns, rows, cellM } = waters;
  const cells = new Uint8Array(columns * rows);
  for (let row = 0; row < rows; row++) {
    const y = (row + 0.5) * cellM;
    const crossings = outline.flatMap(([fromX, fromY], index) => {
      const [toX, toY] = outline[(index + 1) % outline.length] ?? [fromX, fromY];
      return fromY > y !== toY > y ? [fromX + ((y - fromY) / (toY - fromY)) * (toX - fromX)] : [];
    });
    crossings.sort((first, second) => first - second);
    for (let pair = 0; pair + 1 < crossings.length; pair += 2) {
      const west = Math.max(0, Math.ceil((crossings[pair] ?? 0) / cellM - 0.5));
      const east = Math.min(columns, Math.ceil((crossings[pair + 1] ?? 0) / cellM - 0.5));
      cells.fill(1, row * columns + west, row * columns + Math.max(west, east));
    }
  }
  insides.set(outline, { waters, cells });
  return cells;
}

/** The cell of the waters' grid a point lies in; null off the grid. */
function cellOf(waters: MapWaters, [x, y]: Point2): number | null {
  const [column, row] = [Math.floor(x / waters.cellM), Math.floor(y / waters.cellM)];
  if (column < 0 || row < 0 || column >= waters.columns || row >= waters.rows) return null;
  return row * waters.columns + column;
}

/** The region of the island `island` whose land lies under a point: a cell of land inside the island's outline, in
 *  the region of the island's own whose centre is nearest; none over the sea or another island's land. */
export function regionAt(
  waters: MapWaters,
  regions: readonly MapRegion[],
  island: string | null,
  point: Point2,
): MapRegion | null {
  const cell = cellOf(waters, point);
  if (island === null || cell === null || (waters.water[cell] ?? -1) >= 0) return null;
  const own = regions.filter((region) => region.island === island);
  return insideCells(waters, own[0]?.outline ?? [])[cell] ? nearest(own, point) : null;
}

/** A byte a cell of the waters' grid, 255 over the land of `region`; all 0 for none. */
export function regionCells(waters: MapWaters, regions: readonly MapRegion[], region: MapRegion | null): Uint8Array {
  const { columns, rows, cellM, water } = waters;
  const lit = new Uint8Array(columns * rows);
  if (!region) return lit;
  const inside = insideCells(waters, region.outline);
  const own = regions.filter((each) => each.island === region.island);
  for (let row = 0; row < rows; row++)
    for (let column = 0; column < columns; column++) {
      const cell = row * columns + column;
      if (!inside[cell] || (water[cell] ?? -1) >= 0) continue;
      if (nearest(own, [(column + 0.5) * cellM, (row + 0.5) * cellM]) === region) lit[cell] = 255;
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
    // While the waters are away (a pan, the land's map), the region lit stays lit, and is judged again after.
    if (!waters) return null;
    const inked = ask.pointer && { x: ask.pointer.x - ink.x, y: ask.pointer.y - ink.y };
    const world = inked && [view.left + inked.x / view.scale, view.top + inked.y / view.scale];
    const region = world && inked ? this.under(waters, ship, world) : null;
    if (region === (this.lit?.region ?? null)) return region ? null : water;
    this.lit = region && inked ? { region, ...inked } : null;
    return region ? regionCells(waters.waters, this.all, region) : ask.cellsNow(waters.waters);
  }

  /** The lit region's name as the map letters it, where the pointer came into it; none for none. */
  said(): HoverSaid | null {
    return this.lit && { line: this.lit.region.name, x: this.lit.x, y: this.lit.y, region: true };
  }
}
