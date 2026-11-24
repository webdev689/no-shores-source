// The raid guard. Joins are counted in the Gateway object's memory; enough inside the window starts raid mode, kept in
// the database so a restart does not end it. In raid mode, each new member is reported, timed out or kicked, and the
// server's verification level can be raised and given back when the clock ends raid mode. Very new accounts can be
// dealt with at any time.

import { recordOf, type Settings } from '../law/settings.ts';
import { type BotContext, durationWords, embed, postTo, snowflakeTime, userLabel } from '../kit.ts';
import type { EventHandler, ServerModule } from './module.ts';

/** Discord's verification level that asks for a verified phone. */
export const VERIFY_HIGH = 3;
/** How long a new account's time-out lasts. */
export const YOUNG_TIMEOUT_S = 86_400;
/** The raids one clock tick ends. */
const ENDS_A_TICK = 25;

interface RaidRow {
  readonly guild_id: string;
  readonly started_at: number;
  readonly until_s: number;
  readonly prior_level: number;
}

const raidOf = (context: BotContext, guildId: string) =>
  context.database.prepare('SELECT * FROM raid_mode WHERE guild_id = ?').bind(guildId).first<RaidRow>();

const DEALT_WORDS: Readonly<Record<string, string>> = { alert: 'reported', kick: 'kicked', timeout: 'timed out' };

/** Start raid mode, or lengthen it if it is on. Answers words for whoever started it. */
export async function startRaid(context: BotContext, guildId: string, config: Settings, minutes: number, why: string) {
  const nowS = Math.floor(context.now() / 1000);
  const untilS = nowS + minutes * 60;
  // The row is claimed first: of two starts at once (a panel press beside a burst of joins), one starts raid mode
  // and the other lengthens it, and neither fails.
  const claimed = await context.database
    .prepare(
      'INSERT INTO raid_mode (guild_id, started_at, until_s, prior_level) VALUES (?, ?, ?, -1) ON CONFLICT(guild_id) DO NOTHING RETURNING guild_id',
    )
    .bind(guildId, nowS, untilS)
    .first();
  if (!claimed) {
    await context.database
      .prepare('UPDATE raid_mode SET until_s = MAX(until_s, ?) WHERE guild_id = ?')
      .bind(untilS, guildId)
      .run();
    return { ok: true, message: 'Raid mode was already on; it now lasts longer.' };
  }
  let prior = -1;
  if (config.raiseVerification) {
    const guild = await context.rest.get(`/guilds/${guildId}`);
    const level = guild.ok ? Number(recordOf(guild.json).verification_level) : VERIFY_HIGH;
    if (level < VERIFY_HIGH) {
      const raised = await context.rest.patch(
        `/guilds/${guildId}`,
        { verification_level: VERIFY_HIGH },
        { reason: 'Raid mode' },
      );
      if (raised.ok) prior = level;
    }
  }
  if (prior >= 0)
    await context.database
      .prepare('UPDATE raid_mode SET prior_level = ? WHERE guild_id = ?')
      .bind(prior, guildId)
      .run();
  const dealt = DEALT_WORDS[String(config.raidAction)] ?? 'kicked';
  await postTo(context.rest, String(config.alertChannel ?? ''), {
    embeds: [
      embed({
        title: 'Raid mode on',
        color: 0xb91309,
        description: `${why} For ${durationWords(minutes * 60)}, members who join are ${dealt}.`,
        timestamp: context.now(),
      }),
    ],
  });
  return { ok: true, message: `Raid mode is on for ${durationWords(minutes * 60)}.` };
}

export async function endRaid(context: BotContext, guildId: string, config: Settings, why: string) {
  const raid = await raidOf(context, guildId);
  if (!raid) return { ok: false, message: 'Raid mode is not on.' };
  if (Number(raid.prior_level) >= 0)
    await context.rest.patch(
      `/guilds/${guildId}`,
      { verification_level: Number(raid.prior_level) },
      { reason: 'Raid mode ended' },
    );
  await context.database.prepare('DELETE FROM raid_mode WHERE guild_id = ?').bind(guildId).run();
  await postTo(context.rest, String(config.alertChannel ?? ''), {
    embeds: [embed({ title: 'Raid mode off', color: 0x2c7341, description: why, timestamp: context.now() })],
  });
  return { ok: true, message: 'Raid mode is off.' };
}

/** Deal with one member: report (nothing more), time out for `timeoutS`, or kick. */
async function deal(
  context: BotContext,
  guildId: string,
  userId: string,
  how: unknown,
  timeoutS: number,
  reason: string,
) {
  const member = `/guilds/${guildId}/members/${userId}`;
  if (how === 'kick') await context.rest.del(member, { reason });
  if (how === 'timeout') {
    const until = new Date(context.now() + timeoutS * 1000).toISOString();
    await context.rest.patch(member, { communication_disabled_until: until }, { reason });
  }
}

const events: Readonly<Record<string, EventHandler>> = {
  async GUILD_MEMBER_ADD(context, data, config) {
    const user = recordOf(data.user);
    if (user.bot) return;
    const userId = String(user.id);
    const guildId = String(data.guild_id);
    const now = context.now();
    const memory = context.memory ?? new Map<string, unknown>();
    const key = `antiraid:${guildId}`;
    const windowMs = Number(config.joinSeconds) * 1000;
    const held = memory.get(key);
    // held as entries with `at`, the shape the core's memory pruning reads a list's age by
    const joins = (Array.isArray(held) ? (held as { at: number }[]) : []).filter((join) => now - join.at <= windowMs);
    joins.push({ at: now });
    memory.set(key, joins);
    let raid = await raidOf(context, guildId);
    if (!raid && joins.length >= Number(config.joinCount)) {
      const why = `${joins.length} members joined within ${durationWords(Number(config.joinSeconds))}.`;
      await startRaid(context, guildId, config, Number(config.raidMinutes), why);
      raid = await raidOf(context, guildId);
    }
    if (raid) {
      const left = Math.max(60, Number(raid.until_s) - Math.floor(now / 1000));
      await deal(context, guildId, userId, config.raidAction, left, 'Raid mode');
      return;
    }
    const ageMs = now - snowflakeTime(userId);
    const youngDays = Number(config.minAccountDays) || 0;
    if (youngDays <= 0 || ageMs >= youngDays * 86_400_000) return;
    await deal(context, guildId, userId, config.youngAction, YOUNG_TIMEOUT_S, 'A very new account');
    await postTo(context.rest, String(config.alertChannel ?? ''), {
      embeds: [
        embed({
          title: 'New account joined',
          color: 0xd9a33c,
          description: `${userLabel(user)}: the account is ${durationWords(ageMs / 1000)} old.`,
          timestamp: now,
        }),
      ],
    });
  },
};

/** End the raids whose time is up. */
async function minute(context: BotContext): Promise<void> {
  const due = await context.database
    .prepare('SELECT guild_id FROM raid_mode WHERE until_s <= ? LIMIT ?')
    .bind(Math.floor(context.now() / 1000), ENDS_A_TICK)
    .all<{ guild_id: string }>();
  for (const row of due.results ?? []) {
    const found = await context.config(String(row.guild_id), 'antiraid');
    await endRaid(context, String(row.guild_id), found?.config ?? {}, 'Its time is up.');
  }
}

export const antiraidModule: ServerModule = {
  id: 'antiraid',
  events,
  minute,
  actions: {
    start: (context, guildId, input, actor, config) =>
      startRaid(context, guildId, config, Number(input.minutes), `Started by ${actor.name}.`),
    end: (context, guildId, _input, actor, config) => endRaid(context, guildId, config, `Ended by ${actor.name}.`),
  },
};
