// What every bot module is handed and builds with: the context it runs in, Discord's reply shapes, durations, and
// the checks a moderation act needs. A module that acts through another (auto-mod's warning is a moderation case)
// calls that module's exported function, so the act is the same wherever it starts.

import { DEFAULT_COLOUR, colorNumber, escapeText } from './law/message.ts';
import { recordOf } from './law/settings.ts';
import type { LinkedCharacter } from '../accounts/linked.ts';
import type { Cache } from './cache.ts';
import type { Rest } from './rest.ts';
import { type Db, type ReadSettings, type Snapshot, readConfig } from './store.ts';

export const TYPE = Object.freeze({ PING: 1, COMMAND: 2, COMPONENT: 3, AUTOCOMPLETE: 4, MODAL: 5 });
export const REPLY = Object.freeze({ PONG: 1, MESSAGE: 4, DEFERRED: 5, UPDATE: 7, CHOICES: 8, MODAL: 9 });
export const EPHEMERAL = 1 << 6;
/** No message the bot sends pings anyone unless a module names who. */
export const NO_PINGS = Object.freeze({ parse: [] as string[] });
/** The custom id prefix of everything the bot draws: `bot:<module>:<words>`. */
export const BOT_PREFIX = 'bot:';
/** An embed's edge colour where a module names none. */
export const EDGE_COLOUR = colorNumber(DEFAULT_COLOUR);

/**
 * The Worker's settings, each a plain string that may be empty: an empty one is a legal state, and the part that needs
 * it says what is not set up. Three are secrets the deploy puts; the rest are `wrangler.jsonc`'s vars, and its one
 * service binding.
 */
export interface Vars {
  readonly BOT_URL?: string;
  /** The commit the deploy came from, stamped by it, which `/health` answers so a deploy knows its code is live. */
  readonly BOT_COMMIT?: string;
  readonly PANEL_URL?: string;
  readonly PANEL_ORIGINS?: string;
  readonly DISCORD_PUBLIC_KEY?: string;
  readonly DISCORD_APPLICATION_ID?: string;
  readonly BOT_OWNERS?: string;
  readonly DISCORD_BOT_TOKEN?: string;
  readonly DISCORD_CLIENT_SECRET?: string;
  readonly CARD_SIGNING_KEY?: string;
  /** The accounts' LinkedCharacters (accounts/worker.ts) by service binding; without it no member reads as linked. */
  readonly ACCOUNTS?: { linked(discordId: string): Promise<LinkedCharacter | null> };
}

/** The context a module runs in. `cache` and `memory` exist only in the Gateway object; `later` outlives the answer. */
export interface BotContext {
  readonly vars: Vars;
  readonly database: Db;
  readonly rest: Rest;
  readonly now: () => number;
  readonly log: (line: string) => void;
  readonly config: (guildId: string, moduleId: string) => Promise<ReadSettings | null>;
  readonly snapshot: (guildId: string) => Promise<Snapshot | null>;
  readonly later: (work: Promise<unknown>) => void;
  readonly cache?: Cache;
  readonly memory?: Map<string, unknown>;
}

/** An option of a slash command, as Discord sends it. */
export interface InteractionOption {
  readonly name: string;
  readonly type?: number;
  readonly value?: unknown;
  readonly options?: readonly InteractionOption[];
}
/** A slash command, press, choice or form, as Discord sends it; a module reads the parts it owns. */
export interface Interaction {
  readonly type?: number;
  readonly id?: string;
  readonly application_id?: string;
  readonly token?: string;
  readonly guild_id?: string;
  readonly channel_id?: string;
  readonly member?: {
    readonly user?: { readonly id?: string; readonly username?: string; readonly global_name?: string };
    readonly roles?: readonly string[];
    readonly permissions?: string;
  };
  readonly data?: {
    readonly name?: string;
    readonly custom_id?: string;
    readonly options?: readonly InteractionOption[];
    readonly resolved?: unknown;
    readonly values?: readonly string[];
    readonly components?: unknown;
  };
}
/** What Discord is answered for an interaction. */
export interface InteractionReply {
  readonly type: number;
  readonly data?: Readonly<Record<string, unknown>>;
}

/**
 * Module settings read once and kept a while. The Gateway object keeps them until the panel saves; a Worker isolate
 * cannot hear the save, so it keeps them only briefly.
 */
export function createConfigCache(database: Db, now: () => number, keepMs: number) {
  const kept = new Map<string, { value: ReadSettings | null; at: number }>();
  return {
    async get(guildId: string, moduleId: string): Promise<ReadSettings | null> {
      const key = `${guildId}:${moduleId}`;
      const hit = kept.get(key);
      if (hit && now() - hit.at < keepMs) return hit.value;
      const value = await readConfig(database, guildId, moduleId);
      if (kept.size > 5_000) kept.clear();
      kept.set(key, { value, at: now() });
      return value;
    },
    forget(guildId: string, moduleId: string): void {
      kept.delete(`${guildId}:${moduleId}`);
    },
  };
}

/** A private answer that pings no one. */
export const privateReply = (content: string, components: readonly unknown[] = []): InteractionReply => ({
  type: REPLY.MESSAGE,
  data: { content, flags: EPHEMERAL, allowed_mentions: NO_PINGS, ...(components.length ? { components } : {}) },
});

/** A public answer that pings no one. */
export const publicReply = (data: Readonly<Record<string, unknown>>): InteractionReply => ({
  type: REPLY.MESSAGE,
  data: { allowed_mentions: NO_PINGS, ...data },
});

/** An embed with the bot's edge colour, each part held to Discord's bound. */
export function embed(card: {
  readonly title?: string;
  readonly description?: string;
  readonly color?: number;
  readonly fields?: ReadonlyArray<{ readonly name: string; readonly value: string; readonly inline?: boolean }>;
  readonly footer?: string;
  readonly timestamp?: number;
}) {
  return {
    ...(card.title ? { title: card.title.slice(0, 256) } : {}),
    ...(card.description ? { description: card.description.slice(0, 4000) } : {}),
    color: card.color ?? EDGE_COLOUR,
    ...(card.fields?.length
      ? {
          fields: card.fields.slice(0, 25).map((field) => ({
            name: field.name.slice(0, 256) || '-',
            value: field.value.slice(0, 1024) || '-',
            inline: !!field.inline,
          })),
        }
      : {}),
    ...(card.footer ? { footer: { text: card.footer.slice(0, 2048) } } : {}),
    ...(card.timestamp ? { timestamp: new Date(card.timestamp).toISOString() } : {}),
  };
}

const UNIT_S: Readonly<Record<string, number>> = { s: 1, m: 60, h: 3600, d: 86_400, w: 604_800 };

/** "90s", "10m", "2h", "1d12h", "1w" as seconds, or null. */
export function parseDuration(text: unknown): number | null {
  const clean = String(text ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
  if (!/^(\d{1,6}[smhdw])+$/.test(clean)) return null;
  let total = 0;
  for (const part of clean.matchAll(/(\d{1,6})([smhdw])/g)) total += Number(part[1]) * (UNIT_S[part[2] ?? ''] ?? 0);
  return total > 0 ? total : null;
}

/** Seconds as a person says them: "2 hours", "1 day 6 hours". */
export function durationWords(seconds: number): string {
  const out: string[] = [];
  let left = Math.max(0, Math.round(seconds));
  for (const [name, size] of [
    ['week', 604_800],
    ['day', 86_400],
    ['hour', 3600],
    ['minute', 60],
    ['second', 1],
  ] as const) {
    const count = Math.floor(left / size);
    if (count > 0) out.push(`${count} ${name}${count === 1 ? '' : 's'}`);
    left -= count * size;
    if (out.length === 2) break;
  }
  return out.join(' ') || '0 seconds';
}

/** When Discord made the thing with this id, in milliseconds. */
export const snowflakeTime = (id: string): number => Number((BigInt(id) >> 22n) + 1420070400000n);

/** Whether a permission string from Discord holds the bit; an administrator holds every bit. */
export function holds(permissions: unknown, bit: bigint): boolean {
  try {
    const have = BigInt(String(permissions ?? '0'));
    return (have & (1n << 3n)) !== 0n || (have & bit) === bit;
  } catch {
    return false;
  }
}

/** A member's highest role position in the server, from the snapshot's roles. */
export function topPosition(
  roles: ReadonlyArray<{ readonly id: string; readonly position: number }>,
  memberRoles: readonly string[],
): number {
  const position = new Map(roles.map((role) => [role.id, role.position]));
  return Math.max(0, ...memberRoles.map((id) => position.get(id) ?? 0));
}

/** How long the Gateway object's memory keeps a key no one has touched: past every window a module holds there (a
 *  level cooldown at most ten minutes, a flood window at most a minute). */
export const MEMORY_KEEP_MS = 15 * 60_000;

/**
 * Let go of the keys the Gateway object's memory holds past their use, so it does not grow with every member who ever
 * posted. A key's age is its newest time: a number, or the newest `at` of a list.
 */
export function pruneMemory(memory: Map<string, unknown>, nowMs: number, keepMs = MEMORY_KEEP_MS): void {
  for (const [key, held] of memory) {
    const newest = Array.isArray(held)
      ? Math.max(0, ...held.map((entry) => Number(recordOf(entry).at) || 0))
      : Number(held) || 0;
    if (nowMs - newest > keepMs) memory.delete(key);
  }
}

const botIds = new Map<string, string>();
/** The bot's own user id, asked once an isolate. */
export async function botUserId(rest: Rest, token: string): Promise<string> {
  const hit = botIds.get(token);
  if (hit) return hit;
  const answer = await rest.get('/users/@me');
  const id = answer.ok ? String(recordOf(answer.json).id ?? '') : '';
  if (id) botIds.set(token, id);
  return id;
}

/** Send a member a direct message. Answers whether Discord delivered it; a member who takes no DMs is not an error. */
export async function directMessage(rest: Rest, userId: string, payload: object): Promise<boolean> {
  const channel = await rest.post('/users/@me/channels', { recipient_id: userId });
  const channelId = channel.ok ? recordOf(channel.json).id : undefined;
  if (!channelId) return false;
  const sent = await rest.post(`/channels/${String(channelId)}/messages`, { allowed_mentions: NO_PINGS, ...payload });
  return sent.ok;
}

/** Post in a channel the settings name; answers the message posted, or null. A channel left empty posts nothing. */
export async function postTo(rest: Rest, channelId: string, payload: object): Promise<Record<string, unknown> | null> {
  if (!/^\d{5,25}$/.test(String(channelId ?? ''))) return null;
  const answer = await rest.post(`/channels/${channelId}/messages`, { allowed_mentions: NO_PINGS, ...payload });
  return answer.ok ? recordOf(answer.json) : null;
}

/** How a user is named in a log line: their name and id, so a later rename still finds them. */
export const userLabel = (given: unknown): string => {
  const user = recordOf(given);
  return `${escapeText(user.global_name || user.username || 'Unknown')} (${String(user.id ?? '?')})`;
};

/**
 * The answer to an interaction whose work runs past Discord's three seconds: a deferral now, the result drawn later
 * through the interaction's own token. `work` answers the message's data.
 */
export function deferred(
  context: BotContext,
  interaction: Interaction,
  work: () => Promise<Readonly<Record<string, unknown>>>,
  { ephemeral = true }: { readonly ephemeral?: boolean } = {},
): InteractionReply {
  context.later(
    (async () => {
      let data: Readonly<Record<string, unknown>>;
      try {
        data = await work();
      } catch (error) {
        context.log(`[bot] a deferred answer failed: ${error instanceof Error ? error.message : String(error)}`);
        data = { content: 'Something went wrong. Try again in a minute.' };
      }
      const path = `/webhooks/${String(interaction.application_id)}/${String(interaction.token)}/messages/@original`;
      await context.rest.call('PATCH', path, { json: { allowed_mentions: NO_PINGS, ...data } });
    })(),
  );
  return { type: REPLY.DEFERRED, data: ephemeral ? { flags: EPHEMERAL } : {} };
}

/** An option's value from a slash command, by name, however deep its subcommand put it. */
export function optionOf(interaction: Interaction, name: string): unknown {
  const find = (list: readonly InteractionOption[] | undefined): unknown => {
    for (const option of list ?? []) {
      if (option.name === name && 'value' in option) return option.value;
      const deeper = find(option.options);
      if (deeper !== undefined) return deeper;
    }
    return undefined;
  };
  return find(interaction.data?.options);
}

/** The subcommand a slash command was used with, or ''. */
export const subcommandOf = (interaction: Interaction): string =>
  String((interaction.data?.options ?? []).find((option) => option.type === 1)?.name ?? '');
