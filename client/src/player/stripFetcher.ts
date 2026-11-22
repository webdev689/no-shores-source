// A worker's strips, fetched and decoded. A strip and its depth are fetched as one range where the pack lays them side
// by side; every move of a new dress is fetched ahead of need, a few at a time; and the fetched bytes are kept apart
// from the decoded sheets, so a sheet let go is decoded again rather than fetched.
import type { Strip } from '../forge/compose.ts';
import { type StripWhere, joinedRange } from '../forge/store.ts';
import { StripCache } from '../forge/stripCache.ts';

/** Where each strip a message names lies, as the page told it. */
export type Places = Readonly<Record<string, StripWhere | null>>;

/** How many strips are fetched ahead at once: as many as a browser fetches at a time from one place over HTTP/1.1,
 *  so a strip a frame waits for queues behind no more than one round of them. */
export const AHEAD_AT_ONCE = 6;

/** The decoded sheets kept: a few dresses' moves, each used for every view and frame of its move. */
const DECODED_BYTES = 128 * 1024 * 1024;
/** The fetched bytes kept here: the moves of the dresses lately shown. The packs' blocks are kept by the browser
 *  besides (`forge/store.ts`), so a strip let go here is read again from the disk, not the network. */
const FETCHED_BYTES = 32 * 1024 * 1024;

/** The path of a strip's depth (`_z`), or of the strip a depth belongs to. */
export const twinOf = (path: string): string =>
  path.endsWith('_z.png') ? path.replace(/_z\.png$/, '.png') : path.replace(/\.png$/, '_z.png');

export class StripFetcher {
  private readonly decoded = new StripCache(DECODED_BYTES);
  private readonly fetched = new StripCache<ArrayBuffer>(FETCHED_BYTES, (bytes) => bytes.byteLength);
  private readonly fetchRange: (where: StripWhere) => Promise<ArrayBuffer>;
  private readonly decode: (bytes: ArrayBuffer, type: string) => Promise<Strip>;
  /** The strips asked for ahead, a list for each dress in the order its moves are likeliest shown, with how far along
   *  it the fetching is. */
  private readonly ahead: { readonly strips: readonly string[]; readonly places: Places; next: number }[] = [];
  private aheadNow = 0;

  constructor(
    fetchRange: (where: StripWhere) => Promise<ArrayBuffer>,
    decode: (bytes: ArrayBuffer, type: string) => Promise<Strip>,
  ) {
    this.fetchRange = fetchRange;
    this.decode = decode;
  }

  /** The strip at `path`, decoded: kept, or fetched (or taken from its bytes kept) and decoded. One the page said
   *  nothing of is none, and not kept as missing, since it may be drawn after all. */
  strip(path: string, places: Places): Promise<Strip | null> {
    if (places[path] === undefined) return Promise.resolve(null);
    return this.decoded.get(path, async () => {
      const where = places[path];
      const bytes = await this.bytes(path, places);
      return bytes && where ? this.decode(bytes, where.type) : null;
    });
  }

  /** Fetches every strip of `places` ahead of need, after those already asked for ahead: each dress's next in turn, so
   *  a crowd's dresses all have their first moves soon, while fewer than `AHEAD_AT_ONCE` are on their way. */
  fetchAhead(places: Places): void {
    this.ahead.push({ strips: Object.keys(places), places, next: 0 });
    this.pump();
  }

  /** A strip's bytes, kept or fetched; with its twin in one range where the two lie side by side. A joined range that
   *  fails falls back to each strip's own. */
  private bytes(path: string, places: Places): Promise<ArrayBuffer | null> {
    const where = places[path];
    const twin = twinOf(path);
    const twinWhere = places[twin];
    const joined =
      where && twinWhere && !this.fetched.has(path) && !this.fetched.has(twin) && joinedRange(where, twinWhere);
    if (joined) {
      const both = this.fetchRange(joined.where);
      const [first, second] = joined.oneFirst ? [where, twinWhere] : [twinWhere, where];
      const [firstPath, secondPath] = joined.oneFirst ? [path, twin] : [twin, path];
      this.fetched.get(firstPath, () =>
        both.then(
          (bytes) => bytes.slice(0, joined.split),
          () => this.fetchRange(first),
        ),
      );
      this.fetched.get(secondPath, () =>
        both.then(
          (bytes) => bytes.slice(joined.split),
          () => this.fetchRange(second),
        ),
      );
    }
    return this.fetched.get(path, () => (where ? this.fetchRange(where) : Promise.resolve(null)));
  }

  private pump(): void {
    while (this.aheadNow < AHEAD_AT_ONCE) {
      const dress = this.ahead.shift();
      if (!dress) return;
      const path = dress.strips[dress.next++];
      if (dress.next < dress.strips.length) this.ahead.push(dress);
      // One held, or on its way (a joined fetch's twin, a frame's own), takes no turn.
      if (!path || this.fetched.has(path) || this.decoded.has(path)) continue;
      this.aheadNow += 1;
      this.bytes(path, dress.places)
        .catch(() => {
          // Let go at once, with its twin, so a frame that wants either fetches it again rather than wait on this.
          this.fetched.forget(path);
          this.fetched.forget(twinOf(path));
        })
        .finally(() => {
          this.aheadNow -= 1;
          this.pump();
        });
    }
  }
}
