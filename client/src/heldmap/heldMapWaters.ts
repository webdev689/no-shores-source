// The waters on the held map: each water's name, arched across its sea from its label point and held inside the map,
// its label point where a locked sea's padlock stands, and the places it names, a city that is no port named as the ruins it is. What is lettered is laid out
// (mapLayout.ts) and painted with the parchment's ink (mapLetters.ts).
import { ruinedName } from '../ruinedName.ts';
import type { CoastField } from './coastField.ts';
import type { MapPlace } from './heldMapScene.ts';
import type { AskWaters, WaterJudge } from './heldMapAsk.ts';
import type { Rect } from './heldMapLaw.ts';
import { type HomeReach, labelPoints, type MapWaters, washOf, type WatersWash } from './watersWash.ts';

/** The places the map names, a city that is no port named and marked as the ruins it is; before the waters are open,
 *  as they come. */
export function ruinedPlaces(places: readonly MapPlace[], mainPorts: readonly string[] | null): MapPlace[] {
  if (!mainPorts) return [...places];
  return places.map((place) => {
    const city = place.kind === 'port' && place.id.endsWith('-port') ? place.id.slice(0, -'-port'.length) : null;
    return city !== null && !mainPorts.includes(city)
      ? { ...place, kind: 'ruin', name: ruinedName(place.name) }
      : place;
  });
}

/** The waters as the map keeps them: their label points, worked out once, their letters and the key. */
/** How far apart the points a water's name is tried at are, ink pixels. */
const SPOT_PX = 10;

export class HeldMapWaters implements AskWaters {
  readonly waters: MapWaters;
  /** The water at a point by the exact rule, the room's, and who holds the sea there. */
  readonly judge: WaterJudge;
  readonly travelShortM: number;
  /** How far home waters reach on the grid's cells, past which their open sea is the Grey Tithe's. */
  readonly reach?: HomeReach;
  private readonly points: Map<number, readonly [number, number]>;

  constructor(waters: MapWaters, judge: WaterJudge, travelShortM: number, reach?: HomeReach) {
    [this.waters, this.judge, this.travelShortM, this.reach] = [waters, judge, travelShortM, reach];
    this.points = labelPoints(waters);
  }

  /** The wash over every water, home waters' open sea past their reach the Grey Tithe's. */
  wash(): WatersWash {
    return washOf(this.waters, this.reach);
  }

  /** The waters in view on a map `ink` wide and high (`toWorld` the world point at a point of it, `toInk`
   *  the reverse): each water's name, its island's id, its label point while it is on the map (else null), and the
   *  spots its name may stand at, ink pixels: its label point first while it is on the map, then every point of a grid
   *  `SPOT_PX` apart over the map that lies on its sea, nearest the middle of its sea in view first. */
  letters(
    ink: { readonly width: number; readonly height: number },
    toInk: (x: number, y: number) => readonly [number, number],
    toWorld: (x: number, y: number) => readonly [number, number],
  ): {
    text: string;
    continent: number;
    id: string;
    point: { x: number; y: number } | null;
    spots: { x: number; y: number }[];
  }[] {
    const { columns, rows, cellM } = this.waters;
    const seen = new Map<number, { x: number; y: number }[]>();
    for (let y = SPOT_PX / 2; y < ink.height; y += SPOT_PX)
      for (let x = SPOT_PX / 2; x < ink.width; x += SPOT_PX) {
        const [east, south] = toWorld(x, y);
        const [column, row] = [Math.floor(east / cellM), Math.floor(south / cellM)];
        if (column < 0 || row < 0 || column >= columns || row >= rows) continue;
        const water = this.waters.water[row * columns + column] ?? -1;
        if (water < 0) continue;
        const spots = seen.get(water) ?? [];
        spots.push({ x, y });
        seen.set(water, spots);
      }
    return this.waters.waters.flatMap((water) => {
      const grid = seen.get(water.continent);
      if (!grid) return [];
      const middle = grid.reduce(
        (sum, spot) => ({ x: sum.x + spot.x / grid.length, y: sum.y + spot.y / grid.length }),
        {
          x: 0,
          y: 0,
        },
      );
      const spots = grid
        .map((spot) => ({ spot, away: Math.hypot(spot.x - middle.x, spot.y - middle.y) }))
        .sort((one, other) => one.away - other.away)
        .map(({ spot }) => spot);
      const label = this.points.get(water.continent);
      const [x, y] = label ? toInk(label[0], label[1]) : [-1, -1];
      const point = x >= 0 && y >= 0 && x <= ink.width && y <= ink.height ? { x, y } : null;
      if (point) spots.unshift(point);
      return [{ text: water.name ?? water.id, continent: water.continent, id: water.id, point, spots }];
    });
  }
}

/** How a water's name in `box` (ink pixels), the map showing `view`, stands on the sea of the water whose continent's
 *  index is `continent`: 2 wholly on it; 1 on no land of any island (`field`), known or not, with its middle on it,
 *  as across a sea too narrow for its name seen whole, where it runs over a neighbour's wash; 0 over land or off its
 *  sea. Each cell under the box is asked, as `anyCellUnder` asks them where its steps are finer than a cell, in four
 *  reads of a table summed once a grid (`CellSums`): a layout asks this some 18,000 times. */
export function onOwnSea(
  waters: MapWaters,
  field: CoastField,
  view: { readonly left: number; readonly top: number; readonly scale: number },
  box: Rect,
  continent: number,
): 0 | 1 | 2 {
  const sums = sumsOf(waters, field);
  if (sums.land.anyUnder(view, box)) return 0;
  const offSea = sums.offSea(continent);
  if (!offSea.anyUnder(view, box)) return 2;
  const middle = { x: box.x + box.width / 2, y: box.y + box.height / 2, width: 0, height: 0 };
  return offSea.anyUnder(view, middle) ? 0 : 1;
}

/** How many cells of a grid pass a test, summed from its top-left, so whether any cell in a rectangle passes is four
 *  reads. */
export class CellSums {
  private readonly grid: { readonly columns: number; readonly rows: number; readonly cellM: number };
  private readonly sums: Int32Array;

  constructor(
    grid: { readonly columns: number; readonly rows: number; readonly cellM: number },
    test: (cell: number) => boolean,
  ) {
    this.grid = grid;
    const { columns, rows } = grid;
    const across = columns + 1;
    this.sums = new Int32Array(across * (rows + 1));
    for (let row = 0; row < rows; row++) {
      let line = 0;
      for (let column = 0; column < columns; column++) {
        line += test(row * columns + column) ? 1 : 0;
        this.sums[(row + 1) * across + column + 1] = (this.sums[row * across + column + 1] ?? 0) + line;
      }
    }
  }

  /** Whether any cell under `box` (ink pixels), the map showing `view`, passes; cells off the grid are not asked. */
  anyUnder(view: { readonly left: number; readonly top: number; readonly scale: number }, box: Rect): boolean {
    const { columns, rows, cellM } = this.grid;
    const cell = (ink: number, from: number) => Math.floor((from + ink / view.scale) / cellM);
    const [left, right] = [cell(box.x, view.left), cell(box.x + box.width, view.left)];
    const [top, bottom] = [cell(box.y, view.top), cell(box.y + box.height, view.top)];
    const [first, last] = [Math.max(0, left), Math.min(columns - 1, right)];
    const [high, low] = [Math.max(0, top), Math.min(rows - 1, bottom)];
    if (first > last || high > low) return false;
    const across = columns + 1;
    const sum = (row: number, column: number) => this.sums[row * across + column] ?? 0;
    return sum(low + 1, last + 1) - sum(high, last + 1) - sum(low + 1, first) + sum(high, first) > 0;
  }
}

/** A grid's sums for the names' test: its land, an island's (`field`) or no water's, and each continent's off-sea
 *  cells, made as first asked. */
interface SeaSums {
  readonly field: CoastField;
  readonly land: CellSums;
  offSea(continent: number): CellSums;
}

const SEA_SUMS = new WeakMap<MapWaters, SeaSums>();

function sumsOf(waters: MapWaters, field: CoastField): SeaSums {
  const kept = SEA_SUMS.get(waters);
  if (kept?.field === field) return kept;
  const land = new CellSums(field, (cell) => (waters.water[cell] ?? -1) < 0 || (field.distance[cell] ?? 1) < 0);
  const seas = new Map<number, CellSums>();
  const made: SeaSums = {
    field,
    land,
    offSea(continent) {
      let sums = seas.get(continent);
      if (!sums) seas.set(continent, (sums = new CellSums(waters, (cell) => waters.water[cell] !== continent)));
      return sums;
    },
  };
  SEA_SUMS.set(waters, made);
  return made;
}
