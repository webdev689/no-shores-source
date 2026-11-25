// Pictures a server uploads for its messages: kept in the BOT_MEDIA bucket and served to anyone with the address, as
// Discord needs to fetch them. Only PNG, JPEG, GIF and WebP are kept, known by their first bytes, never by what the
// upload claims; each server is held to a number of files and a total size; every upload and removal is audited.

import { type Level, atLeast } from './law/access.ts';
import type { PanelUser } from './auth.ts';
import { randomHex } from './crypto.ts';
import { fail, json, readCapped } from './http.ts';
import { type Vars, errorWords } from './kit.ts';
import type { PanelContext } from './panel.ts';
import { scrubPicture } from './scrub.ts';
import { type Snapshot, audit } from './store.ts';

/** The part of an R2 bucket the bot uses. */
export interface Bucket {
  put(
    key: string,
    bytes: Uint8Array<ArrayBuffer>,
    options: { httpMetadata: { contentType: string } },
  ): Promise<unknown>;
  get(
    key: string,
  ): Promise<{ readonly body: ReadableStream | ArrayBuffer; readonly httpMetadata?: { contentType?: string } } | null>;
  delete(key: string): Promise<void>;
}

/** Where pictures are served: `/v1/media/<id>.<ext>`. */
export const MEDIA_PATH = '/v1/media/';
/** Where a picture is kept in the bucket, by its id: every reader and writer of the bucket goes through this. */
export const mediaKey = (id: string): string => `media/${id}`;
/** The largest picture kept: Discord's own limit for an upload without boosts. */
export const MEDIA_BYTES_MAX = 8 * 1024 * 1024;
/** How many pictures one server may keep. */
export const MEDIA_FILES_MAX = 100;
/** How much one server may keep in all. */
export const MEDIA_GUILD_BYTES_MAX = 200 * 1024 * 1024;
/** How long a served picture may be cached, in seconds, so that a removed one is not shown long after. */
export const MEDIA_CACHE_S = 86_400;

const asciiOf = (bytes: Uint8Array, from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));

/** The kinds kept, each known by its first bytes. */
const KINDS = Object.freeze([
  {
    type: 'image/png',
    ext: 'png',
    is: (bytes: Uint8Array) => bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47,
  },
  {
    type: 'image/jpeg',
    ext: 'jpg',
    is: (bytes: Uint8Array) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
  },
  {
    type: 'image/gif',
    ext: 'gif',
    is: (bytes: Uint8Array) => asciiOf(bytes, 0, 6) === 'GIF89a' || asciiOf(bytes, 0, 6) === 'GIF87a',
  },
  {
    type: 'image/webp',
    ext: 'webp',
    is: (bytes: Uint8Array) => asciiOf(bytes, 0, 4) === 'RIFF' && asciiOf(bytes, 8, 12) === 'WEBP',
  },
]);
/** A picture's kind from its bytes, or null for anything else. */
export const kindOf = (bytes: Uint8Array) =>
  bytes.length >= 12 ? (KINDS.find((kind) => kind.is(bytes)) ?? null) : null;
const extOf = (type: string) => KINDS.find((kind) => kind.type === type)?.ext ?? 'bin';

/** The address a picture is served at: the bot's own BOT_URL, or the address it was asked on. */
export function mediaUrl(vars: Vars, origin: string, id: string, type: string): string {
  const own = String(vars.BOT_URL ?? '').replace(/\/+$/, '');
  return `${/^https:\/\//.test(own) ? own : origin}${MEDIA_PATH}${id}.${extOf(type)}`;
}

/** The panel's pictures: GET lists them, POST uploads one (managers), DELETE .../media/<id> removes one (managers). */
export async function mediaRoute(
  context: PanelContext,
  request: Request,
  snapshot: Snapshot,
  level: Level,
  user: PanelUser,
  id: string,
): Promise<Response> {
  const { cors, database } = context;
  const bucket = context.media;
  if (!bucket) return fail('media-off', 503, cors, 'Picture uploads are not set up yet.');
  const origin = new URL(request.url).origin;
  if (request.method === 'GET' && !id) {
    const rows = await database
      .prepare('SELECT id, type, bytes, by_user, at FROM media WHERE guild_id = ? ORDER BY at DESC LIMIT ?')
      .bind(snapshot.guildId, MEDIA_FILES_MAX)
      .all<{ id: string; type: string; bytes: number; by_user: string; at: number }>();
    const files = rows.results.map((row) => ({
      id: String(row.id),
      url: mediaUrl(context.vars, origin, String(row.id), String(row.type)),
      bytes: Number(row.bytes),
      by: String(row.by_user),
      at: Number(row.at),
    }));
    return json({ files, filesMax: MEDIA_FILES_MAX, bytesMax: MEDIA_GUILD_BYTES_MAX }, 200, cors);
  }
  if (!atLeast(level, 'manager')) return fail('level', 403, cors, 'Managers upload and remove pictures.');
  const record = (action: string, target: string, detail: unknown) =>
    audit(database, {
      guildId: snapshot.guildId,
      actorId: user.id,
      actorName: user.globalName || user.username,
      source: 'panel',
      action,
      target,
      detail,
      nowS: context.nowS,
    });
  if (request.method === 'DELETE' && id) {
    const row = await database
      .prepare('SELECT id FROM media WHERE id = ? AND guild_id = ?')
      .bind(id, snapshot.guildId)
      .first();
    if (!row) return fail('media', 404, cors, 'There is no such picture.');
    await bucket.delete(mediaKey(id));
    await database.prepare('DELETE FROM media WHERE id = ?').bind(id).run();
    await record('media.remove', id, {});
    return json({ ok: true, message: 'Removed. Messages that show it may take a day or more to lose it.' }, 200, cors);
  }
  if (request.method !== 'POST' || id) return fail('route', 404, cors);
  return upload(context, request, snapshot, user, bucket, record);
}

async function upload(
  context: PanelContext,
  request: Request,
  snapshot: Snapshot,
  user: PanelUser,
  bucket: Bucket,
  record: (action: string, target: string, detail: unknown) => Promise<void>,
): Promise<Response> {
  const { cors, database } = context;
  const bytes = await readCapped(request, MEDIA_BYTES_MAX);
  if (!bytes) return fail('too-big', 413, cors, 'A picture may be at most 8 MB.');
  const kind = kindOf(bytes);
  if (!kind) return fail('kind', 415, cors, 'Only PNG, JPEG, GIF and WebP pictures are kept.');
  const clean = scrubPicture(bytes, kind.type);
  if (!clean) return fail('kind', 415, cors, 'That picture could not be read.');
  const fresh = randomHex();
  // the row is the picture's place in the server's share: written only while there is room, in one statement, so
  // uploads pressed together cannot all see room; the file follows it, and a file that is not kept takes it back
  const placed = await database
    .prepare(
      `INSERT INTO media (id, guild_id, type, bytes, by_user, at)
       SELECT ?, ?, ?, ?, ?, ?
       WHERE (SELECT COUNT(*) FROM media WHERE guild_id = ?) < ?
         AND (SELECT COALESCE(SUM(bytes), 0) FROM media WHERE guild_id = ?) + ? <= ?`,
    )
    .bind(
      fresh,
      snapshot.guildId,
      kind.type,
      clean.length,
      user.id,
      context.nowS,
      snapshot.guildId,
      MEDIA_FILES_MAX,
      snapshot.guildId,
      clean.length,
      MEDIA_GUILD_BYTES_MAX,
    )
    .run();
  if (placed.meta.changes !== 1)
    return fail(
      'full',
      409,
      cors,
      `This server has no room left: ${MEDIA_FILES_MAX} pictures or 200 MB. Remove one first.`,
    );
  try {
    await bucket.put(mediaKey(fresh), clean, { httpMetadata: { contentType: kind.type } });
  } catch (error) {
    await database.prepare('DELETE FROM media WHERE id = ?').bind(fresh).run();
    context.bot.log(`[bot] a picture was not kept: ${errorWords(error)}`);
    return fail('media-down', 503, cors, 'The picture could not be kept. Try again.');
  }
  await record('media.upload', fresh, { type: kind.type, bytes: clean.length });
  return json(
    { ok: true, url: mediaUrl(context.vars, new URL(request.url).origin, fresh, kind.type), message: 'Uploaded.' },
    200,
    cors,
  );
}

/**
 * GET /v1/media/<id>.<ext>: a kept picture, to anyone with its address. It never changes under its address, but it
 * can be removed, so the bot lets no cache keep it past a day. Discord's own copies keep to Discord's rules.
 */
export async function serveMedia(bucket: Bucket | null, path: string): Promise<Response> {
  const found = /^\/v1\/media\/([a-f0-9]{32})\.(png|jpg|gif|webp)$/.exec(path);
  const notFound = () => new Response('Not found', { status: 404 });
  if (!found || !bucket) return notFound();
  const object = await bucket.get(mediaKey(found[1]));
  if (!object) return notFound();
  const type = String(object.httpMetadata?.contentType ?? '');
  if (!KINDS.some((kind) => kind.type === type)) return notFound();
  return new Response(object.body, {
    status: 200,
    headers: {
      'content-type': type,
      'cache-control': `public, max-age=${MEDIA_CACHE_S}`,
      'access-control-allow-origin': '*',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'",
    },
  });
}
