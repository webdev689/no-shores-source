/**
 * The sea's nine waters and its friendly traffic, from the room's WebAssembly module (`room.wasm`), whose rules live
 * in the world crate (`crates/world/src/waters.rs`, `traffic.rs`). Open once with the layout's text and the nine
 * ports the page already holds; then ask the water at a point, the waters over the whole frame as bytes for the held
 * map, and the friendly ships near a point at a world time. A water's holder is one of `WaterHolder`.
 */

import type { Swell } from './landRules.ts';

type Point = readonly [number, number];

export type WaterHolder = 'home' | 'grey-tithe' | 'lattice';

/** One island's water: its continent's index and id in the layout, its name, holder and level band. */
export interface WaterInfo {
  readonly continent: number;
  readonly id: string;
  readonly name: string | null;
  readonly holder: WaterHolder;
  readonly levels: readonly [number, number] | null;
}

/** A port as the page passes it in: its city's id and name, its continent's id, and its centre in metres. */
export interface PortInfo {
  readonly id: string;
  readonly name: string;
  readonly continent: string;
  readonly centre: Point;
}

/** A route between two port cities (indices into the table's `ports`), from roadstead to roadstead, in whole metres. */
export interface TrafficRoute {
  readonly fromPort: number;
  readonly toPort: number;
  readonly lengthM: number;
  readonly path: readonly Point[];
}

/** A port city the traffic sails from: its city's id and name, and its roadstead, where its ships come and go. */
export interface TrafficPort {
  readonly id: string;
  readonly name: string;
  readonly roadstead: Point;
}

/** What opening answers: the waters, which waters touch, the port cities' ids (every other city is desolate), those
 *  of the ports passed in that are port cities, in the order given, and the routes between every pair of them. */
export interface WatersTable {
  readonly waters: readonly WaterInfo[];
  readonly borders: readonly (readonly [number, number])[];
  readonly mainPorts: readonly string[];
  readonly ports: readonly TrafficPort[];
  readonly routes: readonly TrafficRoute[];
  /** The pace every friendly ship keeps, m/s. */
  readonly friendlySpeedMS: number;
  readonly sea: SeaFacts;
}

/** The sea's rules the page reads beside its waters: the reach a hostile ship meets a player within and the furthest
 *  one may hold a voyage, metres; the reach of a port city's repairs, metres; and each ship's name by its faction's
 *  number and then its hull's (crates/naval/src/ranks.rs `ship_name`). */
export interface SeaFacts {
  readonly engageM: number;
  readonly holdReachM: number;
  readonly repairReachM: number;
  readonly shipNames: readonly (readonly string[])[];
}

/** The water at a point of sea: its continent's index and its holder. */
export interface WaterAtPoint {
  readonly continent: number;
  readonly holder: WaterHolder;
}

/** The waters at the middle of each cell over the frame, row by row from the north-west: `cells[row * columns +
 *  column]` holds the continent's index for sea, and `LAND_CELL` for land. */
export interface WatersGrid {
  readonly columns: number;
  readonly rows: number;
  readonly cellM: number;
  readonly cells: Uint8Array;
}

/** A friendly ship at one moment. `hull` is 0 sloop, 1 schooner, 2 brig, 3 frigate; `direction` is the unit way it
 *  sails; ports are indices into the table's `ports`. */
export interface TrafficShip {
  readonly id: number;
  readonly route: number;
  readonly fromPort: number;
  readonly toPort: number;
  readonly hull: number;
  readonly position: Point;
  readonly direction: Point;
  readonly progressM: number;
  readonly lengthM: number;
}

/** The swell under the weather at a point (crates/room-wasm/src/sea_door.rs `swell_json`): its waves, as the land's
 *  door gives them, and how the sea stands there: the wind (m/s east and south), the sea state (0 calm to 1 storm),
 *  the share of the open sea's swell its fetch leaves, how much of a roadstead's calm holds, and the swell's height as
 *  a share of a moderate sea's. */
export interface WeatherSwell extends Swell {
  readonly wind: Point;
  readonly state: number;
  readonly open: number;
  readonly harbour: number;
  readonly height: number;
}

export const LAND_CELL = 255;
const NOT_OPEN = 256;
const SHIP_FLOATS = 11;

export interface WatersRules {
  /** Opens the waters and plans the traffic; must come before any other call. */
  open(layoutText: string, ports: readonly PortInfo[]): WatersTable;
  /** The water at a point; null on land. */
  waterAt(point: Point): WaterAtPoint | null;
  /** The waters judged over the frame; `cellM` is at least 1,000 m (4,800 m gives 1024 × 640 cells). */
  grid(cellM: number): WatersGrid;
  /** The friendly ships within `radiusM` of `centre` at `timeS`, seconds since the Unix epoch, by id. */
  shipsNear(centre: Point, radiusM: number, timeS: number): TrafficShip[];
  /** One ship by its id at `timeS`; null when it is not sailing then. */
  ship(id: number, timeS: number): TrafficShip | null;
  /** The swell under the weather at a world point at `timeS`, seconds since the Unix epoch (the open sea's weather
   *  before the waters are opened). */
  seaSwell(point: Point, timeS: number): WeatherSwell;
  /** The swell's height as a share of a moderate sea's at the middle of each cell of a grid `columns` by `rows`
   *  cells (64 at most a side) `cellM` wide from its north-west `corner`, row by row. */
  seaHeights(corner: Point, cellM: number, columns: number, rows: number, timeS: number): Float32Array;
  /** The fingerprint of the deep sea's height under the weather at `points` at `timeS`, as hex. */
  seaHash(points: readonly Point[], timeS: number): string;
}

interface WatersExports {
  readonly memory: WebAssembly.Memory;
  reserve(length: number): number;
  release(address: number, length: number): void;
  waters_open(address: number, length: number): bigint;
  waters_at(x: number, y: number): number;
  waters_grid(cellM: number): bigint;
  waters_ships(x: number, y: number, radiusM: number, timeS: number): bigint;
  waters_ship(id: bigint, timeS: number): bigint;
  sea_swell(x: number, y: number, timeS: number): bigint;
  sea_shelter(x: number, y: number, cellM: number, columns: number, rows: number, timeS: number): bigint;
  sea_heights_hash(address: number, length: number, timeS: number): bigint;
}

interface SwellAnswer {
  readonly waves: Swell['waves'];
  readonly full_depth_m: number;
  readonly gone_depth_m: number;
  readonly bearing: number;
  readonly wind: [number, number];
  readonly state: number;
  readonly open: number;
  readonly harbour: number;
  readonly height: number;
}

interface TableAnswer {
  readonly error?: string;
  readonly waters: WaterInfo[];
  readonly borders: [number, number][];
  readonly main_ports: string[];
  readonly ports: TrafficPort[];
  readonly routes: { from_port: number; to_port: number; length_m: number; path: [number, number][] }[];
  readonly friendly_speed_m_s: number;
  readonly sea: { engage_m: number; hold_reach_m: number; repair_reach_m: number; ship_names: string[][] };
}

/** Copies an answer's bytes out of the module's memory and gives the memory back. */
function take(exports: WatersExports, packed: bigint): Uint8Array {
  const address = Number(packed >> 32n);
  const length = Number(packed & 0xffff_ffffn);
  const bytes = new Uint8Array(exports.memory.buffer.slice(address, address + length));
  exports.release(address, length);
  return bytes;
}

function readShips(bytes: Uint8Array): TrafficShip[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ships: TrafficShip[] = [];
  for (let start = 0; start + SHIP_FLOATS * 8 <= bytes.byteLength; start += SHIP_FLOATS * 8) {
    const float = (index: number) => view.getFloat64(start + index * 8, true);
    ships.push({
      id: float(0),
      route: float(1),
      fromPort: float(2),
      toPort: float(3),
      hull: float(4),
      position: [float(5), float(6)],
      direction: [float(7), float(8)],
      progressM: float(9),
      lengthM: float(10),
    });
  }
  return ships;
}

/** Starts the waters' rules on the room module, compiled; each start keeps its own instance. */
export function startWatersRules(module: WebAssembly.Module): WatersRules {
  const exports = new WebAssembly.Instance(module, {}).exports as unknown as WatersExports;
  let holders: WaterHolder[] = [];
  let isOpen = false;
  const opened = () => {
    if (!isOpen) throw new Error('the waters are not open');
  };
  return {
    open: (layoutText, ports) => {
      const bytes = new TextEncoder().encode(`{"layout":${layoutText},"ports":${JSON.stringify(ports)}}`);
      const address = exports.reserve(bytes.length);
      new Uint8Array(exports.memory.buffer, address, bytes.length).set(bytes);
      let answer: TableAnswer;
      try {
        answer = JSON.parse(new TextDecoder().decode(take(exports, exports.waters_open(address, bytes.length))));
      } finally {
        exports.release(address, bytes.length);
      }
      if (answer.error !== undefined) throw new Error(answer.error);
      holders = answer.waters.map((water) => water.holder);
      isOpen = true;
      return {
        waters: answer.waters,
        borders: answer.borders,
        mainPorts: answer.main_ports,
        ports: answer.ports,
        routes: answer.routes.map((route) => ({
          fromPort: route.from_port,
          toPort: route.to_port,
          lengthM: route.length_m,
          path: route.path,
        })),
        friendlySpeedMS: answer.friendly_speed_m_s,
        sea: {
          engageM: answer.sea.engage_m,
          holdReachM: answer.sea.hold_reach_m,
          repairReachM: answer.sea.repair_reach_m,
          shipNames: answer.sea.ship_names,
        },
      };
    },
    waterAt: ([x, y]) => {
      const byte = exports.waters_at(x, y);
      if (byte === NOT_OPEN) throw new Error('the waters are not open');
      if (byte === LAND_CELL) return null;
      return { continent: byte, holder: holders[byte] ?? 'home' };
    },
    grid: (cellM) => {
      opened();
      const bytes = take(exports, exports.waters_grid(cellM));
      if (bytes.byteLength < 8) throw new Error(`no grid of ${cellM} m cells`);
      const view = new DataView(bytes.buffer, bytes.byteOffset, 8);
      return { columns: view.getUint32(0, true), rows: view.getUint32(4, true), cellM, cells: bytes.subarray(8) };
    },
    shipsNear: ([x, y], radiusM, timeS) => {
      opened();
      return readShips(take(exports, exports.waters_ships(x, y, radiusM, timeS)));
    },
    ship: (id, timeS) => {
      opened();
      return readShips(take(exports, exports.waters_ship(BigInt(id), timeS)))[0] ?? null;
    },
    seaSwell: ([x, y], timeS) => {
      const answer = JSON.parse(new TextDecoder().decode(take(exports, exports.sea_swell(x, y, timeS)))) as SwellAnswer;
      const { waves, wind, state, open, harbour, height } = answer;
      // The wind's own bearing, not its nearest set's: the sails fill by it.
      const bearing = Math.atan2(wind[0], -wind[1]);
      return {
        waves,
        fullDepthM: answer.full_depth_m,
        goneDepthM: answer.gone_depth_m,
        bearing,
        wind,
        state,
        open,
        harbour,
        height,
      };
    },
    seaHeights: ([x, y], cellM, columns, rows, timeS) => {
      const bytes = take(exports, exports.sea_shelter(x, y, cellM, columns, rows, timeS));
      return new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
    },
    seaHash: (points, timeS) => {
      const bytes = new Uint8Array(new Float64Array(points.flat()).buffer);
      const address = exports.reserve(bytes.length);
      new Uint8Array(exports.memory.buffer, address, bytes.length).set(bytes);
      try {
        return BigInt.asUintN(64, exports.sea_heights_hash(address, bytes.length, timeS))
          .toString(16)
          .padStart(16, '0');
      } finally {
        exports.release(address, bytes.length);
      }
    },
  };
}
