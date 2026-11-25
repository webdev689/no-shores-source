// Logs: what happened in the server, posted to the channels the settings name. Edits and deletions show the words the
// message had, from the Gateway's cache (`previous` on the event); a message the bot never saw is said to be unseen.

import { escapeText } from '../law/message.ts';
import { recordOf, type Settings } from '../law/settings.ts';
import type { CachedMember, CachedMessage, VoiceSeat } from '../cache.ts';
import { type BotContext, durationWords, embed, postTo, snowflakeTime, userLabel } from '../kit.ts';
import type { EventData, EventHandler, ServerModule } from './module.ts';
import { idsOf } from './moderationCases.ts';

const COLOUR = Object.freeze({ edit: 0xd9a33c, gone: 0xb91309, join: 0x2c7341, leave: 0x6b7280, change: 0x4e7f72 });
/** How much of a message a log line shows. */
export const QUOTE_MAX = 1000;
/** How many messages a bulk deletion's line lists by name. */
const BULK_SHOWN = 10;

const quote = (text: string) => (text ? escapeText(text).slice(0, QUOTE_MAX) : '*(no words)*');
const jump = (seen: CachedMessage) => `https://discord.com/channels/${seen.guildId}/${seen.channelId}/${seen.id}`;
const ignored = (config: Settings, channelId: string) => idsOf(config.ignoreChannels).includes(channelId);
const roleList = (ids: readonly string[]) => ids.map((id) => `<@&${id}>`).join(' ');
const byWho = (seen: CachedMessage) => `By ${escapeText(seen.author)} (${seen.authorId}) in <#${seen.channelId}>.`;

/** Post one log card to the channel the setting names; an empty setting posts nothing. */
const post = (
  context: BotContext,
  config: Settings,
  channel: string,
  card: { title: string; color: number; description: string; fields?: { name: string; value: string }[] },
) => postTo(context.rest, String(config[channel] ?? ''), { embeds: [embed({ ...card, timestamp: context.now() })] });

const messageOf = (data: EventData) => (data.previous ? (data.previous as CachedMessage) : null);

const events: Readonly<Record<string, EventHandler>> = {
  async MESSAGE_UPDATE(context, data, config) {
    const before = messageOf(data);
    if (!before || typeof data.content !== 'string' || before.content === data.content) return;
    if (ignored(config, before.channelId) || (config.ignoreBots && recordOf(data.author).bot)) return;
    await post(context, config, 'messageChannel', {
      title: 'Message edited',
      color: COLOUR.edit,
      description: `${byWho(before)} [Jump](${jump(before)})`,
      fields: [
        { name: 'Before', value: quote(before.content) },
        { name: 'After', value: quote(data.content) },
      ],
    });
  },
  async MESSAGE_DELETE(context, data, config) {
    const channelId = String(data.channel_id);
    if (ignored(config, channelId)) return;
    const before = messageOf(data);
    const files = before?.files.length ? [{ name: 'Files', value: before.files.join('\n').slice(0, QUOTE_MAX) }] : [];
    await post(context, config, 'messageChannel', {
      title: 'Message deleted',
      color: COLOUR.gone,
      description: before
        ? byWho(before)
        : `In <#${channelId}>. The bot did not see this message, so its words are unknown.`,
      fields: before ? [{ name: 'Words', value: quote(before.content) }, ...files] : [],
    });
  },
  async MESSAGE_DELETE_BULK(context, data, config) {
    const channelId = String(data.channel_id);
    if (ignored(config, channelId)) return;
    const seen = (Array.isArray(data.previous) ? data.previous : []) as CachedMessage[];
    const lines = seen
      .slice(0, BULK_SHOWN)
      .map((message) => `**${escapeText(message.author)}**: ${quote(message.content).slice(0, 150)}`);
    if (seen.length > BULK_SHOWN) lines.push(`and ${seen.length - BULK_SHOWN} more`);
    await post(context, config, 'messageChannel', {
      title: `${idsOf(data.ids).length} messages deleted at once`,
      color: COLOUR.gone,
      description: `In <#${channelId}>.${lines.length ? `\n\n${lines.join('\n')}` : ''}`,
    });
  },
  async GUILD_MEMBER_ADD(context, data, config) {
    const user = recordOf(data.user);
    const ageMs = context.now() - snowflakeTime(String(user.id));
    await post(context, config, 'memberChannel', {
      title: user.bot ? 'Bot added' : 'Member joined',
      color: COLOUR.join,
      description: userLabel(user),
      fields: [{ name: 'Account age', value: durationWords(ageMs / 1000) }],
    });
  },
  async GUILD_MEMBER_REMOVE(context, data, config) {
    const roles = (data.previous as CachedMember | null)?.roles ?? [];
    await post(context, config, 'memberChannel', {
      title: 'Member left',
      color: COLOUR.leave,
      description: userLabel(data.user),
      fields: roles.length ? [{ name: 'Roles', value: roleList(roles) }] : [],
    });
  },
  async GUILD_MEMBER_UPDATE(context, data, config) {
    const before = data.previous as CachedMember | null;
    if (!before) return;
    const nick = String(data.nick ?? '');
    const roles = idsOf(data.roles);
    const added = roles.filter((id) => !before.roles.includes(id));
    const removed = before.roles.filter((id) => !roles.includes(id));
    const fields = [];
    if (before.nick !== nick)
      fields.push({ name: 'Nickname', value: `${escapeText(before.nick || 'none')} to ${escapeText(nick || 'none')}` });
    if (added.length) fields.push({ name: 'Roles given', value: roleList(added) });
    if (removed.length) fields.push({ name: 'Roles taken', value: roleList(removed) });
    if (!fields.length) return;
    await post(context, config, 'memberChannel', {
      title: 'Member changed',
      color: COLOUR.change,
      description: userLabel(data.user),
      fields,
    });
  },
  async VOICE_STATE_UPDATE(context, data, config) {
    const from = (data.previous as VoiceSeat | null)?.channelId ?? '';
    const to = data.channel_id ? String(data.channel_id) : '';
    if (from === to) return;
    const member = recordOf(data.member);
    const who = member.user ? userLabel(member.user) : `<@${String(data.user_id)}>`;
    const description = !from
      ? `${who} joined <#${to}>.`
      : !to
        ? `${who} left <#${from}>.`
        : `${who} moved from <#${from}> to <#${to}>.`;
    await post(context, config, 'voiceChannel', {
      title: 'Voice',
      color: to ? COLOUR.join : COLOUR.leave,
      description,
    });
  },
  async GUILD_BAN_ADD(context, data, config) {
    await post(context, config, 'serverChannel', {
      title: 'Member banned',
      color: COLOUR.gone,
      description: userLabel(data.user),
    });
  },
  async GUILD_BAN_REMOVE(context, data, config) {
    await post(context, config, 'serverChannel', {
      title: 'Member unbanned',
      color: COLOUR.join,
      description: userLabel(data.user),
    });
  },
  async CHANNEL_CREATE(context, data, config) {
    await post(context, config, 'serverChannel', {
      title: 'Channel made',
      color: COLOUR.join,
      description: `<#${String(data.id)}> (${escapeText(String(data.name ?? ''))})`,
    });
  },
  async CHANNEL_DELETE(context, data, config) {
    await post(context, config, 'serverChannel', {
      title: 'Channel deleted',
      color: COLOUR.gone,
      description: `#${escapeText(String(data.name ?? ''))} (${String(data.id)})`,
    });
  },
  async GUILD_ROLE_CREATE(context, data, config) {
    const role = recordOf(data.role);
    await post(context, config, 'serverChannel', {
      title: 'Role made',
      color: COLOUR.join,
      description: `<@&${String(role.id)}> (${escapeText(String(role.name ?? ''))})`,
    });
  },
  async GUILD_ROLE_DELETE(context, data, config) {
    await post(context, config, 'serverChannel', {
      title: 'Role deleted',
      color: COLOUR.gone,
      description: `Role ${String(data.role_id)}`,
    });
  },
};

export const logsModule: ServerModule = { id: 'logs', events };
