import type { Helm, Pose } from './landRules.ts';

/** A player's look while they aim: its bearing off their bow (degrees, to starboard), how far out it meets the water
 *  (metres), and its ray (the aim eye, then the way it looks), when they have one. */
export interface FleetLook {
  readonly bearing: number;
  readonly range: number;
  readonly ray?: readonly number[];
}

/** A ship as a lay sees it: its number, its flag (0 a player's, else its faction's number), its hull (0 the Sloop to
 *  3 the Frigate, the Sloop unless named), its helm's numbers and pose, whether it floats. */
export interface LaySighted {
  readonly id: number;
  readonly flag: number;
  readonly hull?: number;
  readonly ship: ArrayLike<number>;
  readonly pose: ArrayLike<number>;
  readonly afloat: boolean;
}

type Point = readonly [number, number, number];

/** Where one gun's unscattered ball stops: seconds after it leaves its gun, the point, whether in the water, and where
 *  it first strikes a ship, if it does. */
export interface LayEnd {
  readonly time: number;
  readonly point: Point;
  readonly water: boolean;
  readonly strike: Point | null;
}

/** The lay a look holds, as the fleet room would fire it: its side, elevation, reach, landing zone's radius, whether
 *  on target, and each gun's unscattered launch (mouth, then velocity) and where it stops (null: still aloft). */
export interface FleetLay {
  readonly side: 'port' | 'starboard';
  readonly elevation: number;
  readonly reach: number;
  readonly radius: number;
  readonly onTarget: boolean;
  readonly launches: readonly (readonly number[])[];
  readonly ends: readonly (LayEnd | null)[];
}

/** The fleet room's rules for one player's ship, running in WebAssembly: the same steps, to the bit, the room takes. */
export interface FleetRules {
  /** Its ship after each helm in turn, and its pose at `time`; null for numbers no ship could have. */
  predict(
    ship: ArrayLike<number>,
    hurts: { readonly wrecked: boolean; readonly sail: number; readonly maxSail: number },
    time: number,
    helms: readonly Helm[],
  ): { readonly ship: Float64Array; readonly pose: Pose } | null;
  /** Its look's lay among the ships it sees, with its load (1 round to 4 heated); null when no side bears. */
  lay(own: LaySighted, load: number, look: FleetLook, time: number, others: readonly LaySighted[]): FleetLay | null;
  /** Sets the world time the fleet room opened at, so its predictions sail in the room's weather. */
  setWorldStart(seconds: number): void;
}

interface FleetExports {
  readonly memory: WebAssembly.Memory;
  reserve(length: number): number;
  release(address: number, length: number): void;
  fleet_predict(address: number, length: number): bigint;
  fleet_lay(address: number, length: number): bigint;
  room_world_start(seconds: number): void;
}

/** A ship's numbers, a pose's, and a gun's in a lay's answer. */
const SHIP_FLOATS = 8;
const POSE_FLOATS = 4;
const GUN_FLOATS = 16;

const sightedFloats = (ship: LaySighted): number[] => [
  ship.id,
  ship.flag,
  ship.hull ?? 0,
  ...Array.from(ship.ship),
  ...Array.from(ship.pose),
  ship.afloat ? 1 : 0,
];

/** Starts the fleet's rules from the compiled `room-wasm` module. */
export function startFleetRules(module: WebAssembly.Module): FleetRules {
  const exports = new WebAssembly.Instance(module, {}).exports as unknown as FleetExports;
  const ask = (entry: (address: number, length: number) => bigint, numbers: readonly number[]): Float64Array => {
    const floats = new Float64Array(numbers);
    const bytes = new Uint8Array(floats.buffer);
    const address = exports.reserve(bytes.length);
    new Uint8Array(exports.memory.buffer, address, bytes.length).set(bytes);
    let packed: bigint;
    try {
      packed = entry(address, bytes.length);
    } finally {
      exports.release(address, bytes.length);
    }
    const [answer, length] = [Number(packed >> 32n), Number(packed & 0xffff_ffffn)];
    const out = new Float64Array(new Uint8Array(exports.memory.buffer, answer, length).slice().buffer);
    exports.release(answer, length);
    return out;
  };
  return {
    setWorldStart: (seconds) => exports.room_world_start(seconds),
    predict: (ship, hurts, time, helms) => {
      const request = [...Array.from(ship), hurts.wrecked ? 1 : 0, hurts.sail, hurts.maxSail, time];
      for (const helm of helms) request.push(helm.steer, helm.crab ? 1 : 0, helm.climb);
      const out = ask(exports.fleet_predict, request);
      if (out.length !== SHIP_FLOATS + POSE_FLOATS) return null;
      const [heave = 0, pitch = 0, roll = 0, aground = 0] = out.subarray(SHIP_FLOATS);
      return { ship: out.slice(0, SHIP_FLOATS), pose: { heave, pitch, roll, aground: aground !== 0 } };
    },
    lay: (own, load, look, time, others) => {
      const ray = look.ray?.length === 6 ? look.ray : null;
      const request = [
        ...sightedFloats(own),
        load,
        look.bearing,
        look.range,
        ray ? 1 : 0,
        ...(ray ?? [0, 0, 0, 0, 0, 0]),
      ];
      request.push(time, ...others.flatMap(sightedFloats));
      const out = ask(exports.fleet_lay, request);
      if (out[0] !== 1) return null;
      const numberAt = (index: number) => out[index] ?? 0;
      const guns = Math.floor((out.length - 6) / GUN_FLOATS);
      const launches: number[][] = [];
      const ends: (LayEnd | null)[] = [];
      for (let gun = 0; gun < guns; gun++) {
        const from = 6 + gun * GUN_FLOATS;
        launches.push(Array.from(out.subarray(from, from + 6)));
        const point: Point = [numberAt(from + 8), numberAt(from + 9), numberAt(from + 10)];
        const strike: Point | null =
          numberAt(from + 12) === 1 ? [numberAt(from + 13), numberAt(from + 14), numberAt(from + 15)] : null;
        ends.push(
          numberAt(from + 6) === 1
            ? { time: numberAt(from + 7), point, water: numberAt(from + 11) === 1, strike }
            : null,
        );
      }
      return {
        side: numberAt(1) === 0 ? 'port' : 'starboard',
        elevation: numberAt(2),
        reach: numberAt(3),
        radius: numberAt(4),
        onTarget: numberAt(5) === 1,
        launches,
        ends,
      };
    },
  };
}

/** The highest level experience alone reaches, and the highest of all, for a character, a ship or a captain
 *  (crates/gear/src/power.rs XP_LEVEL_MOST, LEVEL_MOST). */
export const LEVEL_BY_XP = 20;
export const LEVEL_MOST = 30;
