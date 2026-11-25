// noshores.online's Worker. The site and the game are its static files, answered without this script; it runs only for
// the desktop app's downloads, `/download/`, read from the game's R2 bucket under `desktop/`. There stand each
// release's installers, named by their version and never changed, the update feeds (`latest*.yml`) the installed
// copies read, and `latest.json`, which names the newest installer for each of the names that never move
// (`/download/windows` and its kin), the site's links and a copy that cannot update itself go to.

/** The bucket as the script reads it: the binding's `get` and `head`, typed as far as they are used. */
export interface DownloadBucket {
  get(key: string, options?: { range?: Headers }): Promise<DownloadObject | null>;
  head(key: string): Promise<DownloadObject | null>;
}
export interface DownloadObject {
  readonly size: number;
  readonly httpEtag: string;
  readonly body?: ReadableStream;
  readonly range?: { readonly offset?: number; readonly length?: number; readonly suffix?: number };
}
export interface SiteEnv {
  readonly ASSETS: { fetch(request: Request): Promise<Response> };
  readonly DOWNLOADS: DownloadBucket;
}

/** Where the downloads stand in the bucket, and the names that never move, each the newest of its kind. */
export const DOWNLOAD_PREFIX = 'desktop/';
export const LATEST_NAMES = ['windows', 'mac-arm64', 'mac-x64', 'linux-appimage', 'linux-deb'] as const;
/** A release's own file: an installer, its block map, or a feed. */
const RELEASE_FILE =
  /^(No-Shores-[0-9]+\.[0-9]+\.[0-9]+-[a-z0-9_-]+\.(exe|dmg|zip|AppImage|deb)(\.blockmap)?|latest(-mac|-linux)?\.yml)$/;

const KINDS: Readonly<Record<string, string>> = {
  yml: 'text/yaml; charset=utf-8',
  exe: 'application/vnd.microsoft.portable-executable',
  dmg: 'application/x-apple-diskimage',
  zip: 'application/zip',
  deb: 'application/vnd.debian.binary-package',
};

/** A feed is read again on every check; an installer never changes under its name. */
const cachingOf = (name: string) => (name.endsWith('.yml') ? 'no-cache' : 'public, max-age=31536000, immutable');

function headersOf(name: string, object: DownloadObject): Headers {
  const headers = new Headers({
    'content-type': KINDS[name.split('.').pop() ?? ''] ?? 'application/octet-stream',
    'cache-control': cachingOf(name),
    'etag': object.httpEtag,
    'accept-ranges': 'bytes',
  });
  if (!name.endsWith('.yml')) headers.set('content-disposition', `attachment; filename="${name}"`);
  return headers;
}

/** The bytes a range answer holds, as `start-end/size`, or null for the whole file. */
export function rangeOf(range: DownloadObject['range'], size: number): string | null {
  if (!range) return null;
  const start = range.suffix !== undefined ? Math.max(0, size - range.suffix) : (range.offset ?? 0);
  const length = range.suffix !== undefined ? size - start : (range.length ?? size - start);
  if (start === 0 && length === size) return null;
  return `${start}-${start + length - 1}/${size}`;
}

/** The answer to `/download/<name>`. */
export async function download(request: Request, bucket: DownloadBucket): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD')
    return new Response('only GET and HEAD', { status: 405, headers: { allow: 'GET, HEAD' } });
  const name = new URL(request.url).pathname.slice('/download/'.length);
  if ((LATEST_NAMES as readonly string[]).includes(name)) {
    const listed = await bucket.get(`${DOWNLOAD_PREFIX}latest.json`);
    // A list that does not read names nothing.
    const files = listed?.body
      ? ((await new Response(listed.body).json().catch(() => null)) as { files?: Record<string, string> } | null)?.files
      : null;
    const file = files?.[name];
    if (!file || !RELEASE_FILE.test(file)) return new Response('no release yet', { status: 404 });
    return new Response(null, {
      status: 302,
      headers: { 'location': `/download/${file}`, 'cache-control': 'no-cache' },
    });
  }
  if (!RELEASE_FILE.test(name)) return new Response('not found', { status: 404 });
  const key = `${DOWNLOAD_PREFIX}${name}`;
  if (request.method === 'HEAD') {
    const object = await bucket.head(key);
    if (!object) return new Response(null, { status: 404 });
    const headers = headersOf(name, object);
    headers.set('content-length', String(object.size));
    return new Response(null, { headers });
  }
  // One range a request, as R2 reads them; a list of ranges is answered with the whole file.
  const asked = request.headers.get('range');
  const single = asked !== null && !asked.includes(',');
  // R2 refuses a range past the file's end by throwing, which is the asker's mistake, not the Worker's.
  const object = await bucket.get(key, single ? { range: request.headers } : {}).catch((error: unknown) => {
    if (single) return 'unsatisfiable' as const;
    throw error;
  });
  if (object === 'unsatisfiable') return new Response('range not satisfiable', { status: 416 });
  if (!object?.body) return new Response('not found', { status: 404 });
  const headers = headersOf(name, object);
  const part = single ? rangeOf(object.range, object.size) : null;
  if (part === null) return new Response(object.body, { headers });
  headers.set('content-range', `bytes ${part}`);
  return new Response(object.body, { status: 206, headers });
}

export default {
  fetch(request: Request, env: SiteEnv): Promise<Response> {
    const url = new URL(request.url);
    return url.pathname.startsWith('/download/') ? download(request, env.DOWNLOADS) : env.ASSETS.fetch(request);
  },
};
