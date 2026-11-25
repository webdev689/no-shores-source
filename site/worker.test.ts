import assert from 'node:assert/strict';
import { test } from 'node:test';
import worker, { type DownloadBucket, type DownloadObject, download, rangeOf } from './worker.ts';

const installer = 'No-Shores-2026.1125.1230-windows-x64-setup.exe';

/** A bucket holding `files` under the downloads' folder, read as R2 reads one range. */
function bucketOf(files: Record<string, string>): DownloadBucket {
  const objectOf = (key: string, range?: Headers): DownloadObject | null => {
    const text = files[key.replace(/^desktop\//, '')];
    if (text === undefined || !key.startsWith('desktop/')) return null;
    const asked = /^bytes=(\d+)-(\d*)$/.exec(range?.get('range') ?? '');
    const offset = asked ? Number(asked[1]) : 0;
    const end = asked?.[2] ? Number(asked[2]) + 1 : text.length;
    return {
      size: text.length,
      httpEtag: `"${text.length}"`,
      body: new Response(text.slice(offset, end)).body ?? undefined,
      range: asked ? { offset, length: end - offset } : undefined,
    };
  };
  return {
    get: async (key, options) => objectOf(key, options?.range),
    head: async (key) => objectOf(key),
  };
}

const bucket = bucketOf({
  'latest.yml': 'version: 2026.1125.1230\n',
  [installer]: '0123456789',
  'latest.json': JSON.stringify({ files: { windows: installer, 'mac-arm64': '../../secrets' } }),
});
const ask = (path: string, init?: RequestInit) => download(new Request(`https://noshores.online${path}`, init), bucket);

test('a feed is read afresh each time; an installer is kept for good and saved as a file', async () => {
  const feed = await ask('/download/latest.yml');
  assert.equal(feed.status, 200);
  assert.equal(await feed.text(), 'version: 2026.1125.1230\n');
  assert.equal(feed.headers.get('cache-control'), 'no-cache');
  const file = await ask(`/download/${installer}`);
  assert.equal(file.headers.get('cache-control'), 'public, max-age=31536000, immutable');
  assert.equal(file.headers.get('content-disposition'), `attachment; filename="${installer}"`);
  assert.equal(file.headers.get('accept-ranges'), 'bytes');
});

test('a range is answered with its bytes alone, as the updater asks for the parts that changed', async () => {
  const part = await ask(`/download/${installer}`, { headers: { range: 'bytes=2-5' } });
  assert.equal(part.status, 206);
  assert.equal(part.headers.get('content-range'), 'bytes 2-5/10');
  assert.equal(await part.text(), '2345');
});

test('a list of ranges, which R2 cannot read, is answered with the whole file', async () => {
  const whole = await ask(`/download/${installer}`, { headers: { range: 'bytes=0-1,4-5' } });
  assert.equal(whole.status, 200);
  assert.equal(await whole.text(), '0123456789');
});

test('a name that never moves sends the player to the newest installer of its kind', async () => {
  const moved = await ask('/download/windows');
  assert.equal(moved.status, 302);
  assert.equal(moved.headers.get('location'), `/download/${installer}`);
  assert.equal((await ask('/download/linux-deb')).status, 404, 'nothing of that kind released yet');
  assert.equal((await ask('/download/mac-arm64')).status, 404, 'a listed name that is no release file is refused');
});

test('only release files are read: no other key of the bucket, and nothing outside the folder', async () => {
  assert.equal((await ask('/download/latest.json')).status, 404);
  assert.equal((await ask('/download/../forge/index.json')).status, 404);
  assert.equal((await ask('/download/No-Shores-2026.1201.900-windows-x64-setup.exe')).status, 404);
  assert.equal((await ask(`/download/${installer}`, { method: 'POST' })).status, 405);
});

test('a HEAD says the size without the bytes', async () => {
  const head = await ask(`/download/${installer}`, { method: 'HEAD' });
  assert.equal(head.headers.get('content-length'), '10');
  assert.equal(await head.text(), '');
});

test('every other address is the static files', async () => {
  const env = { ASSETS: { fetch: async () => new Response('the site') }, DOWNLOADS: bucket };
  assert.equal(await (await worker.fetch(new Request('https://noshores.online/play/'), env)).text(), 'the site');
});

test("a range's bytes are named from its offset, its length or its suffix", () => {
  assert.equal(rangeOf(undefined, 10), null);
  assert.equal(rangeOf({ offset: 0, length: 10 }, 10), null);
  assert.equal(rangeOf({ offset: 4 }, 10), '4-9/10');
  assert.equal(rangeOf({ suffix: 3 }, 10), '7-9/10');
});

test('a latest.json that does not read sends no one anywhere, and a range R2 cannot read is said to be one', async () => {
  const broken = bucketOf({ 'latest.json': '{ not json' });
  const moved = await download(new Request('https://noshores.online/download/windows'), broken);
  assert.equal(moved.status, 404);
  const refusing: DownloadBucket = {
    get: async (_key, options) => {
      if (options?.range) throw new Error('InvalidRange');
      return null;
    },
    head: async () => null,
  };
  const range = await download(
    new Request(`https://noshores.online/download/${installer}`, { headers: { range: 'bytes=900-999' } }),
    refusing,
  );
  assert.equal(range.status, 416);
});
