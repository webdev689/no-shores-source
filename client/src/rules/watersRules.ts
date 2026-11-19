/**
 * The sea's nine waters and its friendly traffic, from the room's WebAssembly module (`room.wasm`), whose rules live
 * in the world crate (`crates/world/src/waters.rs`, `traffic.rs`). Open once with the layout's text and the nine
 * ports the page already holds; then ask the water at a point, the waters over the whole frame as bytes for the held
 * map, and the friendly ships near a point at a world time. A water's holder is one of `WaterHolder`.
 */

type Point = readonly [number, number];

export type WaterHolder = 'home' | 'contested' | 'grey-tithe' | 'pirates';

/** One island's water: its continent's index and id in the layout, its name, holder and level band. */
export interface WaterInfo {
  readonly continent: number;
  readonly id: string;
  readonly name: string | null;
  readonly holder: WaterHolder | null;
  readonly levels: readonly [number, number] | null;
}

/** A port as the page passes it in: its city's id and name, its continent's id, and its centre in metres. */
export interface PortInfo {
  readonly id: string;
  readonly name: string;
  readonly continent: string;
  readonly centre: Point;
}

/** A route between two ports (indices into the ports passed in), from roadstead to roadstead, in whole metres. */
export interface TrafficRoute {
  readonly fromPort: number;
  readonly toPort: number;
  readonly lengthM: number;
  readonly path: readonly Point[];
}

/** What opening answers: the waters, which waters touch, each port's roadstead, and the routes. */
export interface WatersTable {
  readonly waters: readonly WaterInfo[];
  readonly borders: readonly (readonly [number, number])[];
  readonly roadsteads: readonly Point[];
  readonly routes: readonly TrafficRoute[];
}

/** The water at a point of sea: its continent's index, its holder (contested on the seam), and the seam. */
export interface WaterAtPoint {
  readonly continent: number;
  readonly holder: WaterHolder | null;
  readonly seam: boolean;
}

/** The waters at the middle of each cell over the frame, row by row from the north-west: `cells[row * columns +
 *  column]` holds the continent's index for sea, with `SEAM_BIT` set on the seam, and `LAND_CELL` for land. */
export interface WatersGrid {
  readonly columns: number;
  readonly rows: number;
  readonly cellM: number;
  readonly cells: Uint8Array;
}

/** A friendly ship at one moment. `hull` is 0 sloop, 1 schooner, 2 brig, 3 frigate; `direction` is the unit way she
 *  sails; ports are indices into the ports passed in. */
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

export const LAND_CELL = 255;
export const SEAM_BIT = 0x80;
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
  /** One ship by her id at `timeS`; null when she is not sailing then. */
  ship(id: number, timeS: number): TrafficShip | null;
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
}

interface TableAnswer {
  readonly error?: string;
  readonly waters: WaterInfo[];
  readonly borders: [number, number][];
  readonly ports: { readonly roadstead: [number, number] }[];
  readonly routes: { from_port: number; to_port: number; length_m: number; path: [number, number][] }[];
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
  let holders: (WaterHolder | null)[] = [];
  const opened = () => {
    if (holders.length === 0) throw new Error('the waters are not open');
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
      return {
        waters: answer.waters,
        borders: answer.borders,
        roadsteads: answer.ports.map((port) => port.roadstead),
        routes: answer.routes.map((route) => ({
          fromPort: route.from_port,
          toPort: route.to_port,
          lengthM: route.length_m,
          path: route.path,
        })),
      };
    },
    waterAt: ([x, y]) => {
      const byte = exports.waters_at(x, y);
      if (byte === NOT_OPEN) throw new Error('the waters are not open');
      if (byte === LAND_CELL) return null;
      const continent = byte & ~SEAM_BIT;
      const seam = (byte & SEAM_BIT) !== 0;
      return { continent, seam, holder: seam ? 'contested' : (holders[continent] ?? null) };
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
  };
}
