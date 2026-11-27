// The islands' modules, built in Blender (tools/islands) and read from each kit's pack, in the dungeon modules' pack
// format (format 1, the header's `style` naming the kit). A module stands in its own frame: x east, y south, z up,
// metres from the middle of its base, its front to the north.
import kits from '../../../content/islands/kits.json' with { type: 'json' };

/** The parts a module wears, by their number in its pack. */
export const PARTS: readonly string[] = kits.parts;
/** The kits: one a biome's, and the common kit every climate shares. */
export const KITS: readonly string[] = kits.kits;

/** Every module's name by its number: the contract's names in byte order, the isle crate's catalog order, which is
 *  the number a placement names. */
export const MODULE_NAMES: readonly string[] = Object.keys(kits.modules).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

type Contract = { readonly role: string; readonly size: readonly number[] };
const CONTRACT = kits.modules as Readonly<Record<string, Contract>>;

/** A module's role in the contract, by its number; undefined past the catalog. */
export const roleOf = (module: number): string | undefined => CONTRACT[MODULE_NAMES[module] ?? '']?.role;

/** A module's size in the contract (width, depth, height, metres), by its number; undefined past the catalog. */
export const sizeOf = (module: number): readonly number[] | undefined => CONTRACT[MODULE_NAMES[module] ?? '']?.size;

/** The kit a module belongs to: its name's first word. */
export const kitOfModule = (name: string): string => name.slice(0, name.indexOf('.'));

/** The climates the contract dresses, by their names in content/islands/kits.json. */
export const ISLE_CLIMATES: readonly string[] = Object.keys(kits.climates);

/** A climate's biome kit, or undefined for a climate the contract does not dress. */
export const kitOfClimate = (climate: string): string | undefined =>
  (kits.climates as Readonly<Record<string, { readonly kit: string }>>)[climate]?.kit;

/** Bytes a vertex: position (3 × float32), normal (4 × snorm8), UV (2 × float32), part (4 × uint8, the first its
 *  number in `PARTS`). */
export const VERTEX_BYTES = 28;

/** Where a module lies in its kit's pack: its first vertex and corner and how many of each. A module's corners count
 *  from its own first vertex. */
export interface PackEntry {
  readonly name: string;
  readonly vertexStart: number;
  readonly vertexCount: number;
  readonly indexStart: number;
  readonly indexCount: number;
}

/** A kit's pack read and checked: its vertices as the pack holds them (`VERTEX_BYTES` each, which the GPU reads as
 *  they are), its corners, and each module's place in them by name. */
export interface KitPack {
  readonly kit: string;
  readonly vertices: Uint8Array;
  readonly indices: Uint32Array;
  readonly modules: ReadonlyMap<string, PackEntry>;
}

const whole = (count: unknown): count is number => Number.isInteger(count) && (count as number) >= 0;

function entryOf(raw: unknown): PackEntry {
  const entry = (raw ?? {}) as Partial<Record<keyof PackEntry, unknown>>;
  const name = typeof entry.name === 'string' && entry.name ? entry.name : null;
  if (!name) throw new Error('a module in the pack has no name');
  const { vertexStart, vertexCount, indexStart, indexCount } = entry;
  if (!whole(vertexStart) || !whole(vertexCount) || !whole(indexStart) || !whole(indexCount) || indexCount % 3 !== 0)
    throw new Error(`${name} does not count its vertices and corners in whole numbers, three corners a triangle`);
  return { name, vertexStart, vertexCount, indexStart, indexCount };
}

/** Reads a kit's pack: its header's length, the header as JSON, then every vertex and every corner. It throws on a
 *  pack this cannot trust whole: another format, other parts, a kit the contract does not know, a module of another
 *  kit or none, a count that is not whole, a corner outside its module, a part past `PARTS`, or a length other than
 *  the header counts. */
export function readKitPack(bytes: ArrayBuffer): KitPack {
  if (bytes.byteLength < 4) throw new Error('a module pack is too few bytes to hold its header');
  const data = new DataView(bytes);
  const headerLength = data.getUint32(0, true);
  const vertexAt = 4 + headerLength;
  if (vertexAt > bytes.byteLength) throw new Error(`a module pack's header of ${headerLength} bytes runs past it`);
  const text = new TextDecoder().decode(new Uint8Array(bytes, 4, headerLength));
  const header = (JSON.parse(text) ?? {}) as Record<string, unknown>;
  if (header.format !== 1) throw new Error(`a module pack of format ${String(header.format)} is not one this reads`);
  const { parts, style } = header;
  if (!Array.isArray(parts) || parts.length !== PARTS.length || parts.some((part, index) => part !== PARTS[index]))
    throw new Error("a module pack's parts are not the islands' parts, in their order");
  if (typeof style !== 'string' || !KITS.includes(style))
    throw new Error(`a module pack is for ${String(style)}, a kit the islands do not know`);
  if (!Array.isArray(header.modules)) throw new Error('a module pack lists no modules');
  const entries = header.modules.map(entryOf);
  const vertexCount = Math.max(0, ...entries.map((entry) => entry.vertexStart + entry.vertexCount));
  const indexCount = Math.max(0, ...entries.map((entry) => entry.indexStart + entry.indexCount));
  const cornerAt = vertexAt + vertexCount * VERTEX_BYTES;
  if (bytes.byteLength !== cornerAt + indexCount * 4)
    throw new Error(
      `a module pack of ${vertexCount} vertices and ${indexCount} corners is not ${bytes.byteLength} bytes`,
    );
  // Copied out, so the corners lie on a four-byte boundary whatever the header's length.
  const vertices = new Uint8Array(bytes.slice(vertexAt, cornerAt));
  const indices = new Uint32Array(bytes.slice(cornerAt));
  const modules = new Map<string, PackEntry>();
  for (const entry of entries) {
    if (modules.has(entry.name)) throw new Error(`a module pack holds ${entry.name} twice`);
    if (!Object.hasOwn(CONTRACT, entry.name) || kitOfModule(entry.name) !== style)
      throw new Error(`the ${style} pack holds ${entry.name}, no module of its kit`);
    for (let vertex = entry.vertexStart; vertex < entry.vertexStart + entry.vertexCount; vertex++) {
      const part = vertices[vertex * VERTEX_BYTES + 24] ?? 0;
      if (part >= PARTS.length) throw new Error(`a vertex of ${entry.name} wears part ${part}`);
    }
    for (let corner = entry.indexStart; corner < entry.indexStart + entry.indexCount; corner++) {
      if ((indices[corner] ?? 0) >= entry.vertexCount)
        throw new Error(`a corner of ${entry.name} names no vertex of its own`);
    }
    modules.set(entry.name, entry);
  }
  return { kit: style, vertices, indices, modules };
}

/** Where each kit's pack is published (content/islands/modules.json, committed from CI's log): `base` and each key. */
export interface IsleManifest {
  readonly base: string;
  readonly kits: Readonly<Record<string, string>>;
}

/** Where a kit's pack is read from: `<prefix><kit>.modules` when the page names an `islePacks` prefix (pictures
 *  before publishing), else the manifest's, else nowhere. */
export function packUrl(kit: string, manifest: IsleManifest | null, prefix: string | null): string | null {
  if (prefix !== null) return `${prefix}${kit}.modules`;
  const key = manifest?.kits[kit];
  return manifest && key ? manifest.base + key : null;
}

const packs = new Map<string, Promise<KitPack | null>>();
const warned = new Set<string>();
const PACK_TIMEOUT_MS = 15000;

/** A kit's pack fetched at `url`, kept once it comes; none, with one warning, if it fails to come or to read. A failure
 *  is not kept: the next ask tries again, and warns no more. */
export function loadKitPack(kit: string, url: string, fetcher: typeof fetch = fetch): Promise<KitPack | null> {
  const known = packs.get(url);
  if (known) return known;
  const pack = (async () => {
    const answer = await fetcher(url, { signal: AbortSignal.timeout(PACK_TIMEOUT_MS) });
    if (!answer.ok) throw new Error(`${url} answered ${answer.status}`);
    const read = readKitPack(await answer.arrayBuffer());
    if (read.kit !== kit) throw new Error(`${url} holds the ${read.kit} modules`);
    return read;
  })().catch((error: unknown) => {
    if (!warned.has(url))
      console.warn(`the ${kit} island modules could not be read, so its islands are drawn without them:`, error);
    warned.add(url);
    packs.delete(url);
    return null;
  });
  packs.set(url, pack);
  return pack;
}
