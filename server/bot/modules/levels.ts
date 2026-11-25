// Levels: experience for messages and for time in voice, a level-up said where the settings say, role rewards, /rank
// and /leaderboard, and a public leaderboard the website reads. Each level needs 5L² + 50L + 100 more experience than
// the one before. A member earns from one message a cooldown, held in the Gateway object's memory so most messages
// cost no database read at all.

import { ROLE_REFUSALS } from '../law/access.ts';
import { escapeText, messagePayload, payloadEmpty } from '../law/message.ts';
import { type Settings, recordOf } from '../law/settings.ts';
import { corsFor, fail, json } from '../http.ts';
import {
  type BotContext,
  type Interaction,
  directMessage,
  embed,
  optionOf,
  postTo,
  privateReply,
  publicReply,
} from '../kit.ts';
import { type SlotUser, slotsFor } from '../slots.ts';
import type { ServerModule } from './module.ts';

/** The most minutes one stay in voice can earn: a member who idles all night earns a night's cap, not a fortune. */
export const VOICE_CAP_MINUTES = 360;
export const BOARD_PAGE = 25;
/** The deepest the public leaderboard pages: past it, a page answers nothing. */
export const BOARD_OFFSET_MAX = 100_000;
/** Where the website reads a server's public leaderboard. */
const PUBLIC_BOARD = /^\/v1\/public\/levels\/(\d{5,25})$/;

/** Experience from level `level` to the next. */
export const xpToNext = (level: number): number => 5 * level * level + 50 * level + 100;

/** The level a total of experience reaches, and how far into the next. */
export function levelOf(total: number): { level: number; into: number; need: number } {
  let level = 0;
  let left = Math.max(0, Math.floor(total));
  while (left >= xpToNext(level)) {
    left -= xpToNext(level);
    level++;
  }
  return { level, into: left, need: xpToNext(level) };
}

type Reward = { readonly level: number; readonly role: string };
type Boost = { readonly role: string; readonly percent: number };

/** The reward roles a member at `level` should hold and the ones to take. */
export function rewardRoles(rewards: readonly Reward[], level: number, keep: boolean) {
  const earned = rewards
    .filter((reward) => reward.role && reward.level <= level)
    .sort((one, two) => one.level - two.level);
  const hold = (keep ? earned : earned.slice(-1)).map((reward) => reward.role);
  const take = rewards.map((reward) => reward.role).filter((role) => role && !hold.includes(role));
  return { hold, take };
}

const bar = (into: number, need: number) => {
  const full = Math.round((10 * into) / Math.max(1, need));
  return `${'▰'.repeat(full)}${'▱'.repeat(10 - full)}`;
};

const rewardsOf = (config: Settings) => (config.rewards ?? []) as Reward[];

type Earned = { messages?: number; voice?: number; channelId?: string; quiet?: boolean };
type Row = { xp: number; level: number };

/** Add experience and answer the member's row after it. A level reached is announced and rewarded once. */
export async function award(
  context: BotContext,
  guildId: string,
  user: SlotUser,
  amount: number,
  config: Settings,
  how: Earned = {},
): Promise<Row | null> {
  const userId = String(user.id);
  // a member known only by id keeps the name stored before: an id is never shown as a name on the public board
  const name = String(user.global_name || user.username || '').slice(0, 64);
  const row = await context.database
    .prepare(
      `INSERT INTO levels (guild_id, user_id, xp, level, messages, voice_minutes, last_at, name, avatar)
       VALUES (?, ?, MAX(0, ?), 0, ?, ?, ?, ?, ?)
       ON CONFLICT (guild_id, user_id) DO UPDATE SET xp = MAX(0, xp + ?), messages = messages + excluded.messages,
         voice_minutes = voice_minutes + excluded.voice_minutes, last_at = excluded.last_at,
         name = CASE WHEN excluded.name = '' THEN name ELSE excluded.name END, avatar = excluded.avatar
       RETURNING xp, level`,
    )
    .bind(
      guildId,
      userId,
      Math.round(amount),
      how.messages ?? 0,
      how.voice ?? 0,
      Math.floor(context.now() / 1000),
      name,
      String(user.avatar ?? ''),
      Math.round(amount),
    )
    .first<Row>();
  const reached = levelOf(Number(row?.xp ?? 0)).level;
  const told = Number(row?.level ?? 0);
  if (reached === told) return row;
  await context.database
    .prepare('UPDATE levels SET level = ? WHERE guild_id = ? AND user_id = ?')
    .bind(reached, guildId, userId)
    .run();
  const { hold, take } = rewardRoles(rewardsOf(config), reached, config.keepRewards !== false);
  const reason = `Level ${reached}`;
  for (const role of hold)
    await context.rest.put(`/guilds/${guildId}/members/${userId}/roles/${role}`, undefined, { reason });
  for (const role of take) await context.rest.del(`/guilds/${guildId}/members/${userId}/roles/${role}`, { reason });
  if (reached < told || how.quiet) return row;
  const vars = await slotsFor(context, guildId, user, config.levelMessage, {
    name: name || 'Member',
    level: String(reached),
  });
  const payload = messagePayload(config.levelMessage, vars, context.now());
  if (payloadEmpty(payload)) return row;
  // the member is pinged only where the server's setting says so
  const mentions = { users: config.levelUpPing === false ? [] : [userId] };
  if (config.announce === 'dm') await directMessage(context.rest, userId, payload);
  else if (config.announce === 'channel')
    await postTo(context.rest, String(config.announceChannel), { ...payload, allowed_mentions: mentions });
  else if (config.announce === 'same' && how.channelId)
    await postTo(context.rest, how.channelId, { ...payload, allowed_mentions: mentions });
  return row;
}

/** The boost of the highest matching role, as a multiplier. */
const boostOf = (config: Settings, roles: readonly string[]) =>
  1 +
  Math.max(
    0,
    ...((config.boosts ?? []) as Boost[]).filter((boost) => roles.includes(boost.role)).map((boost) => boost.percent),
  ) /
    100;
const earnsNothing = (config: Settings, roles: readonly string[]) =>
  roles.some((role) => (config.noXpRoles as string[]).includes(role));

const events: ServerModule['events'] = {
  async MESSAGE_CREATE(context, data, config) {
    const author = recordOf(data.author);
    if (!data.guild_id || author.bot || data.webhook_id || !data.member) return;
    const roles = ((recordOf(data.member).roles ?? []) as unknown[]).map(String);
    if ((config.noXpChannels as string[]).includes(String(data.channel_id)) || earnsNothing(config, roles)) return;
    const memory = context.memory ?? new Map<string, unknown>();
    const key = `levels:${String(data.guild_id)}:${String(author.id)}`;
    const now = context.now();
    if (now - Number(memory.get(key) ?? 0) < Number(config.cooldownSeconds) * 1000) return;
    memory.set(key, now);
    const low = Math.min(Number(config.xpMin), Number(config.xpMax));
    const high = Math.max(Number(config.xpMin), Number(config.xpMax));
    const amount = Math.round((low + Math.floor(Math.random() * (high - low + 1))) * boostOf(config, roles));
    await award(context, String(data.guild_id), author, amount, config, {
      messages: 1,
      channelId: String(data.channel_id),
    });
  },
  async VOICE_STATE_UPDATE(context, data, config) {
    const before = data.previous as { channelId: string; since: number } | null | undefined;
    const now = data.channel_id ? String(data.channel_id) : '';
    if (!before || !config.voiceXp || before.channelId === now) return;
    const member = recordOf(data.member);
    const user = recordOf(member.user);
    if (user.bot) return;
    const minutes = Math.min(VOICE_CAP_MINUTES, Math.floor((context.now() - before.since) / 60_000));
    const roles = ((member.roles ?? []) as unknown[]).map(String);
    if (minutes <= 0 || earnsNothing(config, roles)) return;
    const amount = minutes * Number(config.voiceXp) * boostOf(config, roles);
    const who = user.id ? user : { id: data.user_id };
    await award(context, String(data.guild_id), who, amount, config, { voice: minutes });
  },
};

type BoardRow = {
  user_id: string;
  name: string;
  avatar: string;
  xp: number;
  messages: number;
  voice_minutes: number;
};

async function boardPage(context: BotContext, guildId: string, offset: number, limit: number) {
  const page = await context.database
    .prepare(
      `SELECT user_id, name, avatar, xp, messages, voice_minutes FROM levels WHERE guild_id = ? AND xp > 0
       ORDER BY xp DESC, user_id LIMIT ? OFFSET ?`,
    )
    .bind(guildId, limit, offset)
    .all<BoardRow>();
  return page.results.map((row, index) => ({
    rank: offset + index + 1,
    userId: String(row.user_id),
    name: String(row.name) || 'Member',
    level: levelOf(Number(row.xp)).level,
    xp: Number(row.xp),
    messages: Number(row.messages),
    voice: Number(row.voice_minutes),
  }));
}

async function onCommand(context: BotContext, interaction: Interaction, config: Settings) {
  const guildId = String(interaction.guild_id);
  if (interaction.data?.name === 'leaderboard') {
    const rows = await boardPage(context, guildId, 0, 10);
    if (!rows.length) return privateReply('No one has earned experience yet.');
    const lines = rows.map((row) => `**${row.rank}.** ${escapeText(row.name)}: level ${row.level} (${row.xp} xp)`);
    const panel = String(context.vars.PANEL_URL ?? '');
    const link = config.publicBoard && panel ? `\n[The whole leaderboard](${panel}#lb=${guildId})` : '';
    return publicReply({ embeds: [embed({ title: 'Leaderboard', description: `${lines.join('\n')}${link}` })] });
  }
  const userId = String(optionOf(interaction, 'member') ?? interaction.member?.user?.id ?? '');
  const row = await context.database
    .prepare('SELECT * FROM levels WHERE guild_id = ? AND user_id = ?')
    .bind(guildId, userId)
    .first<BoardRow>();
  if (!row) return privateReply('No experience yet. Chat a little first.');
  const above = await context.database
    .prepare('SELECT COUNT(*) AS count FROM levels WHERE guild_id = ? AND xp > ?')
    .bind(guildId, row.xp)
    .first<{ count: number }>();
  const where = levelOf(Number(row.xp));
  return publicReply({
    embeds: [
      embed({
        title: `${row.name || 'Member'}: level ${where.level}`,
        description: `${bar(where.into, where.need)} ${where.into} / ${where.need} xp`,
        fields: [
          { name: 'Rank', value: `#${Number(above?.count ?? 0) + 1}`, inline: true },
          { name: 'Messages', value: String(row.messages), inline: true },
          { name: 'Voice', value: `${row.voice_minutes} min`, inline: true },
        ],
      }),
    ],
  });
}

/** The public leaderboard the website shows, where the settings allow it: names, levels and experience, no ids. */
export async function publicBoard(context: BotContext, guildId: string, offset: number) {
  const found = await context.config(guildId, 'levels');
  if (!found?.enabled || !found.config.publicBoard) return null;
  const snapshot = await context.snapshot(guildId);
  // names and standing only: a public page carries no user id, and Discord's avatar addresses each hold one
  const start = Number.isSafeInteger(offset) && offset > 0 ? Math.min(offset, BOARD_OFFSET_MAX) : 0;
  const rows = (await boardPage(context, guildId, start, 100)).map((row) => ({
    rank: row.rank,
    name: row.name,
    level: row.level,
    xp: row.xp,
  }));
  const icon = snapshot?.icon ? `https://cdn.discordapp.com/icons/${guildId}/${snapshot.icon}.png?size=128` : '';
  return { guild: { name: snapshot?.name ?? '', icon }, rows };
}

const memberInput = (input: Settings) => String(input.user);

export const levelsModule: ServerModule = {
  id: 'levels',
  commands: [
    {
      name: 'rank',
      description: "Your level, or a member's",
      type: 1,
      contexts: [0],
      options: [{ type: 6, name: 'member', description: 'Whose', required: false }],
    },
    { name: 'leaderboard', description: 'The top ten in this server', type: 1, contexts: [0] },
  ],
  command: onCommand,
  events,
  views: {
    async board(context, guildId, query) {
      const offset = Math.max(0, Number(query.get('offset')) || 0);
      const rows = await boardPage(context, guildId, offset, BOARD_PAGE);
      return {
        rows: rows.map((row) => ({
          rank: row.rank,
          name: `${row.name} (${row.userId})`,
          level: row.level,
          xp: row.xp,
          messages: row.messages,
          voice: row.voice,
        })),
        next: rows.length === BOARD_PAGE ? `offset=${offset + BOARD_PAGE}` : '',
      };
    },
  },
  actions: {
    async give(context, guildId, input, actor, config) {
      // a level reached here gives its reward roles, so the giver must be able to give them in Discord
      const amount = Number(input.amount);
      const userId = memberInput(input);
      if (amount > 0) {
        const had = await context.database
          .prepare('SELECT xp FROM levels WHERE guild_id = ? AND user_id = ?')
          .bind(guildId, userId)
          .first<{ xp: number }>();
        const from = levelOf(Number(had?.xp ?? 0)).level;
        const reach = levelOf(Number(had?.xp ?? 0) + amount).level;
        const roles = rewardsOf(config)
          .filter((reward) => reward.role && reward.level > from && reward.level <= reach)
          .map((reward) => String(reward.role));
        const refused = roles.length ? actor.mayGive(roles) : null;
        if (refused)
          return {
            ok: false,
            message:
              `That reaches a reward role you cannot give. ${ROLE_REFUSALS[refused.why as keyof typeof ROLE_REFUSALS] ?? ''}`.trim(),
          };
      }
      const user = await context.rest.get(`/users/${userId}`);
      const who = user.ok ? (recordOf(user.json) as SlotUser) : { id: userId };
      const row = await award(context, guildId, who, amount, config, { quiet: true });
      return { ok: true, message: `They now have ${row?.xp ?? 0} experience.` };
    },
    async reset(context, guildId, input, _actor, config) {
      const userId = memberInput(input);
      await context.database
        .prepare('DELETE FROM levels WHERE guild_id = ? AND user_id = ?')
        .bind(guildId, userId)
        .run();
      for (const role of rewardRoles(rewardsOf(config), 0, true).take)
        await context.rest.del(`/guilds/${guildId}/members/${userId}/roles/${role}`, { reason: 'Levels reset' });
      return { ok: true, message: 'Their experience and rewards are gone.' };
    },
  },
  async fetch(context, request, url) {
    const board = PUBLIC_BOARD.exec(url.pathname);
    if (!board?.[1] || request.method !== 'GET') return null;
    const cors = corsFor(context.vars, request);
    const found = await publicBoard(context, board[1], Number(url.searchParams.get('offset')) || 0);
    return found
      ? json(found, 200, { ...cors, 'cache-control': 'public, max-age=60' })
      : fail('board', 404, cors, 'This leaderboard is not public.');
  },
};
