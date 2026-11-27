// The waters as the page opens them, once a page: their rules on the room's module, their table, and their grid in
// the held map's terms. The held map's tint, the friendly traffic and the sea's water names all read this one opening.
import { CHART_CELL_M } from '../overworld/worldFrame.ts';
import type { MapWaters } from '../heldmap/watersWash.ts';
import {
  LAND_CELL,
  startWatersRules,
  type WatersGrid,
  type SeaFacts,
  type WatersRules,
  type WatersTable,
} from '../rules/watersRules.ts';
import type { Point2 } from '../overworld/ground.ts';
import { ISLANDS } from './hudLaw.ts';
import { waterNamer, type WaterNamed } from './seaHostiles.ts';
import { type PortCity, portCities, portsOf, type WorldData } from './worldData.ts';

/** The waters as the page opens them once: their rules, their table, and their grid at the held map's own cell in the
 *  map's terms. */
export interface OpenWaters {
  readonly rules: WatersRules;
  readonly table: WatersTable;
  readonly map: MapWaters;
}

/** The waters' table and grid in the held map's terms: each cell's water by index, -1 on land. */
export function mapWatersOf(table: WatersTable, grid: WatersGrid): MapWaters {
  const water = Int16Array.from(grid.cells, (cell) => (cell === LAND_CELL ? -1 : cell));
  const { columns, rows, cellM } = grid;
  return { columns, rows, cellM, water, waters: table.waters, mainPorts: table.mainPorts };
}

/** Opens the waters on the room's module with the world's layout and every city as a port it may sail from. */
export function openWaters(module: WebAssembly.Module, world: WorldData): OpenWaters {
  const rules = startWatersRules(module);
  const table = rules.open(world.layoutText, portsOf(world.cities));
  return { rules, table, map: mapWatersOf(table, rules.grid(CHART_CELL_M)) };
}

/** Opens the waters once the room's module has come, off the next frame (about 0.6 s in WebAssembly), so the first
 *  frame is not held up. Everything that reads the waters awaits this one opening. */
export function watersOnce(module: Promise<WebAssembly.Module>, world: WorldData): Promise<OpenWaters> {
  return new Promise<void>((frame) => requestAnimationFrame(() => setTimeout(frame)))
    .then(() => module)
    .then((compiled) => openWaters(compiled, world));
}

/** The locked seas, those of the islands not yet named (`ISLANDS`), which no voyage is planned into: whether a point
 *  lies in one by the waters' exact rule, the room's own, for a course's end; and by the grid of 4.8 km cells, cheap
 *  enough for every cell of a route's mask, for a route's way there. */
export interface SeaLock {
  at(point: Point2): boolean;
  cell(x: number, y: number): boolean;
}

/** No sea locked: before the waters are open. */
export const NO_LOCK: SeaLock = { at: () => false, cell: () => false };

/** The locked seas of the opened waters, the islands named by `names`. */
export function seaLockOf(open: OpenWaters, names: Readonly<Record<string, string>> = ISLANDS): SeaLock {
  const locked = open.table.waters.map((water) => !Object.hasOwn(names, water.id));
  const { columns, rows, cellM, water } = open.map;
  return {
    at: (point) => {
      const here = open.rules.waterAt(point);
      return here !== null && (locked[here.continent] ?? false);
    },
    cell: (x, y) => {
      const [column, row] = [Math.floor(x / cellM), Math.floor(y / cellM)];
      if (column < 0 || row < 0 || column >= columns || row >= rows) return false;
      return locked[water[row * columns + column] ?? -1] ?? false;
    },
  };
}

/** The sea's facts as the page gives them: its rules', the locked seas, and the port cities' roadsteads, which the
 *  room repairs by. */
export type PageSeaFacts = SeaFacts & { readonly locked: SeaLock; readonly roadsteads: readonly Point2[] };

/** What the sea reads of the page's waters: the water at a point, named, the port cities, in the sea's order, and the
 *  sea's facts its rules give, with the locked seas. */
export function seaWatersOf(
  open: OpenWaters,
  world: WorldData,
): {
  readonly waterAt: (point: Point2) => WaterNamed | null;
  readonly ports: readonly PortCity[];
  readonly facts: PageSeaFacts;
} {
  const locked = seaLockOf(open);
  return {
    waterAt: waterNamer(open.rules, open.table),
    ports: portCities(portsOf(world.cities), open.table.mainPorts),
    facts: {
      ...open.table.sea,
      locked,
      // A port in a locked sea repairs nothing (crates/room/src/harbour.rs `Harbours::in_reach`).
      roadsteads: open.table.ports
        .map(({ roadstead }): Point2 => [roadstead[0], roadstead[1]])
        .filter((roadstead) => !locked.at(roadstead)),
    },
  };
}
