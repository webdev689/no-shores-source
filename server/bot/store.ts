// The bot's database reads and writes: module settings, the servers the Gateway has seen, and the audit log.

import { type Settings, channelsWithin, defaults, emojisWithin, recordOf, salvage } from './law/settings.ts';
import { moduleOf } from './law/modules.ts';
import type { Grant } from './law/access.ts';

/** The part of Cloudflare D1 the bot uses, so its rules run on the Worker's database and on SQLite in tests. */
export interface Statement {
  bind(...values: unknown[]): Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ readonly results: T[] }>;
  run(): Promise<{ readonly meta: { readonly changes: number; readonly last_row_id: number } }>;
}
export interface Db {
  prepare(sql: string): Statement;
}

/** The most audit rows one read returns. */
export const AUDIT_PAGE = 50;
/** How long audit rows are kept, in seconds. */
export const AUDIT_KEEP_S = 180 * 86_400;
/**
 * The most servers a person's list of servers weighs, by name: each is a question to Discord, since the panel's
 * sign-in does not ask Discord for a person's servers. A server past it still opens by its address.
 */
export const LISTED_MAX = 50;
/** The most server emoji kept: Discord's own cap for a server at its highest boost. */
export const EMOJIS_KEPT = 500;

export interface SnapshotRole {
  readonly id: string;
  readonly name: string;
  readonly color: number;
  readonly position: number;
  readonly permissions: string;
  readonly managed: boolean;
  readonly mentionable: boolean;
}
export interface SnapshotChannel {
  readonly id: string;
  readonly name: string;
  readonly type: number;
  readonly parentId: string | null;
  readonly position: number;
}
export interface SnapshotEmoji {
  readonly id: string;
  readonly name: string;
  readonly animated: boolean;
}
/** What the Gateway last saw of a server, so the panel can list its channels and roles without asking Discord. */
export interface Snapshot {
  guildId: string;
  name: string;
  icon: string | null;
  ownerId: string;
  memberCount: number;
  roles: SnapshotRole[];
  channels: SnapshotChannel[];
  emojis: SnapshotEmoji[];
  present: boolean;
  updatedAt: number;
}

/** A module's settings in a server, as read. */
export interface ReadSettings {
  readonly config: Settings;
  readonly enabled: boolean;
  readonly rev: number;
  readonly updatedAt: number;
  readonly updatedBy: string;
}

const parse = <T>(text: string, fallback: T): T => {
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
};

/**
 * A module's settings in a server: the saved ones checked against today's schema, or the defaults. A channel they name
 * that is not one of the server's own is taken out, so no setting can make the bot post in, or rename, another
 * server's channel. `known` is the server's snapshot where the caller holds it already.
 */
export async function readConfig(
  database: Db,
  guildId: string,
  moduleId: string,
  known?: Snapshot | null,
): Promise<ReadSettings | null> {
  const shape = moduleOf(moduleId);
  if (!shape) return null;
  const row = await database
    .prepare('SELECT config, enabled, rev, updated_at, updated_by FROM guild_config WHERE guild_id = ? AND module = ?')
    .bind(guildId, moduleId)
    .first<{ config: string; enabled: number; rev: number; updated_at: number; updated_by: string }>();
  if (!row) return { config: defaults(shape.schema), enabled: !!shape.alwaysOn, rev: 0, updatedAt: 0, updatedBy: '' };
  // A setting saved under an older schema may no longer fit: what still can is kept, and only the rest is defaulted.
  const own = known ?? (await readSnapshot(database, guildId));
  const channels = new Set((own?.channels ?? []).map((channel) => channel.id));
  const within = channelsWithin(shape.schema, salvage(shape.schema, parse(row.config, {})), channels);
  return {
    config: own ? emojisWithin(shape.schema, within, new Set(own.emojis.map((emoji) => emoji.id))) : within,
    enabled: !!shape.alwaysOn || row.enabled === 1,
    rev: Number(row.rev),
    updatedAt: Number(row.updated_at),
    updatedBy: String(row.updated_by),
  };
}

/** A save of a module's settings, made against the revision its writer saw. */
export interface ConfigWrite {
  readonly guildId: string;
  readonly moduleId: string;
  readonly config: Settings;
  readonly enabled: boolean;
  readonly rev: number;
  readonly by: string;
  readonly nowS: number;
}

/**
 * Save a module's settings when the caller saw the latest revision. Answers the new revision, or `stale` with the
 * revision that is there now.
 */
export async function writeConfig(
  database: Db,
  write: ConfigWrite,
): Promise<{ ok: true; rev: number } | { ok: false; stale: number }> {
  const text = JSON.stringify(write.config);
  const enabled = write.enabled ? 1 : 0;
  const result =
    write.rev === 0
      ? await database
          .prepare(
            `INSERT INTO guild_config (guild_id, module, config, enabled, rev, updated_at, updated_by)
             VALUES (?, ?, ?, ?, 1, ?, ?) ON CONFLICT DO NOTHING`,
          )
          .bind(write.guildId, write.moduleId, text, enabled, write.nowS, write.by)
          .run()
      : await database
          .prepare(
            `UPDATE guild_config SET config = ?, enabled = ?, rev = rev + 1, updated_at = ?, updated_by = ?
             WHERE guild_id = ? AND module = ? AND rev = ?`,
          )
          .bind(text, enabled, write.nowS, write.by, write.guildId, write.moduleId, write.rev)
          .run();
  if (result.meta.changes === 1) return { ok: true, rev: write.rev + 1 };
  const there = await database
    .prepare('SELECT rev FROM guild_config WHERE guild_id = ? AND module = ?')
    .bind(write.guildId, write.moduleId)
    .first<{ rev: number }>();
  return { ok: false, stale: Number(there?.rev ?? 0) };
}

/** One change made through the panel or the bot. */
export interface AuditEntry {
  readonly guildId: string;
  readonly actorId: string;
  readonly actorName?: string;
  readonly source: 'panel' | 'discord' | 'bot';
  readonly action: string;
  readonly target?: string;
  readonly detail?: unknown;
  readonly nowS: number;
}

export async function audit(database: Db, entry: AuditEntry): Promise<void> {
  await database
    .prepare(
      `INSERT INTO audit_log (guild_id, at, actor_id, actor_name, source, action, target, detail)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      entry.guildId,
      entry.nowS,
      entry.actorId,
      String(entry.actorName ?? '').slice(0, 100),
      entry.source,
      entry.action,
      String(entry.target ?? '').slice(0, 200),
      JSON.stringify(entry.detail ?? {}).slice(0, 8_000),
    )
    .run();
}

/** A page of a server's audit log, newest first, before row `before` when given. */
export async function readAudit(database: Db, guildId: string, given = 0) {
  const before = Number.isSafeInteger(given) && given > 0 ? given : 0;
  const result = await database
    .prepare('SELECT * FROM audit_log WHERE guild_id = ? AND (? = 0 OR id < ?) ORDER BY id DESC LIMIT ?')
    .bind(guildId, before, before, AUDIT_PAGE)
    .all<Record<string, unknown>>();
  return result.results.map((row) => ({
    id: Number(row.id),
    at: Number(row.at),
    actorId: String(row.actor_id),
    actorName: String(row.actor_name),
    source: String(row.source),
    action: String(row.action),
    target: String(row.target),
    detail: parse<unknown>(String(row.detail), {}),
  }));
}

export async function writeSnapshot(database: Db, snapshot: Snapshot): Promise<void> {
  await database
    .prepare(
      `INSERT INTO guild_snapshot (guild_id, name, icon, owner_id, member_count, roles, channels, emojis, present,
         updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (guild_id) DO UPDATE SET name = excluded.name, icon = excluded.icon, owner_id = excluded.owner_id,
         member_count = excluded.member_count, roles = excluded.roles, channels = excluded.channels,
         emojis = excluded.emojis, present = excluded.present, updated_at = excluded.updated_at`,
    )
    .bind(
      snapshot.guildId,
      snapshot.name,
      snapshot.icon,
      snapshot.ownerId,
      snapshot.memberCount,
      JSON.stringify(snapshot.roles),
      JSON.stringify(snapshot.channels),
      JSON.stringify(snapshot.emojis),
      snapshot.present ? 1 : 0,
      snapshot.updatedAt,
    )
    .run();
}

const snapshotOfRow = (row: Record<string, unknown>): Snapshot => ({
  guildId: String(row.guild_id),
  name: String(row.name),
  icon: row.icon ? String(row.icon) : null,
  ownerId: String(row.owner_id),
  memberCount: Number(row.member_count),
  roles: parse(String(row.roles), []),
  channels: parse(String(row.channels), []),
  emojis: parse(String(row.emojis ?? '[]'), []),
  present: row.present === 1,
  updatedAt: Number(row.updated_at),
});

export async function readSnapshot(database: Db, guildId: string): Promise<Snapshot | null> {
  const row = await database
    .prepare('SELECT * FROM guild_snapshot WHERE guild_id = ?')
    .bind(guildId)
    .first<Record<string, unknown>>();
  return row ? snapshotOfRow(row) : null;
}

/** A server as a person's list of servers weighs it: what the access law reads, and the panel's grants in it. */
export interface ListedServer {
  readonly guildId: string;
  readonly name: string;
  readonly icon: string | null;
  readonly ownerId: string;
  readonly roles: SnapshotRole[];
  readonly grants: readonly Grant[];
}

/** The servers the bot is in, by name, up to `most`, each with its panel grants: one read, whatever their number. */
export async function listedServers(database: Db, most = LISTED_MAX): Promise<ListedServer[]> {
  const result = await database
    .prepare(
      `SELECT s.guild_id, s.name, s.icon, s.owner_id, s.roles, c.config AS core FROM guild_snapshot s
       LEFT JOIN guild_config c ON c.guild_id = s.guild_id AND c.module = 'core'
       WHERE s.present = 1 ORDER BY s.name LIMIT ?`,
    )
    .bind(most)
    .all<Record<string, unknown>>();
  const core = moduleOf('core')?.schema ?? {};
  return result.results.map((row) => {
    const grants = row.core ? salvage(core, parse(String(row.core), {})).panelGrants : [];
    return {
      guildId: String(row.guild_id),
      name: String(row.name),
      icon: row.icon ? String(row.icon) : null,
      ownerId: String(row.owner_id),
      roles: parse(String(row.roles), []),
      grants: Array.isArray(grants) ? (grants as Grant[]) : [],
    };
  });
}

/** Every server the bot is in. */
export async function presentGuilds(database: Db): Promise<Snapshot[]> {
  const result = await database
    .prepare('SELECT * FROM guild_snapshot WHERE present = 1 ORDER BY name')
    .all<Record<string, unknown>>();
  return result.results.map(snapshotOfRow);
}

export const roleOf = (given: unknown): SnapshotRole => {
  const role = recordOf(given);
  return {
    id: String(role.id),
    name: String(role.name ?? ''),
    color: Number(role.color) || 0,
    position: Number(role.position) || 0,
    permissions: String(role.permissions ?? '0'),
    managed: !!role.managed,
    mentionable: !!role.mentionable,
  };
};

export const channelOf = (given: unknown): SnapshotChannel => {
  const channel = recordOf(given);
  return {
    id: String(channel.id),
    name: String(channel.name ?? ''),
    type: Number(channel.type) || 0,
    parentId: channel.parent_id ? String(channel.parent_id) : null,
    position: Number(channel.position) || 0,
  };
};

/** A server's emoji as the panel's picker needs them: usable ones, by id and name. */
export const emojisOf = (emojis: unknown): SnapshotEmoji[] =>
  (Array.isArray(emojis) ? emojis : [])
    .map(recordOf)
    .filter((emoji) => emoji.id && emoji.available !== false)
    .slice(0, EMOJIS_KEPT)
    .map((emoji) => ({ id: String(emoji.id), name: String(emoji.name ?? 'emoji'), animated: !!emoji.animated }));

/** A Discord guild object, as the Gateway sends it, reduced to what the panel shows. */
export function snapshotOfGuild(given: unknown, nowS: number): Snapshot {
  const guild = recordOf(given);
  return {
    guildId: String(guild.id),
    name: String(guild.name ?? ''),
    icon: guild.icon ? String(guild.icon) : null,
    ownerId: String(guild.owner_id ?? ''),
    memberCount: Number(guild.member_count) || 0,
    roles: (Array.isArray(guild.roles) ? guild.roles : []).map(roleOf),
    channels: (Array.isArray(guild.channels) ? guild.channels : []).map(channelOf),
    emojis: emojisOf(guild.emojis),
    present: true,
    updatedAt: nowS,
  };
}

/** How long each kind of row outlives its use, in seconds. */
export interface SweepLimits {
  readonly stateS: number;
  readonly ticketS: number;
  readonly sessionIdleS: number;
  readonly sessionMaxS: number;
}

/** Remove what has outlived its use: sign-ins never finished, tickets never collected, idle sessions, old audit rows. */
export async function sweep(database: Db, nowS: number, limits: SweepLimits): Promise<void> {
  await database
    .prepare('DELETE FROM oauth_states WHERE created_at < ?')
    .bind(nowS - limits.stateS)
    .run();
  await database
    .prepare('DELETE FROM panel_tickets WHERE created_at < ?')
    .bind(nowS - limits.ticketS)
    .run();
  await database
    .prepare('DELETE FROM panel_sessions WHERE last_seen < ? OR created_at < ?')
    .bind(nowS - limits.sessionIdleS, nowS - limits.sessionMaxS)
    .run();
  await database
    .prepare('DELETE FROM audit_log WHERE at < ?')
    .bind(nowS - AUDIT_KEEP_S)
    .run();
}

/** How long the bot keeps what it held for a server after leaving it, in case it is added back: a month. */
export const LEFT_KEEP_S = 30 * 86_400;
/** How long a closed ticket's row is kept; its transcript was posted when it closed. */
export const CLOSED_TICKET_KEEP_S = 30 * 86_400;
/** How many servers one sweep forgets, so a sweep after a long outage stays small. */
const FORGET_AT_ONCE = 10;
/** Every table that keeps rows for a server by its id. */
export const SERVER_TABLES = [
  'announce_posts',
  'announce_sent',
  'audit_log',
  'birthdays',
  'bot_ban_asks',
  'giveaways',
  'guild_config',
  'invite_joins',
  'levels',
  'media',
  'mod_cases',
  'raid_mode',
  'rolemenu_posts',
  'social_seen',
  'starboard_posts',
  'temp_voice',
  'tickets',
  'welcome_pending',
] as const;

/**
 * Forgets every server the bot left more than LEFT_KEEP_S ago: its pictures (through `removeMedia`, by their keys)
 * and its rows in every table, then its snapshot; and drops tickets closed more than CLOSED_TICKET_KEEP_S ago.
 * Returns the servers forgotten.
 */
export async function forgetLeftServers(
  database: Db,
  nowS: number,
  removeMedia: (keys: readonly string[]) => Promise<void>,
): Promise<string[]> {
  await database
    .prepare('DELETE FROM tickets WHERE closed_at > 0 AND closed_at < ?')
    .bind(nowS - CLOSED_TICKET_KEEP_S)
    .run();
  const left = await database
    .prepare('SELECT guild_id FROM guild_snapshot WHERE present = 0 AND updated_at < ? LIMIT ?')
    .bind(nowS - LEFT_KEEP_S, FORGET_AT_ONCE)
    .all<{ guild_id: string }>();
  const forgotten: string[] = [];
  for (const { guild_id: guildId } of left.results) {
    const pictures = await database
      .prepare('SELECT id FROM media WHERE guild_id = ?')
      .bind(guildId)
      .all<{ id: string }>();
    await removeMedia(pictures.results.map((row) => String(row.id)));
    // a giveaway's entries are kept by the giveaway, not the server: they go before it
    await database
      .prepare('DELETE FROM giveaway_entries WHERE giveaway_id IN (SELECT id FROM giveaways WHERE guild_id = ?)')
      .bind(guildId)
      .run();
    for (const table of SERVER_TABLES)
      await database.prepare(`DELETE FROM ${table} WHERE guild_id = ?`).bind(guildId).run();
    await database.prepare('DELETE FROM guild_snapshot WHERE guild_id = ?').bind(guildId).run();
    forgotten.push(guildId);
  }
  return forgotten;
}
