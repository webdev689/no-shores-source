// The game's files from R2, kept in the browser's own storage. Every file there is named by the hash of its bytes, so
// what was fetched once is the same for ever: on a later visit, or when an area let go comes back, it is read from
// the disk rather than fetched again. Where the browser keeps no such storage (an insecure page, Node), each is
// fetched each time it is asked for.

const STORE = 'overlook-content';
/** What the storage keeps before the files kept longest ago are let go; checked every TRIM_EVERY files kept. */
export const STORED_BYTES = 1024 * 1024 * 1024;
const TRIM_EVERY = 64;

/** A file's bytes, or a range of them, and the whole file's size where the answer says it. */
export interface Fetched {
  readonly bytes: ArrayBuffer;
  readonly total: number | null;
}

let store: Promise<Cache | null> | null = null;

let keptSince = 0;

const opened = (): Promise<Cache | null> =>
  (store ??=
    typeof caches === 'undefined'
      ? Promise.resolve(null)
      : caches.open(STORE).then(
          (kept) => (void trimmed(kept), kept),
          (): Cache | null => null,
        ));

/** The storage brought back within STORED_BYTES, as the browser reckons what the page keeps. */
async function trimmed(kept: Cache): Promise<void> {
  const usage = (await navigator.storage?.estimate?.().catch(() => undefined))?.usage ?? 0;
  await trimStored(kept, usage, STORED_BYTES).catch(() => undefined);
}

/** Lets go of the files kept longest ago, a store's keys being in the order they were kept, until `usage` is a tenth
 *  under `most`. */
export async function trimStored(
  kept: Pick<Cache, 'keys' | 'match' | 'delete'>,
  usage: number,
  most: number,
): Promise<void> {
  let over = usage - most * 0.9;
  if (usage <= most) return;
  for (const request of await kept.keys()) {
    if (over <= 0) return;
    const size = Number((await kept.match(request))?.headers.get('x-size')) || 0;
    await kept.delete(request);
    over -= size;
  }
}

/** The size a range's answer gives for the whole file (`bytes 0-99/833356`), if it gives one. */
export function totalOfRange(contentRange: string | null): number | null {
  const total = Number(contentRange?.split('/')[1]);
  return Number.isFinite(total) && total > 0 ? total : null;
}

/** `url`'s bytes, or bytes `first` to `last` of it (both included): from the browser's storage once kept there,
 *  else fetched and kept. A server that sends the whole file for a range is taken at its word. */
export async function contentBytes(url: string, range?: readonly [first: number, last: number]): Promise<Fetched> {
  // Kept under an address of its own for each range; a fragment would be dropped when the store matches.
  const key = range ? `${url}?bytes=${range[0]}-${range[1]}` : url;
  const kept = await opened();
  const found = await kept?.match(key).catch(() => undefined);
  if (found) return { bytes: await found.arrayBuffer(), total: totalOfRange(found.headers.get('x-total')) };
  const fetched = await whole(url, range);
  // The store's copy is a copy: decoding the bytes handed back may take them.
  const headers = { 'x-total': `/${fetched.total ?? ''}`, 'x-size': String(fetched.bytes.byteLength) };
  if (kept) {
    void kept.put(key, new Response(fetched.bytes.slice(0), { headers })).catch(() => undefined);
    if (++keptSince % TRIM_EVERY === 0) void trimmed(kept);
  }
  return fetched;
}

/** Fetched, and whole: a cache can hand back a range cut short with no error, so one short is fetched again past the
 *  cache, and still short it fails rather than hand on a part. */
async function whole(url: string, range: readonly [number, number] | undefined): Promise<Fetched> {
  let short = '';
  for (const cache of ['default', 'reload'] as const) {
    const answer = await fetch(url, range ? { headers: { range: `bytes=${range[0]}-${range[1]}` }, cache } : { cache });
    if (!answer.ok) throw new Error(`${url} answered ${answer.status}`);
    const bytes = await answer.arrayBuffer();
    const total = answer.status === 206 ? totalOfRange(answer.headers.get('content-range')) : bytes.byteLength;
    const wanted =
      range && answer.status === 206 ? Math.min(range[1], (total ?? Infinity) - 1) - range[0] + 1 : bytes.byteLength;
    if (bytes.byteLength === wanted) return { bytes, total };
    short = `${url} sent ${bytes.byteLength} of ${wanted} bytes`;
  }
  throw new Error(short);
}
