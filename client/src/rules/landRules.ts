import { beginRequest, type FightOrders, type FightView, readFight, stepRequest } from './fightRules.ts';
import type { Block } from './movementRules.ts';

/** A river as the land generates it: its course through cell centres, source first, with the flow at each point. */
export interface RiverCourse {
  readonly points: readonly (readonly [number, number])[];
  readonly flow: readonly number[];
}

/** One landmass's land: its window on the world, one ground height and one lake surface a cell, and its rivers. */
export interface LandView {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly leftM: number;
  readonly topM: number;
  readonly cellM: number;
  /** Metres; land is 1 m or more, the seabed -2 m or less. */
  readonly heights: Float32Array;
  /** A lake's surface in metres, 0 where none stands. */
  readonly lakes: Float32Array;
  /** Each cell centre's distance from the painted coast, metres, positive on land; held within a few kilometres. */
  readonly coast: Float32Array;
  /** Each cell's height carried over the coast from the other side: a land cell's seabed, a sea cell's land. */
  readonly across: Float32Array;
  readonly rivers: readonly RiverCourse[];
  /** A fingerprint of every ground height's bits, the same as the server's for the same land. */
  readonly groundHash: string;
  /** Every rule the landmass's edits break, its places checked against its coast. */
  readonly problems: readonly { readonly subject: string; readonly message: string }[];
  /** The biome's low ground (red, green, blue, 0..1) and snow line in metres; absent for a landmass with no biome. */
  readonly ground?: readonly [number, number, number];
  readonly snowM?: number;
  /** The sea's swell, the same over every landmass. */
  readonly swell?: Swell;
}

/** One wave of the sea's swell (crates/land/src/sea.rs): the way it travels (a unit vector east and south), its
 *  wavenumber (radians a metre), frequency (radians a second), height and sideways carry (metres) and phase. */
export interface SeaWave {
  readonly direction: readonly [number, number];
  readonly number: number;
  readonly frequency: number;
  readonly amplitude: number;
  readonly shift: number;
  readonly phase: number;
}

/** The sea's swell: its waves, longest first, whole where the sea is `fullDepthM` deep and gone at `goneDepthM`. */
export interface Swell {
  readonly waves: readonly SeaWave[];
  readonly fullDepthM: number;
  readonly goneDepthM: number;
  /** Where it and the steady wind run toward, radians clockwise from north. */
  readonly bearing: number;
}

/** What the helm asks for a tick (crates/sailing/src/ship.rs Helm): the rudder from -1 (port) to 1 (starboard), the
 *  oars pulling her sideways, and a rung up or down the ladder for the first tick. */
export interface Helm {
  readonly steer: number;
  readonly crab: boolean;
  readonly climb: -1 | 0 | 1;
}

/** How a ship lies: her waterline's height (metres), her bow's rise and her heel to starboard (radians), and whether
 *  her keel touches the ground. */
export interface Pose {
  readonly heave: number;
  readonly pitch: number;
  readonly roll: number;
  readonly aground: boolean;
}

/** A ship's numbers in the sailing crate's order: x, y, heading, ahead, abeam, turn, sail way, rung. */
export type ShipFloats = Float64Array<ArrayBuffer>;

/** A ship's forward and starboard directions (east, south) at `heading`, radians clockwise from north, as the sailing
 *  crate's frame has them. */
export function headingFrame(heading: number): {
  readonly forward: [number, number];
  readonly starboard: [number, number];
} {
  const [sine, cosine] = [Math.sin(heading), Math.cos(heading)];
  return { forward: [sine, -cosine], starboard: [cosine, sine] };
}

/** The water at a point of the ground, and its surface. */
export interface WaterAt {
  readonly kind: 'dry' | 'sea' | 'lake' | 'river';
  readonly surface?: number;
}

/** The ground at some points, as the runtime finds it: each height and its water, the sea's surface there at the
 *  moment asked (null off the sea), and fingerprints of the heights and of the sea. */
export interface GroundSample {
  readonly heights: readonly number[];
  readonly water: readonly WaterAt[];
  readonly sea: readonly (number | null)[];
  readonly sampleHash: string;
  readonly seaHash: string;
}

/** A sculpting brush, as an edits file stores a stroke's. */
export interface Brush {
  readonly tool: 'raise' | 'lower' | 'smooth' | 'flatten';
  readonly radius_m: number;
  readonly strength: number;
  readonly level_m?: number;
}

/** The cells one dab changed, and their new heights row by row. */
export interface LandPatch {
  readonly rect: { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number };
  readonly heights: Float32Array;
}

/** The exact ground over a grid of samples `step` metres apart from (left, top): each sample's height, its water's
 *  surface (0 where dry), how far past fresh water's edge it lies (negative inside; a million metres where none is
 *  near) and its mark (3 a road, 4 a town, 5 a port, 0 none). */
export interface GroundPatch {
  readonly left: number;
  readonly top: number;
  readonly step: number;
  readonly width: number;
  readonly height: number;
  readonly heights: Float32Array;
  readonly water: Float32Array;
  readonly edges: Float32Array;
  readonly marks: Uint8Array;
}

/** The land crate, running in WebAssembly. Each call throws with the reason when it cannot answer. */
export interface LandRules {
  /** Generates one continent of a layout with its edits file's text on it (null for none). Kept, it stays open for
   *  strokes, its city settled on it with the blocks of the RMB index's text (none for null); not kept, it is a
   *  preview and the open one stays open. */
  open(layoutText: string, id: string, editsText: string | null, keep?: boolean, rmbText?: string | null): LandView;
  /** One dab on the open landmass; `starts` begins a new stroke. */
  dab(brush: Brush, point: readonly [number, number], starts: boolean): LandPatch;
  /** The open landmass with its water run again. */
  settle(): LandView;
  /** The open landmass with these edits in place of its own. */
  setEdits(editsText: string): LandView;
  /** The open landmass's edits file, in its written form. */
  write(): { readonly id: string; readonly text: string };
  /** The open landmass's ground at each point, to the metre, and the sea over it at `time`, seconds of world time. */
  sample(points: readonly (readonly [number, number])[], time?: number): GroundSample;
  /** The open landmass's exact ground over a grid, for a close look. */
  patch(left: number, top: number, step: number, width: number, height: number): GroundPatch;
  /** The open landmass's ground over a rect (west, north, east, south, metres) cut as a node's window, as JSON: the
   *  same window, to the bit, a node's room stands its bodies on, for the movement rules to stand the player on. */
  window(west: number, north: number, east: number, south: number): string;
  /** The boxes of the open landmass's city a body runs into within a rect, as the movement rules take blocks. */
  boxes(west: number, north: number, east: number, south: number): Block[];
  /** The open landmass's city's plan, as JSON, for the drawing; null with no city. */
  cityPlan(): string | null;
  /** The ship sailed `ticks` ticks over the open landmass from `time`, seconds of world time, and her pose after. */
  sail(ship: ShipFloats, helm: Helm, time: number, ticks: number): { ship: ShipFloats; pose: Pose };
  /** A fight begun round the ship: a pirate captain put to sea in her rank's hull (a Major's unless `rank` names one),
   *  every chance drawn from `seed`. */
  fightBegin(ship: ShipFloats, seed: number, time: number, rank?: number): FightView;
  /** The fight stepped `ticks` ticks from `time` by the player's orders. */
  fightStep(orders: FightOrders, time: number, ticks: number): FightView;
  /** The fight ended. */
  fightEnd(): void;
}

interface LandExports {
  readonly memory: WebAssembly.Memory;
  reserve(length: number): number;
  release(address: number, length: number): void;
  land_open(address: number, length: number): bigint;
  land_dab(address: number, length: number): bigint;
  land_settle(): bigint;
  land_set_edits(address: number, length: number): bigint;
  land_write(): bigint;
  land_sample(address: number, length: number): bigint;
  land_patch(address: number, length: number): bigint;
  land_window(address: number, length: number): bigint;
  land_boxes(address: number, length: number): bigint;
  land_city_plan(): bigint;
  land_sail(address: number, length: number): bigint;
  land_fight_begin(address: number, length: number): bigint;
  land_fight_step(address: number, length: number): bigint;
  land_fight_end(): void;
}

interface ViewHeader {
  readonly error?: string;
  readonly id?: string;
  readonly width?: number;
  readonly height?: number;
  readonly left_m?: number;
  readonly top_m?: number;
  readonly cell_m?: number;
  readonly rivers?: RiverCourse[];
  readonly ground_hash?: string;
  readonly problems?: { subject: string; message: string }[];
  readonly rect?: [number, number, number, number];
  readonly ground?: [number, number, number] | null;
  readonly snow_m?: number | null;
  readonly swell?: { waves: SeaWave[]; full_depth_m: number; gone_depth_m: number; bearing: number };
}

/** The header of an answer and where its floats begin; throws the answer's error. */
function readHeader(exports: LandExports, address: number): { header: ViewHeader; start: number } {
  const headerLength = new DataView(exports.memory.buffer, address, 4).getUint32(0, true);
  const bytes = new Uint8Array(exports.memory.buffer, address + 4, headerLength);
  const header = JSON.parse(new TextDecoder().decode(bytes)) as ViewHeader;
  if (header.error !== undefined) throw new Error(header.error);
  return { header, start: address + 4 + headerLength };
}

/** Reads a view the module handed over (a header, then four floats a cell) and gives the memory back. */
function takeView(exports: LandExports, packed: bigint): LandView {
  const address = Number(packed >> 32n);
  const length = Number(packed & 0xffff_ffffn);
  try {
    const { header, start } = readHeader(exports, address);
    const width = header.width ?? 0;
    const height = header.height ?? 0;
    const cells = width * height;
    return {
      id: header.id ?? '',
      width,
      height,
      leftM: header.left_m ?? 0,
      topM: header.top_m ?? 0,
      cellM: header.cell_m ?? 0,
      heights: new Float32Array(exports.memory.buffer.slice(start, start + cells * 4)),
      lakes: new Float32Array(exports.memory.buffer.slice(start + cells * 4, start + cells * 8)),
      coast: new Float32Array(exports.memory.buffer.slice(start + cells * 8, start + cells * 12)),
      across: new Float32Array(exports.memory.buffer.slice(start + cells * 12, start + cells * 16)),
      rivers: header.rivers ?? [],
      groundHash: header.ground_hash ?? '',
      problems: header.problems ?? [],
      ...(header.ground ? { ground: header.ground } : {}),
      ...(typeof header.snow_m === 'number' ? { snowM: header.snow_m } : {}),
      ...(header.swell
        ? {
            swell: {
              waves: header.swell.waves,
              fullDepthM: header.swell.full_depth_m,
              goneDepthM: header.swell.gone_depth_m,
              bearing: header.swell.bearing,
            },
          }
        : {}),
    };
  } finally {
    exports.release(address, length);
  }
}

/** Reads a patch the module handed over and gives the memory back. */
function takePatch(exports: LandExports, packed: bigint): LandPatch {
  const address = Number(packed >> 32n);
  const length = Number(packed & 0xffff_ffffn);
  try {
    const { header, start } = readHeader(exports, address);
    const [left, top, right, bottom] = header.rect ?? [0, 0, 0, 0];
    const cells = (right - left) * (bottom - top);
    const heights = new Float32Array(exports.memory.buffer.slice(start, start + cells * 4));
    return { rect: { left, top, right, bottom }, heights };
  } finally {
    exports.release(address, length);
  }
}

/** Reads text the module handed over and gives the memory back. */
function takeText(exports: LandExports, packed: bigint): string {
  const address = Number(packed >> 32n);
  const length = Number(packed & 0xffff_ffffn);
  const text = new TextDecoder().decode(new Uint8Array(exports.memory.buffer, address, length));
  exports.release(address, length);
  return text;
}

/** Starts the land from the compiled `land-wasm` module's bytes. */
export async function startLand(moduleBytes: BufferSource): Promise<LandRules> {
  const { instance } = await WebAssembly.instantiate(moduleBytes);
  const exports = instance.exports as unknown as LandExports;
  const send = (entry: (address: number, length: number) => bigint, request: string | Uint8Array): bigint => {
    const bytes = typeof request === 'string' ? new TextEncoder().encode(request) : request;
    const address = exports.reserve(bytes.length);
    new Uint8Array(exports.memory.buffer, address, bytes.length).set(bytes);
    try {
      return entry(address, bytes.length);
    } finally {
      exports.release(address, bytes.length);
    }
  };
  return {
    open: (layoutText, id, editsText, keep = true, rmbText = null) => {
      const named = `{"id":${JSON.stringify(id)},"keep":${keep},"edits":${editsText ?? 'null'}`;
      const request = `${named},"rmb":${rmbText ?? 'null'},"layout":${layoutText}}`;
      return takeView(exports, send(exports.land_open, request));
    },
    dab: (brush, point, starts) =>
      takePatch(exports, send(exports.land_dab, JSON.stringify({ brush: { ...brush, points: [] }, point, starts }))),
    settle: () => takeView(exports, exports.land_settle()),
    setEdits: (editsText) => takeView(exports, send(exports.land_set_edits, `{"edits":${editsText}}`)),
    write: () => {
      const answer = JSON.parse(takeText(exports, exports.land_write())) as {
        id?: string;
        text?: string;
        error?: string;
      };
      if (answer.error !== undefined) throw new Error(answer.error);
      return { id: answer.id ?? '', text: answer.text ?? '' };
    },
    patch: (left, top, step, width, height) => {
      const packed = send(exports.land_patch, JSON.stringify({ left, top, step, width, height }));
      const address = Number(packed >> 32n);
      const length = Number(packed & 0xffff_ffffn);
      try {
        const { start } = readHeader(exports, address);
        const cells = width * height;
        const floats = (offset: number) => new Float32Array(exports.memory.buffer.slice(offset, offset + cells * 4));
        const marks = new Uint8Array(exports.memory.buffer.slice(start + cells * 12, start + cells * 13));
        const [heights, water, edges] = [floats(start), floats(start + cells * 4), floats(start + cells * 8)];
        return { left, top, step, width, height, heights, water, edges, marks };
      } finally {
        exports.release(address, length);
      }
    },
    fightBegin: (ship, seed, time, rank) =>
      readFight(takeText(exports, send(exports.land_fight_begin, beginRequest(ship, seed, time, rank)))),
    fightStep: (orders, time, ticks) =>
      readFight(takeText(exports, send(exports.land_fight_step, stepRequest(orders, time, ticks)))),
    fightEnd: () => {
      exports.land_fight_end();
    },
    sail: (ship, helm, time, ticks) => {
      const request = new Float64Array([...ship, helm.steer, helm.crab ? 1 : 0, helm.climb, time, ticks]);
      const packed = send(exports.land_sail, new Uint8Array(request.buffer));
      const address = Number(packed >> 32n);
      const length = Number(packed & 0xffff_ffffn);
      try {
        const { start } = readHeader(exports, address);
        const numbers = new Float64Array(exports.memory.buffer.slice(start, start + 12 * 8));
        const [heave = 0, pitch = 0, roll = 0, aground = 0] = numbers.subarray(8);
        return { ship: numbers.slice(0, 8), pose: { heave, pitch, roll, aground: aground !== 0 } };
      } finally {
        exports.release(address, length);
      }
    },
    sample: (points, time = 0) => {
      const answer = JSON.parse(takeText(exports, send(exports.land_sample, JSON.stringify({ points, time })))) as {
        heights?: number[];
        water?: WaterAt[];
        sea?: (number | null)[];
        sample_hash?: string;
        sea_hash?: string;
        error?: string;
      };
      if (answer.error !== undefined) throw new Error(answer.error);
      return {
        heights: answer.heights ?? [],
        water: answer.water ?? [],
        sea: answer.sea ?? [],
        sampleHash: answer.sample_hash ?? '',
        seaHash: answer.sea_hash ?? '',
      };
    },
    window: (west, north, east, south) => {
      const text = takeText(exports, send(exports.land_window, JSON.stringify({ west, north, east, south })));
      // A window is a ground, whose first field is its land; anything else is the reason it was refused.
      if (text.startsWith('{"error"')) throw new Error((JSON.parse(text) as { error: string }).error);
      return text;
    },
    boxes: (west, north, east, south) => {
      const answer = JSON.parse(
        takeText(exports, send(exports.land_boxes, JSON.stringify({ west, north, east, south }))),
      ) as { boxes?: [number, number, number, number, number][]; error?: string };
      if (answer.error !== undefined) throw new Error(answer.error);
      return (answer.boxes ?? []).map(([minX, minY, maxX, maxY, top]) => ({ minX, minY, maxX, maxY, top }));
    },
    cityPlan: () => {
      const text = takeText(exports, exports.land_city_plan());
      return text === 'null' ? null : text;
    },
  };
}
