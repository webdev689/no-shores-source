// The game's files from R2, kept in the browser's own storage. Every file there is named by the hash of its bytes, so
// what was fetched once is the same for ever: on a later visit, or when an area let go comes back, it is read from
// the disk rather than fetched again. Where the browser keeps no such storage (an insecure page, Node), each is
// fetched each time it is asked for.

const STORE = 'overlook-content';

/** A file's bytes, or a range of them, and the whole file's size where the answer says it. */
export interface Fetched {
  readonly bytes: ArrayBuffer;
  readonly total: number | null;
}

let store: Promise<Cache | null> | null = null;

const opened = (): Promise<Cache | null> =>
  (store ??=
    typeof caches === 'undefined' ? Promise.resolve(null) : caches.open(STORE).catch((): Cache | null => null));

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
  const answer = await fetch(url, range ? { headers: { range: `bytes=${range[0]}-${range[1]}` } } : undefined);
  if (!answer.ok) throw new Error(`${url} answered ${answer.status}`);
  const bytes = await answer.arrayBuffer();
  const total = answer.status === 206 ? totalOfRange(answer.headers.get('content-range')) : bytes.byteLength;
  // The store's copy is a copy: decoding the bytes handed back may take them.
  const copy = new Response(bytes.slice(0), { headers: { 'x-total': `/${total ?? ''}` } });
  void kept?.put(key, copy).catch(() => undefined);
  return { bytes, total };
}
