// Birthdays: members set the day; on it, at the settings' hour in UTC, the bot wishes them well and gives the day's
// role, which it takes back the day after. A birthday on 29 February is kept on the 28th in other years.

import { messagePayload, payloadEmpty } from '../law/message.ts';
import { recordOf } from '../law/settings.ts';
import {
  type BotContext,
  type Interaction,
  type InteractionReply,
  optionOf,
  postTo,
  privateReply,
  subcommandOf,
} from '../kit.ts';
import type { ServerModule } from './module.ts';
import { serversWith } from './stats.ts';

const DAYS_IN = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const leap = (year: number): boolean => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

/** The day as a number, YYYYMMDD. */
export const dayNumber = (date: Date): number =>
  date.getUTCFullYear() * 10_000 + (date.getUTCMonth() + 1) * 100 + date.getUTCDate();

/** The birthdays kept on this day, as month and day pairs to look for. */
export function birthdaysOn(date: Date): Array<readonly [number, number]> {
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  const out: Array<readonly [number, number]> = [[month, day]];
  if (month === 2 && day === 28 && !leap(date.getUTCFullYear())) out.push([2, 29]);
  return out;
}

async function onCommand(context: BotContext, interaction: Interaction): Promise<InteractionReply> {
  const guildId = String(interaction.guild_id);
  const userId = String(interaction.member?.user?.id ?? '');
  if (subcommandOf(interaction) === 'remove') {
    await context.database
      .prepare('DELETE FROM birthdays WHERE guild_id = ? AND user_id = ?')
      .bind(guildId, userId)
      .run();
    return privateReply('Your birthday is no longer kept here.');
  }
  const month = Number(optionOf(interaction, 'month'));
  const day = Number(optionOf(interaction, 'day'));
  if (!(month >= 1 && month <= 12 && day >= 1 && day <= (DAYS_IN[month - 1] ?? 0)))
    return privateReply('That is not a day of the year.');
  await context.database
    .prepare(
      'INSERT INTO birthdays (guild_id, user_id, month, day) VALUES (?, ?, ?, ?) ON CONFLICT (guild_id, user_id) DO UPDATE SET month = excluded.month, day = excluded.day',
    )
    .bind(guildId, userId, month, day)
    .run();
  return privateReply(`Your birthday is kept as ${day} ${MONTHS[month - 1] ?? ''}.`);
}

/** Every server where a module is on: the clock's modules run across them all. */

/** Wish one member well: the message, then the day's role. */
async function wish(context: BotContext, guildId: string, userId: string, config: Record<string, unknown>) {
  const member = await context.rest.get(`/guilds/${guildId}/members/${userId}`);
  if (!member.ok) return;
  const found = recordOf(recordOf(member.json).user);
  const user = found.id ? found : { id: userId };
  // slots.ts reads the registry, which names this module: imported when used, so neither loads half-made
  const { slotsFor } = await import('../slots.ts');
  const vars = await slotsFor(context, guildId, user, config.message);
  const payload = messagePayload(config.message, vars, context.now());
  const ping = config.pingMember !== false;
  const mention = `<@${userId}>`;
  if (!payloadEmpty(payload)) {
    // a mention inside an embed pings no one, so the member is named in the words when it is not there already;
    // an empty message stays unsent, never a bare mention
    if (ping && !payload.content?.includes(mention))
      payload.content = `${mention} ${payload.content ?? ''}`.trim().slice(0, 2000);
    await postTo(context.rest, String(config.channel ?? ''), {
      ...payload,
      allowed_mentions: { users: ping ? [userId] : [] },
    });
  }
  if (config.role)
    await context.rest.put(`/guilds/${guildId}/members/${userId}/roles/${String(config.role)}`, undefined, {
      reason: 'Birthday',
    });
}

/** Wish today's birthdays at the hour, and take yesterday's roles back. */
async function minute(context: BotContext): Promise<void> {
  const now = new Date(context.now());
  const today = dayNumber(now);
  const year = now.getUTCFullYear();
  for (const guildId of await serversWith(context, 'birthdays')) {
    const config = (await context.config(guildId, 'birthdays'))?.config;
    if (!config) continue;
    const ended = await context.database
      .prepare('SELECT user_id FROM birthdays WHERE guild_id = ? AND role_on > 0 AND role_on < ?')
      .bind(guildId, today)
      .all<{ user_id: string }>();
    for (const row of ended.results) {
      if (config.role)
        await context.rest.del(`/guilds/${guildId}/members/${row.user_id}/roles/${String(config.role)}`, {
          reason: 'Birthday over',
        });
      await context.database
        .prepare('UPDATE birthdays SET role_on = 0 WHERE guild_id = ? AND user_id = ?')
        .bind(guildId, row.user_id)
        .run();
    }
    if (now.getUTCHours() < Number(config.hour)) continue;
    for (const [month, day] of birthdaysOn(now)) {
      const due = await context.database
        .prepare(
          'SELECT user_id FROM birthdays WHERE guild_id = ? AND month = ? AND day = ? AND told_year < ? LIMIT 50',
        )
        .bind(guildId, month, day, year)
        .all<{ user_id: string }>();
      for (const row of due.results) {
        const userId = String(row.user_id);
        await context.database
          .prepare('UPDATE birthdays SET told_year = ?, role_on = ? WHERE guild_id = ? AND user_id = ?')
          .bind(year, config.role ? today : 0, guildId, userId)
          .run();
        await wish(context, guildId, userId, config);
      }
    }
  }
}

export const birthdaysModule: ServerModule = {
  id: 'birthdays',
  commands: [
    {
      name: 'birthday',
      description: 'Your birthday in this server',
      type: 1,
      contexts: [0],
      options: [
        {
          type: 1,
          name: 'set',
          description: 'Set it',
          options: [
            { type: 4, name: 'month', description: 'Month, 1 to 12', required: true, min_value: 1, max_value: 12 },
            { type: 4, name: 'day', description: 'Day of the month', required: true, min_value: 1, max_value: 31 },
          ],
        },
        { type: 1, name: 'remove', description: 'Forget it' },
      ],
    },
  ],
  command: onCommand,
  minute,
};
