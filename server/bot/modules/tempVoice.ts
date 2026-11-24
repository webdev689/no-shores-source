// Voice rooms: joining the hub channel makes the member a voice room of their own, which they may rename and manage,
// and moves them into it. When the last member leaves, the room is deleted. Who sits where is the Gateway's cache.
// A room no one could be moved into goes at once, and one left empty while the bot was away goes when it is back.

import { escapeText, fillSlots } from '../law/message.ts';
import { recordOf } from '../law/settings.ts';
import type { BotContext } from '../kit.ts';
import type { EventHandler, ServerModule } from './module.ts';

/** Manage Channels, Connect and Move Members: the owner may rename the room, lock it and still get in, and run it. */
const ROOM_OWNER_BITS = (1n << 4n) | (1n << 20n) | (1n << 24n);
const VOICE = 2;

async function dropRoom(context: BotContext, roomId: string): Promise<void> {
  await context.rest.del(`/channels/${roomId}`, { reason: 'Voice room empty' });
  await context.database.prepare('DELETE FROM temp_voice WHERE channel_id = ?').bind(roomId).run();
}

/** The server arrives with everyone in voice now: a room with no one in it was left while the bot was away. */
const onGuild: EventHandler = async (context, data) => {
  const states = Array.isArray(data.voice_states) ? data.voice_states.map(recordOf) : [];
  const seated = new Set(states.map((state) => String(state.channel_id ?? '')));
  const rooms = await context.database
    .prepare('SELECT channel_id FROM temp_voice WHERE guild_id = ?')
    .bind(String(data.id))
    .all<{ channel_id: string }>();
  for (const room of rooms.results) if (!seated.has(String(room.channel_id))) await dropRoom(context, room.channel_id);
};

const onVoice: EventHandler = async (context, data, config) => {
  const guildId = String(data.guild_id);
  const userId = String(data.user_id);
  const left = String(recordOf(data.previous).channelId ?? '');
  const joined = data.channel_id ? String(data.channel_id) : '';
  if (left && left !== joined) {
    const room = await context.database
      .prepare('SELECT channel_id FROM temp_voice WHERE channel_id = ?')
      .bind(left)
      .first();
    const someone = (context.cache?.inVoice(guildId) ?? []).some((seat) => seat.channelId === left);
    if (room && !someone) await dropRoom(context, left);
  }
  if (!config.hub || joined !== config.hub) return;
  const member = recordOf(data.member);
  const user = recordOf(member.user);
  const name = fillSlots(config.name, {
    name: escapeText(member.nick || user.global_name || user.username || 'Member'),
  }).slice(0, 100);
  const limit = Number(config.limit) || 0;
  const made = await context.rest.post(
    `/guilds/${guildId}/channels`,
    {
      name,
      type: VOICE,
      ...(config.category ? { parent_id: config.category } : {}),
      ...(limit ? { user_limit: limit } : {}),
      permission_overwrites: [{ id: userId, type: 1, allow: String(ROOM_OWNER_BITS), deny: '0' }],
    },
    { reason: 'Voice room' },
  );
  if (!made.ok) return;
  const roomId = String(recordOf(made.json).id);
  await context.database
    .prepare('INSERT INTO temp_voice (channel_id, guild_id, owner_id, made_at) VALUES (?, ?, ?, ?)')
    .bind(roomId, guildId, userId, Math.floor(context.now() / 1000))
    .run();
  const moved = await context.rest.patch(
    `/guilds/${guildId}/members/${userId}`,
    { channel_id: roomId },
    { reason: 'Voice room' },
  );
  // not moved (no Move Members, or they left the hub first): no one will ever leave the room, so it goes now
  if (!moved.ok) await dropRoom(context, roomId);
};

export const tempVoiceModule: ServerModule = {
  id: 'tempvoice',
  events: { GUILD_CREATE: onGuild, VOICE_STATE_UPDATE: onVoice },
};
