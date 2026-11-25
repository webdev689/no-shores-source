// Stat channels: channel names that show live numbers. Discord lets a channel be renamed twice in ten minutes, so the
// clock updates every ten minutes, and only a name that changed.

import { fillSlots } from '../law/message.ts';
import { CHANNEL_KIND, recordOf } from '../law/settings.ts';
import type { BotContext } from '../kit.ts';
import type { Snapshot, SnapshotChannel } from '../store.ts';
import type { ServerModule } from './module.ts';

/** Every server where a module is on: the clock's modules run across them all. */
export async function serversWith(context: BotContext, moduleId: string): Promise<string[]> {
  const servers = await context.database
    .prepare('SELECT guild_id FROM guild_config WHERE module = ? AND enabled = 1')
    .bind(moduleId)
    .all<{ guild_id: string }>();
  return servers.results.map((server) => String(server.guild_id));
}

/** The minute of each ten when the counters are updated. */
export const STATS_MINUTE = 3;

/** The numbers a counter can show, from the server's snapshot; @everyone is not counted as a role. */
export const statsOf = (snapshot: Snapshot) => ({
  members: snapshot.memberCount,
  roles: Math.max(0, snapshot.roles.length - 1),
  channels: snapshot.channels.length,
});

/**
 * Whether a channel shows this name already. Discord keeps a text channel's name folded (lower case, dashes for
 * spaces, some marks dropped), so there only the letters and numbers are compared; a voice channel's is kept as given.
 */
function showsName(channel: Pick<SnapshotChannel, 'name' | 'type'> | undefined, name: string): boolean {
  if (!channel) return false;
  const folded = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  const text = channel.type === CHANNEL_KIND.TEXT || channel.type === CHANNEL_KIND.ANNOUNCEMENT;
  return text ? folded(channel.name) === folded(name) : channel.name === name;
}

async function minute(context: BotContext): Promise<void> {
  if (new Date(context.now()).getUTCMinutes() % 10 !== STATS_MINUTE) return;
  for (const guildId of await serversWith(context, 'stats')) {
    const config = (await context.config(guildId, 'stats'))?.config;
    const snapshot = await context.snapshot(guildId);
    if (!config || !snapshot) continue;
    const numbers = statsOf(snapshot);
    const counters = Array.isArray(config.counters) ? config.counters.map(recordOf) : [];
    for (const counter of counters) {
      const channelId = String(counter.channel ?? '');
      if (!channelId) continue;
      const name = fillSlots(counter.name, numbers).slice(0, 100);
      const current = snapshot.channels.find((channel) => channel.id === channelId);
      if (!showsName(current, name))
        await context.rest.patch(`/channels/${channelId}`, { name }, { reason: 'Stat channel' });
    }
  }
}

export const statsModule: ServerModule = { id: 'stats', minute };
