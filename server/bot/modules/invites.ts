// Invites: which invite each new member used, found by comparing each invite's use count before and after the join.
// The counts are kept in the Gateway object's cache and read again from Discord on a join. A join that the counts
// cannot pin to one invite is credited to no one, never to a wrong one.

import { recordOf } from '../law/settings.ts';
import {
  type BotContext,
  type Interaction,
  type InteractionReply,
  embed,
  optionOf,
  postTo,
  privateReply,
  userLabel,
} from '../kit.ts';
import type { EventData, EventHandler, ServerModule } from './module.ts';

interface InviteCount {
  readonly code: string;
  readonly uses: number;
  readonly inviterId: string;
}

async function readInvites(context: BotContext, guildId: string): Promise<InviteCount[] | null> {
  const answer = await context.rest.get(`/guilds/${guildId}/invites`);
  if (!answer.ok || !Array.isArray(answer.json)) return null;
  return answer.json.map(recordOf).map((invite) => ({
    code: String(invite.code),
    uses: Number(invite.uses ?? 0),
    inviterId: String(recordOf(invite.inviter).id ?? ''),
  }));
}

async function refresh(context: BotContext, data: EventData): Promise<void> {
  const guildId = String(data.guild_id ?? data.id);
  const list = await readInvites(context, guildId);
  if (list) context.cache?.putInvites(guildId, list, context.now());
}

/**
 * The counts last read, where they can be trusted: read after the second the module's settings were last saved in.
 * The module hears no join while it is off, so counts read before it was turned on again may have missed some.
 */
async function trustedCounts(context: BotContext, guildId: string) {
  const held = context.cache?.invites(guildId);
  const savedS = (await context.config(guildId, 'invites'))?.updatedAt ?? 0;
  return held?.at && held.at >= (savedS + 1) * 1000 ? held.counts : null;
}

/** The invite whose count rose by one, or null where none did, two did, or one rose by more (two joins at once). */
function usedInvite(before: ReadonlyMap<string, { readonly uses: number }>, now: readonly InviteCount[]) {
  const rise = (invite: InviteCount) => invite.uses - (before.get(invite.code)?.uses ?? 0);
  const risen = now.filter((invite) => rise(invite) > 0);
  const only = risen.length === 1 ? risen[0] : undefined;
  return only && rise(only) === 1 ? only : null;
}

const onJoin: EventHandler = async (context, data, config) => {
  const guildId = String(data.guild_id);
  const before = await trustedCounts(context, guildId);
  const now = await readInvites(context, guildId);
  if (!now) return;
  context.cache?.putInvites(guildId, now, context.now());
  const used = before ? usedInvite(before, now) : null;
  if (!used) return;
  await context.database
    .prepare(
      'INSERT OR REPLACE INTO invite_joins (guild_id, user_id, inviter_id, code, joined_at) VALUES (?, ?, ?, ?, ?)',
    )
    .bind(guildId, String(recordOf(data.user).id), used.inviterId, used.code, Math.floor(context.now() / 1000))
    .run();
  const madeBy = used.inviterId ? `, made by <@${used.inviterId}>` : '';
  await postTo(context.rest, String(config.channel ?? ''), {
    embeds: [
      embed({
        title: 'Joined by invite',
        description: `${userLabel(data.user)} used ${used.code}${madeBy}.`,
        color: 0x2c7341,
      }),
    ],
  });
};

async function onCommand(context: BotContext, interaction: Interaction): Promise<InteractionReply> {
  const userId = String(optionOf(interaction, 'member') ?? interaction.member?.user?.id ?? '');
  const row = await context.database
    .prepare('SELECT COUNT(*) AS count FROM invite_joins WHERE guild_id = ? AND inviter_id = ?')
    .bind(String(interaction.guild_id), userId)
    .first<{ count: number }>();
  const count = Number(row?.count ?? 0);
  return privateReply(`<@${userId}> has brought ${count} member${count === 1 ? '' : 's'}.`);
}

export const invitesModule: ServerModule = {
  id: 'invites',
  commands: [
    {
      name: 'invites',
      description: 'How many members someone has brought',
      type: 1,
      contexts: [0],
      options: [{ type: 6, name: 'member', description: 'Whose', required: false }],
    },
  ],
  command: onCommand,
  events: { GUILD_CREATE: refresh, INVITE_CREATE: refresh, INVITE_DELETE: refresh, GUILD_MEMBER_ADD: onJoin },
  views: {
    async top(context, guildId) {
      const rows = await context.database
        .prepare(
          "SELECT inviter_id, COUNT(*) AS count FROM invite_joins WHERE guild_id = ? AND inviter_id != '' GROUP BY inviter_id ORDER BY count DESC LIMIT 50",
        )
        .bind(guildId)
        .all<{ inviter_id: string; count: number }>();
      return { rows: rows.results.map((row) => ({ inviter: String(row.inviter_id), joins: Number(row.count) })) };
    },
  },
};
