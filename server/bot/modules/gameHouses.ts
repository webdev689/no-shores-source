// House roles: each linked member holds the role of the house their character is pledged to, and no other house's.
// A member gets theirs on joining, and a sweep every ten minutes keeps every member in step, a bounded number of
// changes at a time so Discord's limits hold. A role the setting does not name is never touched, and while the
// accounts cannot answer nothing changes, so no member loses a role for the accounts being away.

import { PLEDGES_MAX } from '../../accounts/linked.ts';
import { type Settings, recordOf } from '../law/settings.ts';
import type { BotContext } from '../kit.ts';
import { type RestResult, UNKNOWN } from '../rest.ts';
import type { ServerModule } from './module.ts';
import { serversWith } from './stats.ts';

/** The minute of each ten when the house roles are swept. */
export const HOUSES_MINUTE = 5;
/** The most roles one sweep gives or takes in a server; the rest wait for the next sweep. */
export const HOUSE_CHANGES_A_SWEEP = 50;

const said = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** A role to give a member, or to take from them. */
interface Change {
  readonly role: string;
  readonly give: boolean;
}

/** The role each house's members hold, by house name; a house with no role set is left out. */
function houseRoles(config: Settings): Map<string, string> {
  const entries = Array.isArray(config.houses) ? config.houses.map(recordOf) : [];
  return new Map(entries.filter((entry) => entry.role).map((entry) => [String(entry.faction), String(entry.role)]));
}

/** What brings a member's roles in step with their house: its role if they lack it, every other house's they hold. */
function changesFor(houses: Map<string, string>, house: string | null | undefined, held: readonly string[]): Change[] {
  const wanted = house ? houses.get(house) : undefined;
  const changes: Change[] = wanted && !held.includes(wanted) ? [{ role: wanted, give: true }] : [];
  for (const role of new Set(houses.values()))
    if (role !== wanted && held.includes(role)) changes.push({ role, give: false });
  return changes;
}

/** The house each of these members is pledged to (absent when linked to none), or null when the accounts cannot say. */
async function pledgesOf(context: BotContext, userIds: string[]): Promise<Record<string, string | null> | null> {
  const accounts = context.vars.ACCOUNTS;
  if (!accounts?.pledges) {
    context.log('[bot] game: the accounts cannot say who is in which house, so no house role changes');
    return null;
  }
  return accounts.pledges(userIds).catch((error: unknown) => {
    context.log(`[bot] game: the accounts did not answer: ${said(error)}`);
    return null;
  });
}

function change(context: BotContext, guildId: string, userId: string, each: Change): Promise<RestResult> {
  const path = `/guilds/${guildId}/members/${userId}/roles/${each.role}`;
  const reason = { reason: 'House role' };
  return each.give ? context.rest.put(path, undefined, reason) : context.rest.del(path, reason);
}

const events: ServerModule['events'] = {
  async GUILD_MEMBER_ADD(context, data, config) {
    const user = recordOf(data.user);
    const houses = houseRoles(config);
    // Discord refuses roles to a member still pending its rules screening; the sweep gives theirs once they pass
    if (!houses.size || user.bot || data.pending || !user.id) return;
    const userId = String(user.id);
    const pledges = await pledgesOf(context, [userId]);
    if (!pledges) return;
    for (const each of changesFor(houses, pledges[userId], [])) {
      const done = await change(context, String(data.guild_id), userId, each);
      if (!done.ok) context.log(`[bot] game: Discord did not give house role ${each.role}: ${done.message}`);
    }
  },
};

/** Bring one server's members in step with their houses, a page of Discord's member list at a time. */
async function sweep(context: BotContext, guildId: string, houses: Map<string, string>): Promise<void> {
  const refused = new Set<string>();
  let left = HOUSE_CHANGES_A_SWEEP;
  let after = '0';
  while (left > 0) {
    // a page of members is one ask of the accounts
    const page = await context.rest.get(`/guilds/${guildId}/members`, { query: { limit: PLEDGES_MAX, after } });
    if (!page.ok) {
      context.log(`[bot] game: Discord did not list the members for the house roles: ${page.message}`);
      return;
    }
    const members = (Array.isArray(page.json) ? page.json : []).map(recordOf);
    const people = members.filter((member) => !recordOf(member.user).bot && !member.pending);
    const pledges = await pledgesOf(
      context,
      people.map((member) => String(recordOf(member.user).id)),
    );
    if (!pledges) return;
    for (const member of people) {
      const userId = String(recordOf(member.user).id);
      const held = Array.isArray(member.roles) ? member.roles.map(String) : [];
      for (const each of changesFor(houses, pledges[userId], held)) {
        if (left <= 0) return;
        if (refused.has(each.role)) continue;
        left -= 1;
        const done = await change(context, guildId, userId, each);
        if (done.ok) continue;
        if (done.down) return;
        // a role refused, or deleted since the setting named it, fails for every member: it is passed over for the
        // rest of the sweep so the changes left reach the other houses; a member who left fails alone
        if (done.status !== 403 && done.code !== UNKNOWN.ROLE) continue;
        refused.add(each.role);
        context.log(`[bot] game: Discord refused to give or take house role ${each.role}: ${done.message}`);
      }
    }
    if (members.length < PLEDGES_MAX) return;
    after = String(recordOf(members.at(-1)?.user).id);
  }
}

async function minute(context: BotContext): Promise<void> {
  if (new Date(context.now()).getUTCMinutes() % 10 !== HOUSES_MINUTE) return;
  for (const guildId of await serversWith(context, 'game')) {
    const config = (await context.config(guildId, 'game'))?.config;
    const houses = config ? houseRoles(config) : new Map<string, string>();
    if (houses.size) await sweep(context, guildId, houses);
  }
}

/** The house roles' part of the game module: a joiner's role, and the sweep on the clock. */
export const houseRoleKeeping: Pick<ServerModule, 'events' | 'minute'> = { events, minute };
