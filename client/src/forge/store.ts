import renders from '../../../content/forge/renders.json' with { type: 'json' };
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

async function fetched(url: string, init?: RequestInit): Promise<Response> {
  const answer = await fetch(url, init);
  if (!answer.ok) throw new Error(`${url} answered ${answer.status}`);
  return answer;
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

/** How many bytes a range asks for (`bytes=first-last`). */
export function rangeLength(range: string): number {
  const [first = Number.NaN, last = Number.NaN] = range.replace('bytes=', '').split('-').map(Number);
  return last - first + 1;
}

/** A picture's bytes fetched from where it lies, not yet decoded. A cache can hand back a range cut short with no
 *  error, so a body shorter than its range is fetched again past it. */
export async function stripBytes(where: StripWhere): Promise<ArrayBuffer> {
  const wanted = rangeLength(where.range);
  let bytes = await (await fetched(where.url, { headers: { range: where.range } })).arrayBuffer();
  if (bytes.byteLength !== wanted)
    bytes = await (await fetched(where.url, { headers: { range: where.range }, cache: 'reload' })).arrayBuffer();
  if (bytes.byteLength !== wanted) throw new Error(`${where.url} sent ${bytes.byteLength} of ${wanted} bytes`);
  return bytes;
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
    const index = (await (await fetched(manifest.base + manifest.index)).json()) as PackIndex;
    return new ForgeStore(manifest, index);
  }

  /** One of the forge's tables (`looks`, `skins`, `hair`, `points-male`, `points-female`). */
  async table<T>(name: string): Promise<T> {
    const key = this.manifest.tables[name];
    if (!key) throw new Error(`the forge publishes no table named ${name}`);
    return (await (await fetched(this.manifest.base + key)).json()) as T;
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
