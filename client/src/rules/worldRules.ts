/** The constants the world's layout is measured against, from the Rust rules. */
export interface WorldConstants {
  readonly frameWidthM: number;
  readonly frameHeightM: number;
  readonly continentCount: number;
  readonly minContinentKm2: number;
  readonly maxContinentKm2: number;
}

/** One thing a layout gets wrong. */
export interface LayoutProblem {
  readonly subject: string;
  readonly message: string;
}

/** One continent as the rules measure it. */
export interface ContinentMeasure {
  readonly areaKm2: number;
  /** Whether its outline is a ring that never crosses or touches itself. */
  readonly simple: boolean;
}

/** A layout's text checked by the Rust rules. */
export interface LayoutCheck {
  readonly reads: boolean;
  readonly error: string;
  readonly problems: readonly LayoutProblem[];
  readonly continents: ReadonlyMap<string, ContinentMeasure>;
}

/** The world rules, running in WebAssembly. */
export interface WorldRules {
  readonly constants: WorldConstants;
  check(layoutText: string): LayoutCheck;
  /** The layout in its one written form, as the repository keeps it; throws if it does not read. */
  write(layoutText: string): string;
}

interface WorldExports {
  readonly memory: WebAssembly.Memory;
  reserve(length: number): number;
  release(address: number, length: number): void;
  world_rules(): bigint;
  check_layout(address: number, length: number): bigint;
  write_layout(address: number, length: number): bigint;
}

/** Reads text the module handed over (its address and length packed in one number) and gives the memory back. */
function takeText(exports: WorldExports, packed: bigint): string {
  const address = Number(packed >> 32n);
  const length = Number(packed & 0xffff_ffffn);
  const text = new TextDecoder().decode(new Uint8Array(exports.memory.buffer, address, length));
  exports.release(address, length);
  return text;
}

/** Starts the world rules from the compiled `world-wasm` module's bytes. */
export async function startWorldRules(moduleBytes: BufferSource): Promise<WorldRules> {
  const { instance } = await WebAssembly.instantiate(moduleBytes);
  const exports = instance.exports as unknown as WorldExports;
  const raw = JSON.parse(takeText(exports, exports.world_rules())) as Record<string, number>;
  const constants: WorldConstants = {
    frameWidthM: raw['frame_width_m'] ?? 0,
    frameHeightM: raw['frame_height_m'] ?? 0,
    continentCount: raw['continent_count'] ?? 0,
    minContinentKm2: raw['min_continent_km2'] ?? 0,
    maxContinentKm2: raw['max_continent_km2'] ?? 0,
  };
  const call = (entry: (address: number, length: number) => bigint, text: string): string => {
    const bytes = new TextEncoder().encode(text);
    const address = exports.reserve(bytes.length);
    new Uint8Array(exports.memory.buffer, address, bytes.length).set(bytes);
    const answer = takeText(exports, entry(address, bytes.length));
    exports.release(address, bytes.length);
    return answer;
  };
  const check = (layoutText: string): LayoutCheck => {
    const answer = JSON.parse(call(exports.check_layout, layoutText)) as {
      reads: boolean;
      error?: string;
      problems?: LayoutProblem[];
      continents?: { id: string; area_km2: number; simple: boolean }[];
    };
    const continents = new Map(
      (answer.continents ?? []).map(
        (continent) => [continent.id, { areaKm2: continent.area_km2, simple: continent.simple }] as const,
      ),
    );
    return { reads: answer.reads, error: answer.error ?? '', problems: answer.problems ?? [], continents };
  };
  const write = (layoutText: string): string => {
    const answer = JSON.parse(call(exports.write_layout, layoutText)) as {
      reads: boolean;
      text?: string;
      error?: string;
    };
    if (!answer.reads) throw new Error(`the layout does not read: ${answer.error ?? ''}`);
    return answer.text ?? '';
  };
  return { constants, check, write };
}
