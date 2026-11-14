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
  readonly rivers: readonly RiverCourse[];
  /** A fingerprint of every ground height's bits, the same as the server's for the same land. */
  readonly groundHash: string;
}

/** The land crate, running in WebAssembly. */
export interface LandRules {
  /** Generates and opens one continent of a layout; throws with the reason if it cannot. */
  open(layoutText: string, id: string): LandView;
}

interface LandExports {
  readonly memory: WebAssembly.Memory;
  reserve(length: number): number;
  release(address: number, length: number): void;
  land_open(address: number, length: number): bigint;
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
}

/** Reads a view the module handed over (a header, then two floats a cell) and gives the memory back. */
function takeView(exports: LandExports, packed: bigint): LandView {
  const address = Number(packed >> 32n);
  const length = Number(packed & 0xffff_ffffn);
  try {
    const bytes = new Uint8Array(exports.memory.buffer, address, length);
    const headerLength = new DataView(bytes.buffer, address, 4).getUint32(0, true);
    const header = JSON.parse(new TextDecoder().decode(bytes.subarray(4, 4 + headerLength))) as ViewHeader;
    if (header.error !== undefined) throw new Error(header.error);
    const width = header.width ?? 0;
    const height = header.height ?? 0;
    const start = address + 4 + headerLength;
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
      rivers: header.rivers ?? [],
      groundHash: header.ground_hash ?? '',
    };
  } finally {
    exports.release(address, length);
  }
}

/** Starts the land from the compiled `land-wasm` module's bytes. */
export async function startLand(moduleBytes: BufferSource): Promise<LandRules> {
  const { instance } = await WebAssembly.instantiate(moduleBytes);
  const exports = instance.exports as unknown as LandExports;
  const call = (entry: (address: number, length: number) => bigint, text: string): LandView => {
    const bytes = new TextEncoder().encode(text);
    const address = exports.reserve(bytes.length);
    new Uint8Array(exports.memory.buffer, address, bytes.length).set(bytes);
    try {
      return takeView(exports, entry(address, bytes.length));
    } finally {
      exports.release(address, bytes.length);
    }
  };
  return {
    open: (layoutText, id) => call(exports.land_open, `{"id":${JSON.stringify(id)},"layout":${layoutText}}`),
  };
}
