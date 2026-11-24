// Giveaways: a card with an Enter button, ended by the clock or by hand, winners drawn with the platform's secure
// random source so every entry has the same chance. A reroll draws again, leaving out the last winners where it can.

import { escapeText } from '../law/message.ts';
import type { Settings } from '../law/settings.ts';
import {
  BOT_PREFIX,
  type BotContext,
  type Interaction,
  type InteractionReply,
  deferred,
  durationWords,
  embed,
  holds,
  optionOf,
  parseDuration,
  postTo,
  privateReply,
  subcommandOf,
} from '../kit.ts';
import type { ServerModule } from './module.ts';

const MANAGE_GUILD = 1n << 5n;
/** The most giveaways one minute of the clock ends. */
export const ENDS_A_TICK = 20;
/** The longest a giveaway may run. */
export const GIVEAWAY_MAX_S = 60 * 86_400;

interface GiveawayRow {
  readonly id: number;
  readonly guild_id: string;
  readonly channel_id: string;
  readonly message_id: string;
  readonly prize: string;
  readonly winners: number;
  readonly required_role: string;
  readonly host_id: string;
  readonly ends_at: number;
  readonly ended: number;
  readonly winner_ids: string;
}
/** What an act answers, in the panel or as a command's reply. */
export interface Outcome {
  readonly ok: boolean;
  readonly message: string;
}

/** A whole number below `count`, from the secure source, without the bias a plain modulo has. */
function secureBelow(count: number): number {
  const limit = Math.floor(0x1_0000_0000 / count) * count;
  const word = new Uint32Array(1);
  do crypto.getRandomValues(word);
  while ((word[0] ?? 0) >= limit);
  return (word[0] ?? 0) % count;
}

/** Draw `count` of `pool` at random, each equally likely, with no repeats. */
export function draw(
  pool: readonly string[],
  count: number,
  randomBelow: (count: number) => number = secureBelow,
): string[] {
  const left = [...pool];
  const out: string[] = [];
  while (out.length < count && left.length) {
    const picked = randomBelow(left.length);
    out.push(left[picked] ?? '');
    left[picked] = left[left.length - 1] ?? '';
    left.pop();
  }
  return out;
}

const winnersOf = (row: GiveawayRow): string[] => {
  try {
    const read: unknown = JSON.parse(String(row.winner_ids || '[]'));
    return Array.isArray(read) ? read.map(String) : [];
  } catch {
    return [];
  }
};

function card(row: GiveawayRow, entries: number) {
  const ended = row.ended === 1;
  const winners = winnersOf(row);
  const lines = [
    ended ? `Ended <t:${row.ends_at}:R>.` : `Ends <t:${row.ends_at}:R>.`,
    `Hosted by <@${row.host_id}>. ${row.winners} winner${row.winners === 1 ? '' : 's'}.`,
    ...(row.required_role ? [`Only for <@&${row.required_role}>.`] : []),
    `Entries: ${entries}.`,
    ...(ended ? [winners.length ? `Won by ${winners.map((id) => `<@${id}>`).join(', ')}.` : 'No one entered.'] : []),
  ];
  return {
    embeds: [
      embed({ title: escapeText(row.prize), description: lines.join('\n'), color: ended ? 0x6b7280 : 0xc08a3e }),
    ],
    components: ended
      ? []
      : [
          {
            type: 1,
            components: [{ type: 2, style: 3, label: 'Enter', custom_id: `${BOT_PREFIX}giveaways:enter:${row.id}` }],
          },
        ],
  };
}

const findGiveaway = (context: BotContext, guildId: string, id: number) =>
  context.database
    .prepare('SELECT * FROM giveaways WHERE id = ? AND guild_id = ?')
    .bind(id, guildId)
    .first<GiveawayRow>();

/** What a giveaway is started with, from a command or the panel. */
export interface GiveawayAsk {
  readonly prize: string;
  readonly durationS: number;
  readonly winners: number;
  readonly channelId: string;
  readonly role: string;
  readonly hostId: string;
}

/** Start a giveaway and post its card. */
export async function startGiveaway(context: BotContext, guildId: string, ask: GiveawayAsk): Promise<Outcome> {
  if (!ask.prize.trim()) return { ok: false, message: 'Name the prize.' };
  if (!(ask.durationS > 0 && ask.durationS <= GIVEAWAY_MAX_S))
    return { ok: false, message: 'A giveaway runs from a minute to 60 days.' };
  if (!/^\d{5,25}$/.test(ask.channelId))
    return { ok: false, message: 'Name a channel, or set the default one in the panel.' };
  const endsAt = Math.floor(context.now() / 1000) + ask.durationS;
  const row = await context.database
    .prepare(
      'INSERT INTO giveaways (guild_id, channel_id, prize, winners, required_role, host_id, ends_at) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *',
    )
    .bind(guildId, ask.channelId, ask.prize.trim().slice(0, 200), ask.winners, ask.role, ask.hostId, endsAt)
    .first<GiveawayRow>();
  if (!row) return { ok: false, message: 'The giveaway could not be kept. Try again.' };
  const posted = await postTo(context.rest, ask.channelId, card(row, 0));
  if (!posted) {
    await context.database.prepare('DELETE FROM giveaways WHERE id = ?').bind(row.id).run();
    return { ok: false, message: 'The bot could not post in that channel.' };
  }
  await context.database
    .prepare('UPDATE giveaways SET message_id = ? WHERE id = ?')
    .bind(String(posted.id), row.id)
    .run();
  return { ok: true, message: `Giveaway ${row.id} runs for ${durationWords(ask.durationS)}.` };
}

/** End a giveaway, or draw again: winners chosen, the card shown as ended, and the winners told in the channel. */
export async function endGiveaway(context: BotContext, guildId: string, id: number, reroll: boolean): Promise<Outcome> {
  const row = await findGiveaway(context, guildId, id);
  if (!row) return { ok: false, message: `There is no giveaway ${id} here.` };
  if (reroll && row.ended !== 1) return { ok: false, message: 'A giveaway can be drawn again only once it has ended.' };
  if (!reroll && row.ended === 1) return { ok: false, message: 'That giveaway has ended already.' };
  const entries = await context.database
    .prepare('SELECT user_id FROM giveaway_entries WHERE giveaway_id = ?')
    .bind(id)
    .all<{ user_id: string }>();
  const pool = entries.results.map((entry) => String(entry.user_id));
  const before = winnersOf(row);
  const fresh = pool.filter((userId) => !before.includes(userId));
  const winners = draw(reroll && fresh.length >= row.winners ? fresh : pool, Number(row.winners));
  const updated: GiveawayRow = { ...row, ended: 1, winner_ids: JSON.stringify(winners) };
  // The draw is taken only if nobody drew first: the clock and a manager's End, or two Rerolls, at once draw once.
  const took = await context.database
    .prepare(
      'UPDATE giveaways SET ended = 1, winner_ids = ? WHERE id = ? AND ended = ? AND winner_ids = ? RETURNING id',
    )
    .bind(updated.winner_ids, id, reroll ? 1 : 0, String(row.winner_ids || '[]'))
    .first();
  if (!took) return { ok: false, message: 'Someone else drew this giveaway just now.' };
  if (row.message_id)
    await context.rest.patch(`/channels/${row.channel_id}/messages/${row.message_id}`, card(updated, pool.length));
  const prize = escapeText(row.prize);
  const words = winners.length
    ? `${winners.map((userId) => `<@${userId}>`).join(', ')} won **${prize}**!`
    : `No one entered the giveaway for **${prize}**.`;
  const ping = (await context.config(guildId, 'giveaways'))?.config.pingWinners !== false;
  await postTo(context.rest, row.channel_id, { content: words, allowed_mentions: { users: ping ? winners : [] } });
  return {
    ok: true,
    message: winners.length ? `Drawn: ${winners.length} winner${winners.length === 1 ? '' : 's'}.` : 'No one entered.',
  };
}

/** The Enter button: in, or out again. */
async function onComponent(
  context: BotContext,
  interaction: Interaction,
  words: readonly string[],
): Promise<InteractionReply> {
  const id = Number(words[1]);
  const row = await findGiveaway(context, String(interaction.guild_id), id);
  if (!row || row.ended === 1) return privateReply('This giveaway has ended.');
  const roles = (interaction.member?.roles ?? []).map(String);
  if (row.required_role && !roles.includes(row.required_role))
    return privateReply(`Only <@&${row.required_role}> may enter this one.`);
  const userId = String(interaction.member?.user?.id ?? '');
  const added = await context.database
    .prepare('INSERT OR IGNORE INTO giveaway_entries (giveaway_id, user_id) VALUES (?, ?)')
    .bind(id, userId)
    .run();
  if (added.meta.changes === 1) return privateReply('You are in. Press again to leave.');
  await context.database
    .prepare('DELETE FROM giveaway_entries WHERE giveaway_id = ? AND user_id = ?')
    .bind(id, userId)
    .run();
  return privateReply('You left the giveaway.');
}

async function onCommand(context: BotContext, interaction: Interaction, config: Settings): Promise<InteractionReply> {
  const guildId = String(interaction.guild_id);
  if (!holds(interaction.member?.permissions, MANAGE_GUILD))
    return privateReply('You need Manage Server for giveaways.');
  const sub = subcommandOf(interaction);
  if (sub === 'start') {
    return deferred(context, interaction, async () => {
      const done = await startGiveaway(context, guildId, {
        prize: String(optionOf(interaction, 'prize') ?? ''),
        durationS: parseDuration(optionOf(interaction, 'duration')) ?? 0,
        winners: Number(optionOf(interaction, 'winners') ?? 1),
        // the channel named, else the default set in the panel, else this one ('' is "none set")
        channelId: String(optionOf(interaction, 'channel') || config.channel || interaction.channel_id || ''),
        role: String(optionOf(interaction, 'role') ?? ''),
        hostId: String(interaction.member?.user?.id ?? ''),
      });
      return { content: done.message };
    });
  }
  const id = Number(optionOf(interaction, 'number'));
  return deferred(context, interaction, async () => ({
    content: (await endGiveaway(context, guildId, id, sub === 'reroll')).message,
  }));
}

async function minute(context: BotContext): Promise<void> {
  const due = await context.database
    .prepare('SELECT id, guild_id FROM giveaways WHERE ended = 0 AND ends_at <= ? LIMIT ?')
    .bind(Math.floor(context.now() / 1000), ENDS_A_TICK)
    .all<{ id: number; guild_id: string }>();
  for (const row of due.results) await endGiveaway(context, String(row.guild_id), Number(row.id), false);
}

const NUMBER = { type: 4, name: 'number', description: "The giveaway's number", required: true, min_value: 1 };

export const giveawaysModule: ServerModule = {
  id: 'giveaways',
  commands: [
    {
      name: 'giveaway',
      description: 'Run a giveaway',
      type: 1,
      contexts: [0],
      default_member_permissions: String(MANAGE_GUILD),
      options: [
        {
          type: 1,
          name: 'start',
          description: 'Start one',
          options: [
            { type: 3, name: 'prize', description: 'What is won', required: true, max_length: 200 },
            { type: 3, name: 'duration', description: 'Such as 1h, 2d or 1w', required: true, max_length: 12 },
            { type: 4, name: 'winners', description: 'How many win', required: false, min_value: 1, max_value: 20 },
            { type: 7, name: 'channel', description: 'Where', required: false, channel_types: [0, 5] },
            { type: 8, name: 'role', description: 'Only this role may enter', required: false },
          ],
        },
        { type: 1, name: 'end', description: 'End one now', options: [NUMBER] },
        { type: 1, name: 'reroll', description: 'Draw new winners', options: [NUMBER] },
      ],
    },
  ],
  command: onCommand,
  component: onComponent,
  minute,
  views: {
    async list(context, guildId) {
      const rows = await context.database
        .prepare(
          'SELECT g.*, (SELECT COUNT(*) FROM giveaway_entries e WHERE e.giveaway_id = g.id) AS entries FROM giveaways g WHERE guild_id = ? ORDER BY id DESC LIMIT 50',
        )
        .bind(guildId)
        .all<GiveawayRow & { entries: number }>();
      return {
        rows: rows.results.map((row) => ({
          id: Number(row.id),
          prize: row.prize,
          entries: Number(row.entries),
          state: row.ended ? 'Ended' : `Ends ${new Date(row.ends_at * 1000).toUTCString()}`,
          winners: winnersOf(row).join(', '),
        })),
      };
    },
  },
  actions: {
    start: (context, guildId, input, actor, config) =>
      startGiveaway(context, guildId, {
        prize: String(input.prize ?? ''),
        durationS: parseDuration(input.duration) ?? 0,
        winners: Number(input.winners),
        channelId: String(input.channel || config.channel || ''),
        role: String(input.role ?? ''),
        hostId: actor.id,
      }),
    end: (context, guildId, input) => endGiveaway(context, guildId, Number(input.id), false),
    reroll: (context, guildId, input) => endGiveaway(context, guildId, Number(input.id), true),
  },
};
