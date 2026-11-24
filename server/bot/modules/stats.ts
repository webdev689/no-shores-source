// Stat channels: channel names that show live numbers. Discord lets a channel be renamed twice in ten minutes, so the
// clock updates every ten minutes, and only a name that changed.

import { fillSlots } from '../law/message.ts';
import { recordOf } from '../law/settings.ts';
import type { BotContext } from '../kit.ts';
import type { Snapshot } from '../store.ts';
import { serversWith } from './birthdays.ts';
import type { ServerModule } from './module.ts';

/** The minute of each ten when the counters are updated. */
export const STATS_MINUTE = 3;

/** The numbers a counter can show, from the server's snapshot; @everyone is not counted as a role. */
export const statsOf = (snapshot: Snapshot) => ({
  members: snapshot.memberCount,
  roles: Math.max(0, snapshot.roles.length - 1),
  channels: snapshot.channels.length,
});

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
      const current = snapshot.channels.find((channel) => channel.id === channelId)?.name;
      if (current !== name) await context.rest.patch(`/channels/${channelId}`, { name }, { reason: 'Stat channel' });
    }
  }
}

export const statsModule: ServerModule = { id: 'stats', minute };
