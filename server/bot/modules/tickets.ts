// Tickets: a button opens a private channel that only the member, the staff roles and the bot can see. Closing it
// posts a transcript of its messages as a file in the transcript channel, then deletes the channel.

import { fillSlots } from '../law/message.ts';
import { type Settings, recordOf } from '../law/settings.ts';
import {
  BOT_PREFIX,
  type BotContext,
  type Interaction,
  type InteractionReply,
  NO_PINGS,
  botUserId,
  deferred,
  embed,
  holds,
  optionOf,
  postTo,
  privateReply,
  subcommandOf,
} from '../kit.ts';
import type { ServerModule } from './module.ts';

const BIT = Object.freeze({
  MANAGE_CHANNELS: 1n << 4n,
  VIEW: 1n << 10n,
  SEND: 1n << 11n,
  MANAGE_MESSAGES: 1n << 13n,
  EMBED: 1n << 14n,
  ATTACH: 1n << 15n,
  HISTORY: 1n << 16n,
});
const MEMBER_BITS = BIT.VIEW | BIT.SEND | BIT.ATTACH | BIT.HISTORY;
/** The most messages a transcript reads, newest first, before it stops. */
export const TRANSCRIPT_MAX = 1000;

type Member = Interaction['member'];
const staffRolesOf = (config: Settings): string[] =>
  Array.isArray(config.staffRoles) ? config.staffRoles.map(String).filter(Boolean) : [];
const isStaff = (member: Member, config: Settings): boolean =>
  (member?.roles ?? []).some((role) => staffRolesOf(config).includes(role)) ||
  holds(member?.permissions, BIT.MANAGE_CHANNELS);

/** The channel's overwrites: hidden from everyone, open to the member, staff and the bot. */
export function ticketOverwrites(guildId: string, userId: string, staff: readonly string[], botId: string) {
  return [
    { id: guildId, type: 0, allow: '0', deny: String(BIT.VIEW) },
    { id: userId, type: 1, allow: String(MEMBER_BITS), deny: '0' },
    ...staff
      .filter(Boolean)
      .map((roleId) => ({ id: roleId, type: 0, allow: String(MEMBER_BITS | BIT.MANAGE_MESSAGES), deny: '0' })),
    ...(botId ? [{ id: botId, type: 1, allow: String(MEMBER_BITS | BIT.MANAGE_CHANNELS | BIT.EMBED), deny: '0' }] : []),
  ];
}

async function openTicket(context: BotContext, guildId: string, member: Member, config: Settings): Promise<string> {
  const userId = String(member?.user?.id ?? '');
  // The count and the claim are one statement, so a double press opens one ticket, not two.
  const row = await context.database
    .prepare(
      `INSERT INTO tickets (guild_id, channel_id, user_id, opened_at) SELECT ?, '', ?, ?
       WHERE (SELECT COUNT(*) FROM tickets WHERE guild_id = ? AND user_id = ? AND closed_at = 0) < ? RETURNING id`,
    )
    .bind(guildId, userId, Math.floor(context.now() / 1000), guildId, userId, Number(config.maxOpen))
    .first<{ id: number }>();
  if (!row) return 'You have a ticket open already.';
  const botId = await botUserId(context.rest, String(context.vars.DISCORD_BOT_TOKEN ?? ''));
  const made = await context.rest.post(
    `/guilds/${guildId}/channels`,
    {
      name: `ticket-${row.id}`,
      type: 0,
      ...(config.category ? { parent_id: config.category } : {}),
      permission_overwrites: ticketOverwrites(guildId, userId, staffRolesOf(config), botId),
    },
    { reason: `Ticket ${row.id}` },
  );
  if (!made.ok) {
    await context.database.prepare('DELETE FROM tickets WHERE id = ?').bind(row.id).run();
    return 'The bot could not make the ticket channel. It needs Manage Channels.';
  }
  const channelId = String(recordOf(made.json).id);
  await context.database.prepare('UPDATE tickets SET channel_id = ? WHERE id = ?').bind(channelId, row.id).run();
  await postTo(context.rest, channelId, {
    content: fillSlots(config.openText, { user: `<@${userId}>` }).slice(0, 2000),
    allowed_mentions: { users: [userId] },
    components: [
      { type: 1, components: [{ type: 2, style: 4, label: 'Close', custom_id: `${BOT_PREFIX}tickets:close` }] },
    ],
  });
  return `Your ticket is open: <#${channelId}>`;
}

/** A ticket's messages, oldest first, as text. */
export async function transcript(context: BotContext, channelId: string): Promise<string> {
  const all: Settings[] = [];
  let before = '';
  while (all.length < TRANSCRIPT_MAX) {
    const page = await context.rest.get(`/channels/${channelId}/messages`, {
      query: { limit: 100, ...(before ? { before } : {}) },
    });
    const list = page.ok && Array.isArray(page.json) ? page.json.map(recordOf) : [];
    if (!list.length) break;
    all.push(...list);
    before = String(list[list.length - 1]?.id ?? '');
    if (list.length < 100) break;
  }
  return all
    .reverse()
    .map((message) => {
      const attached = Array.isArray(message.attachments) ? message.attachments.map(recordOf) : [];
      const files = attached.map((file) => ` [${String(file.url)}]`).join('');
      const author = recordOf(message.author);
      const name = String(author.global_name || author.username || '?');
      return `[${String(message.timestamp)}] ${name}: ${String(message.content ?? '')}${files}`;
    })
    .join('\n');
}

async function closeTicket(
  context: BotContext,
  guildId: string,
  channelId: string,
  member: Member,
  config: Settings,
): Promise<string> {
  const ticket = await context.database
    .prepare('SELECT * FROM tickets WHERE channel_id = ? AND guild_id = ? AND closed_at = 0')
    .bind(channelId, guildId)
    .first<{ id: number; user_id: string }>();
  if (!ticket) return 'This is not an open ticket.';
  const userId = String(member?.user?.id ?? '');
  if (userId !== ticket.user_id && !isStaff(member, config))
    return 'Only the member who opened it, or staff, can close a ticket.';
  if (config.logChannel) {
    const form = new FormData();
    form.append(
      'payload_json',
      JSON.stringify({
        embeds: [
          embed({
            title: `Ticket ${ticket.id} closed`,
            description: `Opened by <@${ticket.user_id}>, closed by <@${userId}>.`,
          }),
        ],
        allowed_mentions: NO_PINGS,
      }),
    );
    const text = await transcript(context, channelId);
    form.append('files[0]', new Blob([text], { type: 'text/plain' }), `ticket-${ticket.id}.txt`);
    await context.rest.call('POST', `/channels/${String(config.logChannel)}/messages`, { form });
  }
  await context.database
    .prepare('UPDATE tickets SET closed_at = ?, closed_by = ? WHERE id = ?')
    .bind(Math.floor(context.now() / 1000), userId, ticket.id)
    .run();
  await context.rest.del(`/channels/${channelId}`, { reason: `Ticket ${ticket.id} closed` });
  return 'Closed.';
}

async function onComponent(
  context: BotContext,
  interaction: Interaction,
  words: readonly string[],
  config: Settings,
): Promise<InteractionReply> {
  const guildId = String(interaction.guild_id);
  if (words[0] === 'open')
    return deferred(context, interaction, async () => ({
      content: await openTicket(context, guildId, interaction.member, config),
    }));
  if (words[0] === 'close')
    return deferred(context, interaction, async () => ({
      content: await closeTicket(context, guildId, String(interaction.channel_id), interaction.member, config),
    }));
  return privateReply('That is not a ticket button.');
}

/** /ticket close, add or remove, inside a ticket. */
async function onCommand(context: BotContext, interaction: Interaction, config: Settings): Promise<InteractionReply> {
  const guildId = String(interaction.guild_id);
  const channelId = String(interaction.channel_id);
  const sub = subcommandOf(interaction);
  if (sub === 'close')
    return deferred(context, interaction, async () => ({
      content: await closeTicket(context, guildId, channelId, interaction.member, config),
    }));
  const ticket = await context.database
    .prepare('SELECT id FROM tickets WHERE channel_id = ? AND guild_id = ? AND closed_at = 0')
    .bind(channelId, guildId)
    .first();
  if (!ticket) return privateReply('Use this inside an open ticket.');
  if (!isStaff(interaction.member, config)) return privateReply('Only staff can change who is in a ticket.');
  const userId = String(optionOf(interaction, 'member') ?? '');
  const done =
    sub === 'add'
      ? await context.rest.put(`/channels/${channelId}/permissions/${userId}`, {
          type: 1,
          allow: String(MEMBER_BITS),
          deny: '0',
        })
      : await context.rest.del(`/channels/${channelId}/permissions/${userId}`);
  if (!done.ok) return privateReply('The bot could not change that.');
  return privateReply(
    sub === 'add' ? `<@${userId}> can see this ticket now.` : `<@${userId}> can no longer see this ticket.`,
  );
}

const WHO = [{ type: 6, name: 'member', description: 'Who', required: true }];

export const ticketsModule: ServerModule = {
  id: 'tickets',
  commands: [
    {
      name: 'ticket',
      description: 'Manage this ticket',
      type: 1,
      contexts: [0],
      options: [
        { type: 1, name: 'close', description: 'Close it' },
        { type: 1, name: 'add', description: 'Let a member see it', options: WHO },
        { type: 1, name: 'remove', description: 'Take a member out of it', options: WHO },
      ],
    },
  ],
  command: onCommand,
  component: onComponent,
  views: {
    async open(context, guildId) {
      const rows = await context.database
        .prepare('SELECT * FROM tickets WHERE guild_id = ? ORDER BY id DESC LIMIT 50')
        .bind(guildId)
        .all<{ id: number; user_id: string; closed_at: number; opened_at: number }>();
      return {
        rows: rows.results.map((row) => ({
          id: Number(row.id),
          user: String(row.user_id),
          state: row.closed_at ? 'Closed' : 'Open',
          when: Number(row.opened_at),
        })),
      };
    },
  },
  actions: {
    async post(context, guildId, input, actor, config) {
      if (!config.panelChannel) return { ok: false, message: 'Choose the channel for the button first.' };
      const posted = await postTo(context.rest, String(config.panelChannel), {
        embeds: [embed({ title: String(config.panelTitle ?? ''), description: String(config.panelText ?? '') })],
        components: [
          {
            type: 1,
            components: [{ type: 2, style: 1, label: 'Open a ticket', custom_id: `${BOT_PREFIX}tickets:open` }],
          },
        ],
      });
      return posted
        ? { ok: true, message: 'The button is posted.' }
        : { ok: false, message: 'The bot could not post in that channel.' };
    },
  },
};
