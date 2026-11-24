// Announcements: a message with up to ten embeds, posted in each of its channels from the panel now, or on a schedule
// in UTC. Each scheduled one is sent once for each time it falls due; a missed minute is caught up on the next, but a
// time more than a quarter hour gone is skipped, so turning the module on never floods a channel with the past.

import { asEdit, messagePayload, payloadEmpty, serverIconUrl } from '../law/message.ts';
import type { Settings } from '../law/settings.ts';
import { type BotContext, postTo } from '../kit.ts';
import type { Snapshot } from '../store.ts';
import type { ServerModule } from './module.ts';

/** How late a scheduled announcement may still go out. */
export const LATE_MAX_MS = 15 * 60_000;
/** Discord's answer for a message that is no longer there: the only refusal of an edit that posts afresh. */
const GONE = 404;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

export type Announcement = {
  readonly name: string;
  readonly channels: readonly string[];
  readonly message: unknown;
  readonly mode?: 'new' | 'edit';
  readonly ping: 'none' | 'role' | 'everyone';
  readonly role: string;
  readonly repeat: 'never' | 'once' | 'hourly' | 'daily' | 'weekly';
  readonly at: string;
  readonly weekday: string;
};

const itemsOf = (config: Settings) => (config.messages ?? []) as Announcement[];

/** The message an announcement is sent as, with only the mention it names, or null when it says nothing. */
export function announcement(
  item: Announcement,
  snapshot: Pick<Snapshot, 'guildId' | 'name' | 'icon'> | null,
  nowMs: number,
) {
  const vars = {
    server: snapshot?.name || 'the server',
    server_icon: serverIconUrl(snapshot?.guildId, snapshot?.icon),
  };
  const payload = messagePayload(item.message, vars, nowMs);
  if (payloadEmpty(payload)) return null;
  const role = item.ping === 'role' && item.role;
  const ping = item.ping === 'everyone' ? '@everyone ' : role ? `<@&${item.role}> ` : '';
  const content = `${ping}${payload.content ?? ''}`.trim().slice(0, 2000);
  const mentions = item.ping === 'everyone' ? { parse: ['everyone'] } : role ? { roles: [item.role] } : { parse: [] };
  return { ...(content ? { content } : {}), embeds: payload.embeds, allowed_mentions: mentions };
}
type Sent = NonNullable<ReturnType<typeof announcement>>;

/** The channels an announcement is posted in, each once. */
export const channelsOf = (item: Announcement): string[] => [
  ...new Set((Array.isArray(item.channels) ? item.channels : []).filter(Boolean)),
];

/**
 * Put an announcement in each of its channels: a new post, or, set to edit, the post it made there last changed in
 * place. Only a post Discord says is gone is posted afresh; an edit refused for any other reason (an outage, a rate
 * limit) leaves that channel untold, so no second copy appears. Answers how many channels took it, and how many by
 * an edit.
 */
async function postAll(context: BotContext, guildId: string, item: Announcement, channels: string[], message: Sent) {
  let posted = 0;
  let edited = 0;
  const editing = item.mode === 'edit';
  for (const channel of channels) {
    if (editing) {
      const kept = await context.database
        .prepare('SELECT message_id FROM announce_posts WHERE guild_id = ? AND name = ? AND channel_id = ?')
        .bind(guildId, item.name, channel)
        .first<{ message_id: string }>();
      if (kept) {
        const change = await context.rest.patch(`/channels/${channel}/messages/${kept.message_id}`, asEdit(message));
        if (change.ok) {
          posted++;
          edited++;
          continue;
        }
        if (change.status !== GONE) continue;
      }
    }
    const sent = await postTo(context.rest, channel, message);
    if (!sent) continue;
    posted++;
    if (editing)
      await context.database
        .prepare(
          `INSERT OR REPLACE INTO announce_posts (guild_id, name, channel_id, message_id, posted_at)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .bind(guildId, item.name, channel, String(sent.id), Math.floor(context.now() / 1000))
        .run();
  }
  return { posted, edited };
}

/** The latest time this announcement fell due at or before `now`, in milliseconds, or 0 when it never does. */
export function lastDue(item: Pick<Announcement, 'repeat' | 'at'> & { weekday?: string }, now: number): number {
  const match = /^(?:(\d{4})-(\d{2})-(\d{2}) )?(\d{2}):(\d{2})$/.exec(String(item.at ?? ''));
  if (!match) return 0;
  const [year, month, day, hour, minute] = match.slice(1).map(Number) as [number, number, number, number, number];
  const date = new Date(now);
  const today = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const atOn = (dayStart: number) => dayStart + hour * HOUR_MS + minute * 60_000;
  switch (item.repeat) {
    case 'once': {
      if (!year) return 0;
      const when = Date.UTC(year, month - 1, day, hour, minute);
      return when <= now ? when : 0;
    }
    case 'hourly': {
      const thisHour = Math.floor(now / HOUR_MS) * HOUR_MS + minute * 60_000;
      return thisHour <= now ? thisHour : thisHour - HOUR_MS;
    }
    case 'daily': {
      const when = atOn(today);
      return when <= now ? when : when - DAY_MS;
    }
    case 'weekly': {
      const back = (date.getUTCDay() - Number(item.weekday) + 7) % 7;
      const when = atOn(today - back * DAY_MS);
      return when <= now ? when : when - 7 * DAY_MS;
    }
    default:
      return 0;
  }
}

/** Send what has fallen due in every server with announcements on. */
async function minute(context: BotContext) {
  const now = context.now();
  const servers = await context.database
    .prepare("SELECT guild_id FROM guild_config WHERE module = 'announce' AND enabled = 1")
    .all<{ guild_id: string }>();
  for (const row of servers.results) {
    const guildId = String(row.guild_id);
    const found = await context.config(guildId, 'announce');
    // the server is read only once an announcement is due
    let snapshot: Snapshot | null | undefined;
    for (const item of itemsOf(found?.config ?? {})) {
      const due = lastDue(item, now);
      const channels = channelsOf(item);
      if (!due || now - due > LATE_MAX_MS || !channels.length) continue;
      const sent = await context.database
        .prepare('SELECT sent_at FROM announce_sent WHERE guild_id = ? AND name = ?')
        .bind(guildId, item.name)
        .first<{ sent_at: number }>();
      if (sent && Number(sent.sent_at) * 1000 >= due) continue;
      if (snapshot === undefined) snapshot = await context.snapshot(guildId);
      const message = announcement(item, snapshot, now);
      if (!message) continue;
      await context.database
        .prepare('INSERT OR REPLACE INTO announce_sent (guild_id, name, sent_at) VALUES (?, ?, ?)')
        .bind(guildId, item.name, Math.floor(now / 1000))
        .run();
      await postAll(context, guildId, item, channels, message);
    }
  }
}

/**
 * After a save: forget the posts of announcements no longer set to edit, renamed or gone, and of channels taken off
 * one, so a name used again later posts afresh instead of editing an old post.
 */
async function saved(context: BotContext, guildId: string, config: Settings) {
  const keep = new Set(
    itemsOf(config)
      .filter((item) => item.mode === 'edit')
      .flatMap((item) => channelsOf(item).map((channel) => `${item.name}\n${channel}`)),
  );
  const held = await context.database
    .prepare('SELECT name, channel_id FROM announce_posts WHERE guild_id = ?')
    .bind(guildId)
    .all<{ name: string; channel_id: string }>();
  for (const row of held.results.filter((each) => !keep.has(`${each.name}\n${each.channel_id}`)))
    await context.database
      .prepare('DELETE FROM announce_posts WHERE guild_id = ? AND name = ? AND channel_id = ?')
      .bind(guildId, row.name, row.channel_id)
      .run();
  return '';
}

async function send(context: BotContext, guildId: string, input: Settings, config: Settings) {
  const item = itemsOf(config).find((candidate) => candidate.name === input.name);
  if (!item) return { ok: false, message: `There is no announcement named ${String(input.name)}. Save it first.` };
  const channels = channelsOf(item);
  if (!channels.length) return { ok: false, message: 'Choose its channels first.' };
  const message = announcement(item, await context.snapshot(guildId), context.now());
  if (!message) return { ok: false, message: 'It has nothing to say yet.' };
  const { posted, edited } = await postAll(context, guildId, item, channels, message);
  if (posted === channels.length) {
    const verb = edited === posted ? 'Updated' : 'Sent';
    const mixed = edited && edited < posted ? ` ${edited} updated in place, ${posted - edited} posted new.` : '';
    return { ok: true, message: `${verb}${channels.length > 1 ? ` in ${posted} channels` : ''}.${mixed}` };
  }
  if (!posted) return { ok: false, message: 'The bot could not post in those channels.' };
  return {
    ok: false,
    message: `Sent in ${posted} of ${channels.length} channels. The bot could not post in the rest.`,
  };
}

export const announceModule: ServerModule = {
  id: 'announce',
  minute,
  saved,
  actions: { send: (context, guildId, input, _actor, config) => send(context, guildId, input, config) },
};
