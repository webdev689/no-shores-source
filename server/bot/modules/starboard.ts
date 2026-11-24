// Starboard: a message with enough stars is shown again in the starboard channel, its count kept up to date, and taken
// down if it falls below. Discord's own reaction count is the source; the author's own star is left out unless the
// settings count it.

import { emojiOf, escapeText } from '../law/message.ts';
import { type Settings, recordOf } from '../law/settings.ts';
import { type BotContext, embed, postTo } from '../kit.ts';
import type { EventData, ServerModule } from './module.ts';

const isStar = (reacted: unknown, text: unknown): boolean => {
  const want = emojiOf(text);
  const given = recordOf(reacted);
  return !!want && (want.id ? String(given.id) === want.id : given.name === want.name);
};

/** How many stars a message has, by the settings' rules. */
async function starsOf(context: BotContext, message: Settings, config: Settings): Promise<number> {
  const reactions = Array.isArray(message.reactions) ? message.reactions.map(recordOf) : [];
  const reaction = reactions.find((candidate) => isStar(candidate.emoji, config.emoji));
  let count = Number(reaction?.count ?? 0);
  if (count && !config.selfStar) {
    const want = emojiOf(config.emoji);
    const key = encodeURIComponent(want?.id ? `${want.name}:${want.id}` : (want?.name ?? ''));
    const who = await context.rest.get(
      `/channels/${String(message.channel_id)}/messages/${String(message.id)}/reactions/${key}`,
      { query: { limit: 100 } },
    );
    const authorId = recordOf(message.author).id;
    if (who.ok && Array.isArray(who.json) && who.json.some((user) => recordOf(user).id === authorId)) count--;
  }
  return count;
}

function starPost(message: Settings, stars: number, config: Settings, guildId: string) {
  const files = Array.isArray(message.attachments) ? message.attachments.map(recordOf) : [];
  const image = files.find((file) => /^image\//.test(String(file.content_type ?? '')));
  const author = recordOf(message.author);
  const channelId = String(message.channel_id);
  const jump = `https://discord.com/channels/${guildId}/${channelId}/${String(message.id)}`;
  return {
    content: `${String(config.emoji)} **${stars}** in <#${channelId}>`,
    embeds: [
      {
        ...embed({
          description: `${escapeText(message.content ?? '').slice(0, 3500)}\n\n[Jump to it](${jump})`,
          footer: String(author.global_name || author.username || ''),
          color: 0xd9a33c,
          timestamp: Date.parse(String(message.timestamp)) || undefined,
        }),
        ...(image ? { image: { url: String(image.url) } } : {}),
      },
    ],
  };
}

async function onReaction(context: BotContext, data: EventData, config: Settings): Promise<void> {
  const board = String(config.channel ?? '');
  if (!board || !isStar(data.emoji, config.emoji)) return;
  const channelId = String(data.channel_id);
  const ignored = Array.isArray(config.ignoreChannels) ? config.ignoreChannels.map(String) : [];
  if (channelId === board || ignored.includes(channelId)) return;
  const guildId = String(data.guild_id);
  const read = await context.rest.get(`/channels/${channelId}/messages/${String(data.message_id)}`);
  if (!read.ok) return;
  const message = recordOf(read.json);
  const messageId = String(message.id);
  const stars = await starsOf(context, message, config);
  const shown = await context.database
    .prepare('SELECT star_message_id FROM starboard_posts WHERE guild_id = ? AND message_id = ?')
    .bind(guildId, messageId)
    .first<{ star_message_id: string }>();
  if (stars < Number(config.threshold)) {
    if (shown) {
      await context.rest.del(`/channels/${board}/messages/${shown.star_message_id}`);
      await context.database
        .prepare('DELETE FROM starboard_posts WHERE guild_id = ? AND message_id = ?')
        .bind(guildId, messageId)
        .run();
    }
    return;
  }
  const post = starPost(message, stars, config, guildId);
  if (shown) {
    const edited = await context.rest.patch(`/channels/${board}/messages/${shown.star_message_id}`, post);
    if (edited.ok) {
      await context.database
        .prepare('UPDATE starboard_posts SET stars = ? WHERE guild_id = ? AND message_id = ?')
        .bind(stars, guildId, messageId)
        .run();
      return;
    }
  }
  const posted = await postTo(context.rest, board, post);
  if (!posted) return;
  await context.database
    .prepare(
      'INSERT OR REPLACE INTO starboard_posts (guild_id, message_id, star_message_id, stars) VALUES (?, ?, ?, ?)',
    )
    .bind(guildId, messageId, String(posted.id), stars)
    .run();
}

export const starboardModule: ServerModule = {
  id: 'starboard',
  events: { MESSAGE_REACTION_ADD: onReaction, MESSAGE_REACTION_REMOVE: onReaction },
};
