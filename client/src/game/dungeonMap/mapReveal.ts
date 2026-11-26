// What of a dungeon its map draws: the cells the player has walked or seen. The feet are read five times a second onto
// a metre's grid (the walked trail), a step between two reads walked through where it is short enough to be a walk;
// from each metre newly walked, sight is cast across the floor all round, stopped by rock, by a solid standing over
// the rise a body sees over, or by the floor rising more than that from one cell to the next. Sight goes down a flight
// onto the storey under and across open air, never up a flight nor onto the storey over.
import type { DungeonLayout } from '../dungeonLayout.ts';
import { cellIndex, floorAt, kindAt, storeyOfHeight, type Storeys } from './mapStoreys.ts';

type Point = readonly [number, number, number];

/** How the trail is read and sight cast: the trail's metre, how often the feet are read (s), the longest step between
 *  two reads that is walked (m), how far sight reaches (m), along how many lines, a sample every `sightStep` (m), and
 *  the rise sight passes over (m). */
export const REVEAL = { trailM: 1, everyS: 0.2, fillM: 3, sightM: 20, rays: 144, sightStep: 0.5, rise: 1.2 } as const;

/** A solid as sight meets it: its footprint and the heights it stands between (m). */
type Solid = { minX: number; minY: number; maxX: number; maxY: number; bottom: number; top: number };

/** A layout's solids, each box's footprint, bottom and top. */
function solidsOf(layout: DungeonLayout): Solid[] {
  return layout.boxes.map(([minX, minY, maxX, maxY, bottom, top]) => ({ minX, minY, maxX, maxY, bottom, top }));
}

/** The walked and seen cells of one dungeon, storey-major, and the trail they were found from. */
export class Reveal {
  /** Each cell walked or seen, by its storey-major index. */
  readonly cells: Set<number>;
  /** Each metre walked, as `east,south,height` (the height to the half metre). */
  readonly walked = new Set<string>();
  private readonly layout: DungeonLayout;
  private readonly storeys: Storeys;
  /** The solids each cell of the plane holds some of, for sight to meet. */
  private readonly solids = new Map<number, Solid[]>();
  private last: Point | null = null;
  private since = 0;

  constructor(layout: DungeonLayout, storeys: Storeys, kept: readonly number[] = []) {
    this.layout = layout;
    this.storeys = storeys;
    this.cells = new Set(kept);
    const cell = layout.cell;
    for (const solid of solidsOf(layout))
      for (let row = Math.floor(solid.minY / cell); row * cell < solid.maxY; row++)
        for (let column = Math.floor(solid.minX / cell); column * cell < solid.maxX; column++) {
          const plane = row * layout.columns + column;
          this.solids.set(plane, [...(this.solids.get(plane) ?? []), solid]);
        }
  }

  /** `seconds` on, the feet at `feet`: read them when it is time, and answer whether anything new is drawn. */
  tick(feet: Point, seconds: number): boolean {
    this.since += seconds;
    if (this.since < REVEAL.everyS) return false;
    this.since = 0;
    const last = this.last;
    this.last = feet;
    let found = false;
    const step = last ? Math.hypot(feet[0] - last[0], feet[1] - last[1], feet[2] - last[2]) : 0;
    if (last && step > REVEAL.trailM && step <= REVEAL.fillM) {
      const steps = Math.ceil(step / (REVEAL.trailM / 2));
      for (let each = 1; each < steps; each++) {
        const share = each / steps;
        const between: Point = [
          last[0] + (feet[0] - last[0]) * share,
          last[1] + (feet[1] - last[1]) * share,
          last[2] + (feet[2] - last[2]) * share,
        ];
        found = this.walk(between) || found;
      }
    }
    return this.walk(feet) || found;
  }

  /** Marks the metre under `feet` walked; a metre new to the trail marks its cell and casts sight from it. */
  private walk(feet: Point): boolean {
    const key = `${Math.floor(feet[0] / REVEAL.trailM)},${Math.floor(feet[1] / REVEAL.trailM)},${Math.round(feet[2] * 2) / 2}`;
    if (this.walked.has(key)) return false;
    this.walked.add(key);
    const size = this.cells.size;
    const storey = storeyOfHeight(this.storeys, feet[2]);
    const [column, row] = [Math.floor(feet[0] / this.layout.cell), Math.floor(feet[1] / this.layout.cell)];
    if (kindAt(this.layout, this.storeys, storey, column, row) !== 'rock') this.see(storey, column, row);
    for (let ray = 0; ray < REVEAL.rays; ray++) this.cast(feet, storey, (ray / REVEAL.rays) * Math.PI * 2);
    return this.cells.size > size;
  }

  /** Marks a cell of `storey` seen; a flight's cell on both the storeys it joins. */
  private see(storey: number, column: number, row: number): void {
    const plane = row * this.layout.columns + column;
    this.cells.add(cellIndex(this.layout, storey, column, row));
    if (kindAt(this.layout, this.storeys, storey, column, row) !== 'stair') return;
    const flight = this.storeys.stairs.find((stair) => stair.cells.includes(plane));
    if (flight)
      for (const each of [flight.upper, flight.upper + 1]) this.cells.add(cellIndex(this.layout, each, column, row));
  }

  /** Casts one line of sight from `feet` on `storey` along `bearing` (radians from east toward south). */
  private cast(feet: Point, startStorey: number, bearing: number): void {
    const { layout, storeys } = this;
    const [east, south] = [Math.cos(bearing), Math.sin(bearing)];
    let [lastColumn, lastRow] = [Math.floor(feet[0] / layout.cell), Math.floor(feet[1] / layout.cell)];
    // Cast from the floor under the feet: a flight's where they stand on one.
    const under = floorAt(layout, storeys, startStorey, lastColumn, lastRow);
    let [storey, floor] = [startStorey, under ?? storeys.floors[startStorey] ?? 0];
    for (let reach = REVEAL.sightStep; reach <= REVEAL.sightM; reach += REVEAL.sightStep) {
      const [x, y] = [feet[0] + east * reach, feet[1] + south * reach];
      const [column, row] = [Math.floor(x / layout.cell), Math.floor(y / layout.cell)];
      if (this.blocked(x, y, row * layout.columns + column, floor)) return;
      if (column === lastColumn && row === lastRow) continue;
      [lastColumn, lastRow] = [column, row];
      const kind = kindAt(layout, storeys, storey, column, row);
      if (kind === 'rock') return;
      const here = floorAt(layout, storeys, storey, column, row);
      if (here !== null && here > floor + REVEAL.rise) return;
      this.see(storey, column, row);
      if (here !== null) floor = here;
      // Past a flight's middle the storey under is the one walked on.
      if (kind === 'stair' && floor < (storeys.floors[storey] ?? 0) - storeys.storeyM / 2) storey += 1;
    }
  }

  /** Whether a solid in plane cell `plane` stands at (`x`, `y`) over the rise sight passes over, from `floor`. */
  private blocked(x: number, y: number, plane: number, floor: number): boolean {
    const eye = floor + REVEAL.rise;
    return (this.solids.get(plane) ?? []).some(
      (solid) =>
        x >= solid.minX &&
        x < solid.maxX &&
        y >= solid.minY &&
        y < solid.maxY &&
        solid.bottom <= eye &&
        solid.top > eye,
    );
  }
}
