// The waters on the held map: each water's name, arched across its sea from its label point and held inside the map,
// its label point where a locked sea's padlock stands, and the places it names, a city that is no port named as the ruins it is. What is lettered is laid out
// (mapLayout.ts) and painted with the parchment's ink (mapLetters.ts).
import { ruinedName } from '../ruinedName.ts';
import type { CoastField } from './coastField.ts';
import type { MapPlace } from './heldMapScene.ts';
import type { AskWaters, WaterJudge } from './heldMapAsk.ts';
import type { Rect } from './heldMapLaw.ts';
import { anyCellUnder, cellsUnder } from './mapKey.ts';
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
 *  sea. */
export function onOwnSea(
  waters: MapWaters,
  field: CoastField,
  view: { readonly left: number; readonly top: number; readonly scale: number },
  box: Rect,
  continent: number,
): 0 | 1 | 2 {
  const land = landCells(waters, field);
  const other = (cell: number) => waters.water[cell] !== continent;
  const middle = { x: box.x + box.width / 2, y: box.y + box.height / 2, width: 0, height: 0 };
  const sameGrid = field.columns === waters.columns && field.rows === waters.rows && field.cellM === waters.cellM;
  if (!sameGrid) {
    if (anyCellUnder(field, view, box, (cell) => land[cell] === 1)) return 0;
    if (!anyCellUnder(waters, view, box, other)) return 2;
    return anyCellUnder(waters, view, middle, other) ? 0 : 1;
  }
  // One grid: a row of the cells asked is passed whole where it holds no land and is all this sea, as most are; else
  // each of its cells is asked, land ending the asking.
  const { landBefore, runs } = rowsOf(waters, field);
  const { columns, rows } = cellsUnder(field, view, box);
  const [first, last] = [columns.cells[0] ?? 0, columns.cells[columns.count - 1] ?? 0];
  const width = field.columns;
  let elsewhere = false;
  for (let index = 0; index < rows.count && columns.count > 0; index++) {
    const row = rows.cells[index] ?? 0;
    const start = row * width + first;
    const landed = (landBefore[row * (width + 1) + last + 1] ?? 0) - (landBefore[row * (width + 1) + first] ?? 0);
    const ownRow = waters.water[start] === continent && (runs[start] ?? 0) > last - first;
    if (landed === 0 && (ownRow || elsewhere)) continue;
    for (let column = 0; column < columns.count; column++) {
      const cell = row * width + (columns.cells[column] ?? 0);
      if (land[cell] === 1) return 0;
      elsewhere ||= other(cell);
    }
  }
  if (!elsewhere) return 2;
  return anyCellUnder(waters, view, middle, other) ? 0 : 1;
}

/** For each row of the grid, how many cells of land (`landCells`) lie before each column, and how many cells from each
 *  on share its water: so a row's run of cells is known free of land, and all one sea, at once. Worked out once for
 *  each pair. */
const ROWS = new WeakMap<
  MapWaters,
  { readonly field: CoastField; readonly landBefore: Int32Array; readonly runs: Int32Array }
>();
function rowsOf(waters: MapWaters, field: CoastField): { readonly landBefore: Int32Array; readonly runs: Int32Array } {
  const kept = ROWS.get(waters);
  if (kept?.field === field) return kept;
  const land = landCells(waters, field);
  const { columns, rows } = field;
  const landBefore = new Int32Array(rows * (columns + 1));
  const runs = new Int32Array(columns * rows);
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const before = row * (columns + 1) + column;
      landBefore[before + 1] = (landBefore[before] ?? 0) + (land[row * columns + column] ?? 0);
    }
    for (let column = columns - 1; column >= 0; column--) {
      const cell = row * columns + column;
      const same = column + 1 < columns && waters.water[cell + 1] === waters.water[cell];
      runs[cell] = same ? (runs[cell + 1] ?? 0) + 1 : 1;
    }
  }
  const made = { field, landBefore, runs };
  ROWS.set(waters, made);
  return made;
}

/** Each cell a sea's name may not stand on, 1 a cell: land on the waters' grid or in the coast field, as the room's
 *  grid and the coasts each have it; worked out once for each pair. */
const LANDS = new WeakMap<MapWaters, { readonly field: CoastField; readonly cells: Uint8Array }>();
function landCells(waters: MapWaters, field: CoastField): Uint8Array {
  const kept = LANDS.get(waters);
  if (kept?.field === field) return kept.cells;
  const cells = new Uint8Array(field.columns * field.rows);
  for (let cell = 0; cell < cells.length; cell++)
    cells[cell] = (waters.water[cell] ?? -1) < 0 || (field.distance[cell] ?? 1) < 0 ? 1 : 0;
  LANDS.set(waters, { field, cells });
  return cells;
}
