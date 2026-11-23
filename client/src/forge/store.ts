import renders from '../../../content/forge/renders.json' with { type: 'json' };
import { contentBytes, type Fetched } from '../contentCache.ts';
import type { Strip } from './compose.ts';
import { StripCache } from './stripCache.ts';

export { RETRY_AFTER_MS } from './stripCache.ts';

/** Where the forge's renders are published: the public base, the pack index and the tables, each named by its hash. */
export interface Manifest {
  readonly base: string;
  readonly index: string;
  readonly tables: Readonly<Record<string, string>>;
}

/** The pack index: each pack's key, and each picture's pack, byte offset, length and type. */
export interface PackIndex {
  readonly packs: readonly string[];
  readonly pictures: Readonly<Record<string, readonly [number, number, number, string]>>;
}

/** Where a picture lies: its pack's URL, its byte range in it and its type. */
export interface StripWhere {
  readonly url: string;
  readonly range: string;
  readonly type: string;
}

/** The URL and byte range a picture lies at, or null where the index has no such picture. */
export function pictureRange(manifest: Manifest, index: PackIndex, path: string): StripWhere | null {
  const entry = index.pictures[path];
  const pack = entry ? index.packs[entry[0]] : undefined;
  if (!entry || pack === undefined) return null;
  const [, offset, length, type] = entry;
  return { url: manifest.base + pack, range: `bytes=${offset}-${offset + length - 1}`, type };
}

/** A JSON file R2 keeps under its hash, from the browser's storage once kept there. */
async function jsonAt<T>(url: string): Promise<T> {
  return JSON.parse(new TextDecoder().decode((await contentBytes(url)).bytes)) as T;
}

/** A picture's bytes decoded to RGBA. The strips' alpha is all or nothing, so the canvas keeps every texel exact. */
async function decode(bytes: ArrayBuffer, type: string): Promise<Strip> {
  const options = { premultiplyAlpha: 'none', colorSpaceConversion: 'none' } as const;
  const bitmap = await createImageBitmap(new Blob([bytes], { type }), options);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('this browser cannot read pictures back');
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  return { width: canvas.width, height: canvas.height, data };
}

/** Two pictures lying side by side in one pack, as a strip and its depth do, as one range: where it lies, which of
 *  the two comes first, and how many of its bytes are the first's. Null for two that do not touch. */
export function joinedRange(
  one: StripWhere,
  other: StripWhere,
): { readonly where: StripWhere; readonly oneFirst: boolean; readonly split: number } | null {
  if (one.url !== other.url || one.type !== other.type) return null;
  const [oneStart, oneEnd] = rangeOf(one.range);
  const [otherStart, otherEnd] = rangeOf(other.range);
  const oneFirst = oneEnd + 1 === otherStart;
  if (!oneFirst && otherEnd + 1 !== oneStart) return null;
  const [start, end] = oneFirst ? [oneStart, otherEnd] : [otherStart, oneEnd];
  const split = oneFirst ? oneEnd - oneStart + 1 : otherEnd - otherStart + 1;
  return { where: { url: one.url, range: `bytes=${start}-${end}`, type: one.type }, oneFirst, split };
}

/** A range's first and last byte (`bytes=first-last`). */
function rangeOf(range: string): readonly [number, number] {
  const [first = Number.NaN, last = Number.NaN] = range.replace('bytes=', '').split('-').map(Number);
  return [first, last];
}

/** Packs are read a block of this many bytes at a time, each kept by the browser: the pictures a figure's moves ask
 *  for together lie together in a pack, so a burst of them comes in one request, and from the disk after. */
export const BLOCK_BYTES = 256 * 1024;
/** The blocks held here too, the latest asked for, so a burst reads each block once. */
const BLOCKS_HELD = 16;

type Read = (url: string, range: readonly [number, number]) => Promise<Fetched>;

/** A pack's bytes read a block at a time. */
export class PackBlocks {
  private readonly read: Read;
  private readonly held = new Map<string, Promise<{ readonly start: number; readonly bytes: ArrayBuffer }>>();

  constructor(read: Read = contentBytes) {
    this.read = read;
  }

  /** Bytes `first` to `last` (both included) of the pack at `url`, from the blocks they lie in. */
  async bytes(url: string, first: number, last: number): Promise<ArrayBuffer> {
    const wanted = new Uint8Array(last - first + 1);
    for (let block = Math.floor(first / BLOCK_BYTES); block <= Math.floor(last / BLOCK_BYTES); block++) {
      const { start, bytes } = await this.block(url, block);
      const [from, to] = [Math.max(first, block * BLOCK_BYTES), Math.min(last + 1, (block + 1) * BLOCK_BYTES)];
      if (from < start || to > start + bytes.byteLength)
        throw new Error(`${url} sent ${bytes.byteLength} bytes from ${start}, short of ${from}-${to - 1}`);
      wanted.set(new Uint8Array(bytes, from - start, to - from), from - first);
    }
    return wanted.buffer;
  }

  private block(url: string, block: number) {
    const key = `${url} ${block}`;
    const kept = this.held.get(key);
    this.held.delete(key);
    const reading =
      kept ??
      this.read(url, [block * BLOCK_BYTES, (block + 1) * BLOCK_BYTES - 1]).then(({ bytes, total }) => ({
        // A server that sent the whole pack for the range sent it from its start.
        start: bytes.byteLength === total ? 0 : block * BLOCK_BYTES,
        bytes,
      }));
    this.held.set(key, reading);
    // One that failed is asked for afresh the next time.
    reading.catch(() => this.held.get(key) === reading && this.held.delete(key));
    for (const oldest of this.held.keys()) {
      if (this.held.size <= BLOCKS_HELD) break;
      this.held.delete(oldest);
    }
    return reading;
  }
}

const blocks = new PackBlocks();

/** A picture's bytes from where it lies in its pack, not yet decoded. */
export function stripBytes(where: StripWhere): Promise<ArrayBuffer> {
  const [first, last] = rangeOf(where.range);
  return blocks.bytes(where.url, first, last);
}

/** A picture's bytes, fetched as `stripBytes` fetches them, decoded to RGBA. */
export const decodeStrip = decode;

/** A picture fetched from where it lies and decoded: on the page or in a worker, which has no pack index of its own. */
export async function stripAt(where: StripWhere): Promise<Strip> {
  return decode(await stripBytes(where), where.type);
}

/** The decoded strips the page keeps: the first person's art and a gear screen's figure. A figure's frames in the scene
 *  are composed in a worker, which keeps its own. */
export const PAGE_STRIP_BYTES = 96 * 1024 * 1024;

/** The forge's published renders: its tables, and each strip fetched from its pack and kept while there is room. */
export class ForgeStore {
  readonly manifest: Manifest;
  private readonly index: PackIndex;
  private readonly strips = new StripCache(PAGE_STRIP_BYTES);

  private constructor(manifest: Manifest, index: PackIndex) {
    this.manifest = manifest;
    this.index = index;
  }

  static async open(manifest: Manifest = renders): Promise<ForgeStore> {
    const index = await jsonAt<PackIndex>(manifest.base + manifest.index);
    return new ForgeStore(manifest, index);
  }

  /** One of the forge's tables (`looks`, `skins`, `hair`, `points-male`, `points-female`). */
  async table<T>(name: string): Promise<T> {
    const key = this.manifest.tables[name];
    if (!key) throw new Error(`the forge publishes no table named ${name}`);
    return jsonAt<T>(this.manifest.base + key);
  }

  /** Where a strip by the forge's path lies; null where nothing was rendered there. */
  where(path: string): StripWhere | null {
    return pictureRange(this.manifest, this.index, path);
  }

  /** A strip by the forge's path, decoded; null where nothing was rendered there. */
  strip(path: string): Promise<Strip | null> {
    return this.strips.get(path, () => {
      const where = this.where(path);
      return where ? stripAt(where) : Promise.resolve(null);
    });
  }
}
