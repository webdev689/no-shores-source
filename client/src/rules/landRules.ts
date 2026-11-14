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

/** The land crate, running in WebAssembly. Each call throws with the reason when it cannot answer. */
export interface LandRules {
  /** Generates one continent of a layout with its edits file's text on it (null for none). Kept, it stays open for
   *  strokes; not kept, it is a preview and the open one stays open. */
  open(layoutText: string, id: string, editsText: string | null, keep?: boolean): LandView;
  /** One dab on the open landmass; `starts` begins a new stroke. */
  dab(brush: Brush, point: readonly [number, number], starts: boolean): LandPatch;
  /** The open landmass with its water run again. */
  settle(): LandView;
  /** The open landmass with these edits in place of its own. */
  setEdits(editsText: string): LandView;
  /** The open landmass's edits file, in its written form. */
  write(): { readonly id: string; readonly text: string };
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
  readonly rect?: [number, number, number, number];
}

/** The header of an answer and where its floats begin; throws the answer's error. */
function readHeader(exports: LandExports, address: number): { header: ViewHeader; start: number } {
  const headerLength = new DataView(exports.memory.buffer, address, 4).getUint32(0, true);
  const bytes = new Uint8Array(exports.memory.buffer, address + 4, headerLength);
  const header = JSON.parse(new TextDecoder().decode(bytes)) as ViewHeader;
  if (header.error !== undefined) throw new Error(header.error);
  return { header, start: address + 4 + headerLength };
}

/** Reads a view the module handed over (a header, then two floats a cell) and gives the memory back. */
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
      rivers: header.rivers ?? [],
      groundHash: header.ground_hash ?? '',
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

/** Starts the land from the compiled `land-wasm` module's bytes. */
export async function startLand(moduleBytes: BufferSource): Promise<LandRules> {
  const { instance } = await WebAssembly.instantiate(moduleBytes);
  const exports = instance.exports as unknown as LandExports;
  const send = (entry: (address: number, length: number) => bigint, text: string): bigint => {
    const bytes = new TextEncoder().encode(text);
    const address = exports.reserve(bytes.length);
    new Uint8Array(exports.memory.buffer, address, bytes.length).set(bytes);
    try {
      return entry(address, bytes.length);
    } finally {
      exports.release(address, bytes.length);
    }
  };
  return {
    open: (layoutText, id, editsText, keep = true) => {
      const request = `{"id":${JSON.stringify(id)},"keep":${keep},"edits":${editsText ?? 'null'},"layout":${layoutText}}`;
      return takeView(exports, send(exports.land_open, request));
    },
    dab: (brush, point, starts) =>
      takePatch(exports, send(exports.land_dab, JSON.stringify({ brush: { ...brush, points: [] }, point, starts }))),
    settle: () => takeView(exports, exports.land_settle()),
    setEdits: (editsText) => takeView(exports, send(exports.land_set_edits, `{"edits":${editsText}}`)),
    write: () => {
      const packed = exports.land_write();
      const address = Number(packed >> 32n);
      const length = Number(packed & 0xffff_ffffn);
      const text = new TextDecoder().decode(new Uint8Array(exports.memory.buffer, address, length));
      exports.release(address, length);
      const answer = JSON.parse(text) as { id?: string; text?: string; error?: string };
      if (answer.error !== undefined) throw new Error(answer.error);
      return { id: answer.id ?? '', text: answer.text ?? '' };
    },
  };
}
