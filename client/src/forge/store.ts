import renders from '../../../content/forge/renders.json' with { type: 'json' };
import type { Strip } from './compose.ts';

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

/** The URL and byte range a picture lies at, or null where the index has no such picture. */
export function pictureRange(
  manifest: Manifest,
  index: PackIndex,
  path: string,
): { url: string; range: string; type: string } | null {
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

/** The forge's published renders: its tables, and each strip fetched from its pack once and kept. */
export class ForgeStore {
  readonly manifest: Manifest;
  private readonly index: PackIndex;
  private readonly strips = new Map<string, Promise<Strip | null>>();

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

  /** A strip by the forge's path, decoded; null where nothing was rendered there. */
  strip(path: string): Promise<Strip | null> {
    const kept = this.strips.get(path);
    if (kept) return kept;
    const where = pictureRange(this.manifest, this.index, path);
    const loading = where
      ? fetched(where.url, { headers: { range: where.range } })
          .then((answer) => answer.arrayBuffer())
          .then((bytes) => decode(bytes, where.type))
      : Promise.resolve(null);
    // A failed fetch is forgotten, so the next ask tries again.
    loading.catch(() => this.strips.delete(path));
    this.strips.set(path, loading);
    return loading;
  }
}
