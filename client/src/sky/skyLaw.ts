/** The heavens and the weather over a place at a moment, as crates/sky reads them (crates/land-wasm/src/sky_door.rs). */
export interface SkyReading {
  readonly latitudeDeg: number;
  /** Unit directions, east, south and up. */
  readonly sun: readonly [number, number, number];
  readonly moon: readonly [number, number, number];
  /** The moon's month, 0 new to a half full, and the share of its face lit. */
  readonly moonPhase: number;
  readonly moonLit: number;
  /** How far the stars have wheeled about the pole, radians. */
  readonly starTurn: number;
  /** 0 in the night to 1 once the sun is 10 degrees up. */
  readonly daylight: number;
  readonly cloud: number;
  /** How hard rain or snow falls, and the share that is snow. */
  readonly falling: number;
  readonly snowShare: number;
  readonly storm: number;
  readonly fog: number;
  readonly sand: number;
  /** The wind, m/s east and south, and its gusts, 0 to 1. */
  readonly wind: readonly [number, number];
  readonly gust: number;
  readonly temperatureC: number;
  /** The ground's wetness from the last twenty minutes' rain, and its fresh snow from their snow, each 0 to 1. */
  readonly wetness: number;
  readonly snowCover: number;
  /** The flow that carries the weather, m/s east. */
  readonly steeringMS: number;
}

/** One lightning strike: where and when, whether it reaches the ground, and its power, a half to 1. */
export interface Strike {
  readonly x: number;
  readonly y: number;
  readonly atS: number;
  readonly toGround: boolean;
  readonly power: number;
}

export interface SkyLaw {
  /** The climates the law knows, the sea last. */
  readonly climates: readonly string[];
  /** The reading at (x, y) on the map, `altitudeM` above the sea, at world time `worldS`, in a climate's air (the
   *  sea's for any key the law does not know). */
  at(x: number, y: number, altitudeM: number, worldS: number, climate: string): SkyReading;
  /** The strikes within `reachM` of (x, y) from `fromS` up to `toS`, earliest first. A window over 60 s or a reach
   *  over 80 km is refused, and answers none: ask a long span a minute at a time. */
  strikes(x: number, y: number, reachM: number, fromS: number, toS: number, climate: string): Strike[];
  /** The wind a ship's sails feel at (x, y) at `worldS`, m/s east and south: the rules' own, held a world minute. */
  seaWind(x: number, y: number, worldS: number): readonly [number, number];
}

/** The way a wind (m/s east and south) blows toward, radians clockwise from north, as a swell's bearing runs. */
export const windBearing = (wind: readonly [number, number]): number => Math.atan2(wind[0], -wind[1]);

interface SkyExports {
  readonly memory: WebAssembly.Memory;
  reserve(length: number): number;
  release(address: number, length: number): void;
  land_sky(address: number, length: number): bigint;
  land_strikes(address: number, length: number): bigint;
  land_sea_wind(address: number, length: number): bigint;
  land_climates(): bigint;
}

const SKY_ANSWER_FLOATS = 24;
const STRIKE_FLOATS = 5;

function take(exports: SkyExports, packed: bigint): Uint8Array {
  const [address, length] = [Number(packed >> 32n), Number(packed & 0xffff_ffffn)];
  const bytes = new Uint8Array(exports.memory.buffer, address, length).slice();
  exports.release(address, length);
  return bytes;
}

/** Starts the sky's law from the compiled `land-wasm` module's bytes, in an instance of its own. */
export async function startSkyLaw(moduleBytes: BufferSource): Promise<SkyLaw> {
  const { instance } = await WebAssembly.instantiate(moduleBytes);
  const exports = instance.exports as unknown as SkyExports;
  const ask = (entry: (address: number, length: number) => bigint, numbers: readonly number[]): Float64Array => {
    const bytes = new Uint8Array(new Float64Array(numbers).buffer);
    const address = exports.reserve(bytes.length);
    new Uint8Array(exports.memory.buffer, address, bytes.length).set(bytes);
    try {
      return new Float64Array(take(exports, entry(address, bytes.length)).buffer);
    } finally {
      exports.release(address, bytes.length);
    }
  };
  const { climates } = JSON.parse(new TextDecoder().decode(take(exports, exports.land_climates()))) as {
    readonly climates: readonly string[];
  };
  const numberOf = (climate: string): number => {
    const index = climates.indexOf(climate);
    return index >= 0 ? index : climates.length - 1;
  };
  return {
    climates,
    at: (x, y, altitudeM, worldS, climate) => {
      const read = ask(exports.land_sky, [x, y, altitudeM, worldS, numberOf(climate)]);
      if (read.length !== SKY_ANSWER_FLOATS) throw new Error('the sky refused its request');
      const number = (index: number): number => read[index] ?? 0;
      return {
        latitudeDeg: number(0),
        sun: [number(1), number(2), number(3)],
        moon: [number(4), number(5), number(6)],
        moonPhase: number(7),
        moonLit: number(8),
        starTurn: number(9),
        daylight: number(10),
        cloud: number(11),
        falling: number(12),
        snowShare: number(13),
        storm: number(14),
        fog: number(15),
        sand: number(16),
        wind: [number(17), number(18)],
        gust: number(19),
        temperatureC: number(20),
        wetness: number(21),
        steeringMS: number(22),
        snowCover: number(23),
      };
    },
    strikes: (x, y, reachM, fromS, toS, climate) => {
      const read = ask(exports.land_strikes, [x, y, reachM, fromS, toS, numberOf(climate)]);
      return Array.from({ length: Math.floor(read.length / STRIKE_FLOATS) }, (unused, index) => {
        const number = (offset: number): number => read[index * STRIKE_FLOATS + offset] ?? 0;
        return { x: number(0), y: number(1), atS: number(2), toGround: number(3) !== 0, power: number(4) };
      });
    },
    seaWind: (x, y, worldS) => {
      const read = ask(exports.land_sea_wind, [x, y, worldS]);
      return [read[0] ?? 0, read[1] ?? 0];
    },
  };
}
