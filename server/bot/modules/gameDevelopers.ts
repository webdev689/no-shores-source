// Who is a developer: a member of the No Shores Discord holding one of the roles the game module's setting names there
// (`developers`). The No Shores Discord is a server the game module is on in whose owner is one of the bot's owners
// (`BOT_OWNERS`), so no other server's roles count. The accounts ask through their binding (`main.ts`) whenever the
// game needs to know, and Discord is asked each time, so a role given or taken counts at once.

import { recordOf } from '../law/settings.ts';
import { type BotContext, ownersOf } from '../kit.ts';
import { serversWith } from './stats.ts';

/** A Discord user's id: a snowflake's digits. */
const SNOWFLAKE = /^\d{1,20}$/;

/** The roles a server's game module names as a developer's. */
const rolesOf = (config: unknown): string[] => {
  const named = recordOf(config).developers;
  return Array.isArray(named) ? named.map(String).filter(Boolean) : [];
};

/** Whether the Discord user holds a developer's role in the No Shores Discord; false while Discord does not answer,
 *  for an id that is no user's, and where the deploy names no owner. */
export async function isDeveloper(context: BotContext, userId: string): Promise<boolean> {
  const owners = ownersOf(context.vars);
  if (!SNOWFLAKE.test(userId) || owners.length === 0) return false;
  for (const guildId of await serversWith(context, 'game')) {
    const ownerId = (await context.snapshot(guildId))?.ownerId;
    if (ownerId === undefined || !owners.includes(ownerId)) continue;
    const roles = rolesOf((await context.config(guildId, 'game'))?.config);
    if (roles.length === 0) continue;
    const member = await context.rest.get(`/guilds/${guildId}/members/${userId}`);
    const held = member.ok ? recordOf(member.json).roles : null;
    if (Array.isArray(held) && held.some((role) => roles.includes(String(role)))) return true;
  }
  return false;
}
