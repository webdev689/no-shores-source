// Welcome: a message when a member joins, a direct message, a goodbye, and roles on joining. Roles wait for a set
// delay, or for a member to pass Discord's rules screening, since Discord refuses roles to a member still pending.
// It also fills {welcome_card} and serves the card's picture.

import { messagePayload, payloadEmpty } from '../law/message.ts';
import { type Settings, recordOf } from '../law/settings.ts';
import { type BotContext, directMessage, postTo } from '../kit.ts';
import { type SlotUser, slotsFor } from '../slots.ts';
import { CARD_PATH, cardRoute, welcomeCard } from './card.ts';
import type { ServerModule } from './module.ts';

/** The welcome rows the clock gives roles for, at most, a minute. */
export const GIVES_A_MINUTE = 50;

type Member = SlotUser & { readonly bot?: unknown };

const nowSeconds = (context: BotContext) => Math.floor(context.now() / 1000);
const rolesFor = (config: Settings, user: Member | undefined): string[] =>
  (user?.bot ? config.botRoles : config.joinRoles) as string[];

/** One of the welcome's messages as Discord is sent it: with values a join already filled, or filled for it alone. */
async function built(
  context: BotContext,
  guildId: string,
  user: Member,
  message: unknown,
  vars?: Record<string, string>,
) {
  return messagePayload(message, vars ?? (await slotsFor(context, guildId, user, message)), context.now());
}

/** Give a member each of the roles. */
async function giveRoles(context: BotContext, guildId: string, userId: string, roleIds: readonly string[]) {
  for (const roleId of roleIds.filter(Boolean))
    await context.rest.put(`/guilds/${guildId}/members/${userId}/roles/${roleId}`, undefined, {
      reason: 'Welcome roles',
    });
}

/** Post the welcome for one member: whether there was anything to post, and what Discord made of it (null if
 *  refused). */
async function welcome(
  context: BotContext,
  guildId: string,
  user: Member,
  config: Settings,
  vars?: Record<string, string>,
) {
  const payload = await built(context, guildId, user, config.joinMessage, vars);
  if (payloadEmpty(payload)) return { empty: true, posted: null };
  const posted = await postTo(context.rest, String(config.joinChannel), {
    ...payload,
    allowed_mentions: config.joinPing ? { users: [String(user.id)] } : { parse: [] },
  });
  return { empty: false, posted };
}

const forget = (context: BotContext, guildId: string, userId: string) =>
  context.database
    .prepare('DELETE FROM welcome_pending WHERE guild_id = ? AND user_id = ?')
    .bind(guildId, userId)
    .run();

const events: ServerModule['events'] = {
  async GUILD_MEMBER_ADD(context, data, config) {
    const guildId = String(data.guild_id);
    const user = recordOf(data.user) as Member;
    // one fill for both messages: one snapshot read, and one card signed when either names it
    const both = user.bot ? config.joinMessage : [config.joinMessage, config.dmMessage];
    const vars = await slotsFor(context, guildId, user, both);
    await welcome(context, guildId, user, config, vars);
    if (!user.bot) {
      const payload = await built(context, guildId, user, config.dmMessage, vars);
      if (!payloadEmpty(payload)) await directMessage(context.rest, String(user.id), payload);
    }
    const roles = rolesFor(config, user);
    if (!roles.length) return;
    const delay = Number(config.delayMinutes);
    if (data.pending || delay > 0) {
      const due = data.pending ? -1 : nowSeconds(context) + delay * 60;
      await context.database
        .prepare('INSERT OR REPLACE INTO welcome_pending (guild_id, user_id, due_at) VALUES (?, ?, ?)')
        .bind(guildId, String(user.id), due)
        .run();
      return;
    }
    await giveRoles(context, guildId, String(user.id), roles);
  },
  async GUILD_MEMBER_UPDATE(context, data, config) {
    const user = recordOf(data.user) as Member;
    if (data.pending !== false || !user.id) return;
    const guildId = String(data.guild_id);
    const userId = String(user.id);
    const waiting = await context.database
      .prepare('SELECT due_at FROM welcome_pending WHERE guild_id = ? AND user_id = ? AND due_at = -1')
      .bind(guildId, userId)
      .first();
    if (!waiting) return;
    const delay = Number(config.delayMinutes);
    if (delay > 0) {
      await context.database
        .prepare('UPDATE welcome_pending SET due_at = ? WHERE guild_id = ? AND user_id = ?')
        .bind(nowSeconds(context) + delay * 60, guildId, userId)
        .run();
      return;
    }
    await forget(context, guildId, userId);
    await giveRoles(context, guildId, userId, rolesFor(config, user));
  },
  async GUILD_MEMBER_REMOVE(context, data, config) {
    const guildId = String(data.guild_id);
    const user = recordOf(data.user) as Member;
    await forget(context, guildId, String(user.id));
    const payload = await built(context, guildId, user, config.leaveMessage);
    if (!payloadEmpty(payload)) await postTo(context.rest, String(config.leaveChannel), payload);
  },
};

/** Give the roles whose delay is over. */
async function minute(context: BotContext) {
  const due = await context.database
    .prepare('SELECT guild_id, user_id FROM welcome_pending WHERE due_at > 0 AND due_at <= ? LIMIT ?')
    .bind(nowSeconds(context), GIVES_A_MINUTE)
    .all<{ guild_id: string; user_id: string }>();
  for (const row of due.results) {
    const guildId = String(row.guild_id);
    const userId = String(row.user_id);
    const found = await context.config(guildId, 'welcome');
    await forget(context, guildId, userId);
    if (!found?.enabled) continue;
    const member = await context.rest.get(`/guilds/${guildId}/members/${userId}`);
    if (!member.ok) continue;
    await giveRoles(context, guildId, userId, rolesFor(found.config, recordOf(recordOf(member.json).user) as Member));
  }
}

export const welcomeModule: ServerModule = {
  id: 'welcome',
  events,
  minute,
  actions: {
    async test(context, guildId, _input, actor, config) {
      if (!config.joinChannel) return { ok: false, message: 'Choose a welcome channel first.' };
      const user = { id: actor.id, global_name: actor.name, avatar: actor.avatar ?? null };
      const { empty, posted } = await welcome(context, guildId, user, { ...config, joinPing: false });
      if (empty) return { ok: false, message: 'The welcome message is empty.' };
      return posted
        ? { ok: true, message: 'A test welcome was posted.' }
        : { ok: false, message: 'The bot could not post in that channel.' };
    },
  },
  slots: {
    names: ['welcome_card'],
    async fill(context, guildId, user, vars, fresh) {
      const saved = fresh ?? (await context.config(guildId, 'welcome'))?.config;
      return { welcome_card: await welcomeCard(context.vars, saved, user, vars) };
    },
  },
  async fetch(context, request, url) {
    if (url.pathname !== CARD_PATH || request.method !== 'GET') return null;
    return cardRoute(context.vars, url, (to, init) => fetch(to, init));
  },
};
