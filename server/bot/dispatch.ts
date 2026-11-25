// What the bot does with each Gateway event. The snapshot of every server (its name, roles and channels) is kept
// here, so the panel can offer channel and role pickers without asking Discord. So is the cache of what Discord does
// not resend: before an update or a deletion reaches the modules, the event carries `previous`, the message, member
// or voice seat as it was. Modules register handlers by event name; one that throws never stops the others.

import { recordOf } from './law/settings.ts';
import type { Cache, CachedMember } from './cache.ts';
import { createConfigCache, errorWords } from './kit.ts';
import type { DispatchHandler } from './registry.ts';
import type { EventData } from './modules/module.ts';
import {
  type Db,
  type ReadSettings,
  type Snapshot,
  channelOf,
  emojisOf,
  presentGuilds,
  readSnapshot,
  roleOf,
  snapshotOfGuild,
  writeSnapshot,
} from './store.ts';

/** Thread channel types: they come and go constantly and are never a setting's target. */
export const THREADS = new Set([10, 11, 12]);
/** How long a module's settings are trusted without a save from the panel, in milliseconds. */
export const CONFIG_KEEP_MS = 5 * 60_000;
/** How often a server's member count alone is written: joins and leaves change it in memory, and it is written at most
 *  this often (and by the Gateway's alarm, flush), never once a join. */
export const COUNT_WRITE_MS = 60_000;

const idOf = (value: unknown): string => String(value ?? '');
const listOf = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/** A member as the cache keeps it. */
const memberOf = (given: unknown): CachedMember => {
  const member = recordOf(given);
  return { nick: String(member.nick ?? ''), roles: listOf(member.roles).map(String) };
};

export interface DispatchDeps {
  readonly database: Db;
  readonly now: () => number;
  readonly log?: (line: string) => void;
  readonly cache?: Cache;
}

export interface Dispatcher {
  /** Write the counts that moved since their last write. */
  flush(): Promise<void>;
  dispatch(type: string, data: EventData): Promise<void>;
  /** A module's settings in a server, read once and kept until the panel saves them or they grow old. */
  config(guildId: string, moduleId: string): Promise<ReadSettings | null>;
  /** The panel saved a module: its next read comes from the database. */
  forget(guildId: string, moduleId: string): void;
  /** A server's snapshot, from memory when the Gateway has it. */
  snapshot(guildId: string): Promise<Snapshot | null>;
  /** Add handlers by event name, after the ones already there. */
  use(more: Readonly<Record<string, DispatchHandler[]>>): void;
}

export function createDispatcher(deps: DispatchDeps): Dispatcher {
  const log = deps.log ?? ((line) => console.warn(line));
  const { cache } = deps;
  const snapshots = new Map<string, Snapshot>();
  const nowS = () => Math.floor(deps.now() / 1000);
  const configs = createConfigCache(deps.database, deps.now, CONFIG_KEEP_MS);
  const added: Record<string, DispatchHandler[]> = {};
  /** When each server's snapshot was last written, and the servers whose count has moved since. */
  const written = new Map<string, number>();
  const dirty = new Set<string>();

  // After an eviction the memory is empty and a resumed session sends no GUILD_CREATE, so the stored copy is the base.
  const snapshotFor = async (id: string) => {
    const hit = snapshots.get(id);
    if (hit) return hit;
    const stored = await readSnapshot(deps.database, id);
    if (stored) snapshots.set(id, stored);
    return stored;
  };

  const save = async (snapshot: Snapshot) => {
    snapshot.updatedAt = nowS();
    snapshots.set(snapshot.guildId, snapshot);
    written.set(snapshot.guildId, deps.now());
    dirty.delete(snapshot.guildId);
    await writeSnapshot(deps.database, snapshot);
  };

  /** A change to the member count alone: kept in memory, written at most once a COUNT_WRITE_MS. */
  const saveCount = async (snapshot: Snapshot) => {
    snapshots.set(snapshot.guildId, snapshot);
    if (deps.now() - (written.get(snapshot.guildId) ?? 0) >= COUNT_WRITE_MS) await save(snapshot);
    else dirty.add(snapshot.guildId);
  };

  const withSnapshot = async (guildId: unknown, change: (snapshot: Snapshot) => boolean | void) => {
    const snapshot = await snapshotFor(idOf(guildId));
    if (snapshot && change(snapshot) !== false) await save(snapshot);
  };

  const keepRole = (data: EventData) =>
    withSnapshot(data.guild_id, (snapshot) => {
      if (!data.role) return false;
      const role = roleOf(data.role);
      snapshot.roles = [...snapshot.roles.filter((held) => held.id !== role.id), role];
    });
  const keepChannel = async (data: EventData) => {
    if (!data.guild_id || THREADS.has(Number(data.type))) return;
    await withSnapshot(data.guild_id, (snapshot) => {
      snapshot.channels = [...snapshot.channels.filter((held) => held.id !== idOf(data.id)), channelOf(data)];
    });
  };

  const keep: Record<string, (data: EventData) => Promise<void>> = {
    // READY lists every server the bot is in. One it left while the Gateway was down sent no GUILD_DELETE, so any
    // stored as present and missing from the list is gone.
    async READY(data) {
      if (!Array.isArray(data.guilds)) return;
      const listed = new Set(data.guilds.map((guild) => idOf(recordOf(guild).id)));
      for (const held of await presentGuilds(deps.database))
        if (!listed.has(held.guildId))
          await withSnapshot(held.guildId, (snapshot) => {
            snapshot.present = false;
          });
    },
    async GUILD_CREATE(data) {
      if (data.unavailable) return;
      await save(snapshotOfGuild(data, nowS()));
      const guildId = idOf(data.id);
      // The server arrives with everyone in voice now: whoever the cache holds beyond that left while the bot was away,
      // and everyone's time counts from now, so none is paid for an outage.
      const states = listOf(data.voice_states)
        .map(recordOf)
        .filter((state) => state.channel_id);
      const present = new Set(states.map((state) => idOf(state.user_id)));
      for (const held of cache?.inVoice(guildId) ?? [])
        if (!present.has(held.userId)) cache?.dropVoice(guildId, held.userId);
      for (const state of states) cache?.putVoice(guildId, idOf(state.user_id), idOf(state.channel_id), deps.now());
      for (const member of listOf(data.members).map(recordOf)) {
        const userId = recordOf(member.user).id;
        if (userId) cache?.putMember(guildId, idOf(userId), memberOf(member));
      }
    },
    async GUILD_UPDATE(data) {
      await withSnapshot(data.id, (snapshot) => {
        snapshot.name = String(data.name ?? snapshot.name);
        snapshot.icon = data.icon ? String(data.icon) : null;
        snapshot.ownerId = String(data.owner_id ?? snapshot.ownerId);
        if (Array.isArray(data.roles)) snapshot.roles = data.roles.map(roleOf);
        if (Array.isArray(data.emojis)) snapshot.emojis = emojisOf(data.emojis);
      });
    },
    async GUILD_DELETE(data) {
      // `unavailable` means a Discord outage, not that the bot left.
      if (data.unavailable) return;
      await withSnapshot(data.id, (snapshot) => {
        snapshot.present = false;
      });
    },
    async GUILD_EMOJIS_UPDATE(data) {
      await withSnapshot(data.guild_id, (snapshot) => {
        snapshot.emojis = emojisOf(data.emojis);
      });
    },
    GUILD_ROLE_CREATE: keepRole,
    GUILD_ROLE_UPDATE: keepRole,
    async GUILD_ROLE_DELETE(data) {
      await withSnapshot(data.guild_id, (snapshot) => {
        snapshot.roles = snapshot.roles.filter((role) => role.id !== idOf(data.role_id));
      });
    },
    CHANNEL_CREATE: keepChannel,
    CHANNEL_UPDATE: keepChannel,
    async CHANNEL_DELETE(data) {
      if (!data.guild_id) return;
      await withSnapshot(data.guild_id, (snapshot) => {
        snapshot.channels = snapshot.channels.filter((channel) => channel.id !== idOf(data.id));
      });
    },
    async GUILD_MEMBER_ADD(data) {
      const userId = recordOf(data.user).id;
      if (userId) cache?.putMember(idOf(data.guild_id), idOf(userId), memberOf(data));
      const snapshot = await snapshotFor(idOf(data.guild_id));
      if (!snapshot) return;
      snapshot.memberCount++;
      await saveCount(snapshot);
    },
    async GUILD_MEMBER_UPDATE(data) {
      const userId = recordOf(data.user).id;
      if (!userId) return;
      data.previous = cache?.getMember(idOf(data.guild_id), idOf(userId)) ?? null;
      cache?.putMember(idOf(data.guild_id), idOf(userId), memberOf(data));
    },
    async GUILD_MEMBER_REMOVE(data) {
      const userId = recordOf(data.user).id;
      if (userId) {
        data.previous = cache?.getMember(idOf(data.guild_id), idOf(userId)) ?? null;
        cache?.dropMember(idOf(data.guild_id), idOf(userId));
      }
      const snapshot = await snapshotFor(idOf(data.guild_id));
      if (!snapshot) return;
      snapshot.memberCount = Math.max(0, snapshot.memberCount - 1);
      await saveCount(snapshot);
    },
    async VOICE_STATE_UPDATE(data) {
      if (!data.guild_id || !data.user_id) return;
      const guildId = idOf(data.guild_id);
      const userId = idOf(data.user_id);
      const before = cache?.getVoice(guildId, userId) ?? null;
      data.previous = before;
      if (!data.channel_id) cache?.dropVoice(guildId, userId);
      else if (before?.channelId !== idOf(data.channel_id))
        cache?.putVoice(guildId, userId, idOf(data.channel_id), deps.now());
    },
    // A message's words are kept only where the logs module is on: chat is not stored where no one asked for it.
    async MESSAGE_CREATE(data) {
      if (!data.guild_id || !cache || data.webhook_id) return;
      const logs = await configs.get(idOf(data.guild_id), 'logs');
      if (!logs?.enabled) return;
      const author = recordOf(data.author);
      cache.putMessage({
        id: idOf(data.id),
        guildId: idOf(data.guild_id),
        channelId: idOf(data.channel_id),
        authorId: idOf(author.id),
        author: String(author.global_name || author.username || ''),
        content: String(data.content ?? ''),
        files: listOf(data.attachments)
          .map(recordOf)
          .map((file) => String(file.url ?? file.filename ?? '')),
        at: deps.now(),
      });
    },
    async MESSAGE_UPDATE(data) {
      if (!data.id || !cache) return;
      const previous = cache.getMessage(idOf(data.id));
      data.previous = previous;
      if (previous && typeof data.content === 'string') cache.editMessage(idOf(data.id), data.content);
    },
    async MESSAGE_DELETE(data) {
      if (!data.id || !cache) return;
      data.previous = cache.getMessage(idOf(data.id));
      cache.dropMessage(idOf(data.id));
    },
    async MESSAGE_DELETE_BULK(data) {
      if (!Array.isArray(data.ids) || !cache) return;
      const ids = data.ids.map(idOf);
      data.previous = ids.map((id) => cache.getMessage(id)).filter(Boolean);
      for (const id of ids) cache.dropMessage(id);
    },
  };
  return {
    async flush() {
      for (const id of [...dirty]) {
        const snapshot = snapshots.get(id);
        if (snapshot) await save(snapshot);
        else dirty.delete(id);
      }
    },
    async dispatch(type, data) {
      try {
        await keep[type]?.(data);
      } catch (error) {
        log(`[bot] keeping the snapshot on ${type} failed: ${errorWords(error)}`);
      }
      for (const handler of added[type] ?? []) {
        try {
          await handler(type, data);
        } catch (error) {
          log(`[bot] a ${type} handler failed: ${errorWords(error)}`);
        }
      }
    },
    config: (guildId, moduleId) => configs.get(guildId, moduleId),
    forget: (guildId, moduleId) => configs.forget(guildId, moduleId),
    snapshot: snapshotFor,
    use(more) {
      for (const [type, list] of Object.entries(more)) added[type] = [...(added[type] ?? []), ...list];
    },
  };
}
