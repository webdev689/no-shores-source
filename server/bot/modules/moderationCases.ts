// Moderation's one path for an act: warn, time out, kick, ban, unban and note, each a numbered case, from a slash
// command, the panel or another module (auto-mod's warning). The checks, the case, the member's message and the log
// line are the same wherever the act starts. Discord's own permissions decide who may act; role order decides on whom.

import { escapeText } from '../law/message.ts';
import { recordOf, type Settings } from '../law/settings.ts';
import { PERMISSION } from '../law/access.ts';
import {
  type BotContext,
  botUserId,
  directMessage,
  durationWords,
  embed,
  holds,
  parseDuration,
  postTo,
  topPosition,
} from '../kit.ts';
import { MISSING_PERMISSIONS, type RestResult } from '../rest.ts';
import type { Snapshot } from '../store.ts';
import type { Actor } from './module.ts';

/** Discord's longest time-out. */
export const TIMEOUT_MAX_S = 28 * 86_400;
/**
 * How long a ban or an unban the bot asked for is known as its own: an hour, longer than Discord's word of it takes
 * even when a resume replays what the Gateway missed, or a busy queue holds it.
 */
export const OWN_BAN_S = 3600;
/** The name the case shows for an act the bot took by itself. */
export const BOT_NAME = 'The bot';

export const ACTIONS = ['warn', 'timeout', 'untimeout', 'kick', 'ban', 'unban', 'note'] as const;
export type Action = (typeof ACTIONS)[number];
export const isAction = (value: unknown): value is Action => ACTIONS.includes(value as Action);

const DONE_WORDS: Readonly<Record<Action, string>> = {
  warn: 'warned',
  timeout: 'timed out',
  untimeout: 'released from time-out',
  kick: 'kicked',
  ban: 'banned',
  unban: 'unbanned',
  note: 'noted',
};
export const TITLES: Readonly<Record<Action, string>> = {
  warn: 'Warning',
  timeout: 'Time-out',
  untimeout: 'Time-out ended',
  kick: 'Kick',
  ban: 'Ban',
  unban: 'Unban',
  note: 'Note',
};
const COLOURS: Readonly<Record<Action, number>> = {
  warn: 0xd9a33c,
  timeout: 0xc77d2e,
  untimeout: 0x4e7f72,
  kick: 0xbf5a1f,
  ban: 0xb91309,
  unban: 0x2c7341,
  note: 0x6b7280,
};
/** The Discord permission each act needs, of whoever asks and of the bot. */
export const ACT_PERMISSION: Readonly<Record<Action, bigint>> = {
  warn: PERMISSION.MODERATE_MEMBERS,
  timeout: PERMISSION.MODERATE_MEMBERS,
  untimeout: PERMISSION.MODERATE_MEMBERS,
  note: PERMISSION.MODERATE_MEMBERS,
  kick: PERMISSION.KICK_MEMBERS,
  ban: PERMISSION.BAN_MEMBERS,
  unban: PERMISSION.BAN_MEMBERS,
};

export interface Who {
  readonly id: string;
  readonly name: string;
}
/** Who asks for an act: the part of the panel's actor a slash command can also give. */
export type Asker = Pick<Actor, 'id' | 'name' | 'roles' | 'permissions' | 'owner'>;
export interface Act {
  readonly action: Action;
  readonly guildId: string;
  readonly user: Who;
  readonly mod: Who;
  readonly reason: string;
  readonly durationS?: number;
  readonly deleteS?: number;
  /** Moderation's settings in the server. */
  readonly config: Settings;
}
export interface Outcome {
  readonly ok: boolean;
  readonly caseNo: number;
  readonly message: string;
}

/** A list of ids from Discord's JSON, or none. */
export const idsOf = (value: unknown): string[] => (Array.isArray(value) ? value.map(String) : []);

/** Record a case and answer its number: the server's next, taken in the same statement as the insert. */
export async function recordCase(context: BotContext, act: Act, nowS: number): Promise<number> {
  const expires = act.action === 'ban' && act.durationS ? nowS + act.durationS : 0;
  const row = await context.database
    .prepare(
      `INSERT INTO mod_cases (guild_id, case_no, action, user_id, user_name, mod_id, mod_name, reason, duration_s,
         created_at, expires_at, active)
       SELECT ?, COALESCE(MAX(case_no), 0) + 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1 FROM mod_cases WHERE guild_id = ?
       RETURNING case_no`,
    )
    .bind(
      act.guildId,
      act.action,
      act.user.id,
      act.user.name.slice(0, 100),
      act.mod.id,
      act.mod.name.slice(0, 100),
      act.reason.slice(0, 400),
      act.durationS ?? 0,
      nowS,
      expires,
      act.guildId,
    )
    .first<{ case_no: number }>();
  return Number(row?.case_no ?? 0);
}

/** End a member's open ban cases, so no time limit set before lifts the ban they are under now. */
export async function endBanCases(context: BotContext, guildId: string, userId: string): Promise<void> {
  await context.database
    .prepare("UPDATE mod_cases SET active = 0 WHERE guild_id = ? AND user_id = ? AND action = 'ban' AND active = 1")
    .bind(guildId, userId)
    .run();
}

export type BanChange = 'ban' | 'unban';

/**
 * Ask Discord for a ban or an unban, noted in `bot_ban_asks` first: Discord's word of it can reach the Gateway before
 * its answer reaches here. An ask Discord refused is let go.
 */
export async function askBanChange(
  context: BotContext,
  guildId: string,
  userId: string,
  change: BanChange,
  ask: () => Promise<RestResult>,
): Promise<RestResult> {
  const asked = await context.database
    .prepare('INSERT INTO bot_ban_asks (guild_id, user_id, action, at) VALUES (?, ?, ?, ?) RETURNING id')
    .bind(guildId, userId, change, Math.floor(context.now() / 1000))
    .first<{ id: number }>();
  const done = await ask();
  if (!done.ok && asked) await context.database.prepare('DELETE FROM bot_ban_asks WHERE id = ?').bind(asked.id).run();
  return done;
}

/**
 * Take the oldest of the bot's asks for this change in the last OWN_BAN_S: true when there was one, so the change
 * Discord tells of is the bot's. Each ask answers one change, so one made by hand soon after is still told apart.
 */
export async function takeOwnBanChange(
  context: BotContext,
  guildId: string,
  userId: string,
  change: BanChange,
): Promise<boolean> {
  const since = Math.floor(context.now() / 1000) - OWN_BAN_S;
  const taken = await context.database
    .prepare(
      `DELETE FROM bot_ban_asks WHERE id = (SELECT id FROM bot_ban_asks
         WHERE guild_id = ? AND user_id = ? AND action = ? AND at >= ? ORDER BY id LIMIT 1) RETURNING id`,
    )
    .bind(guildId, userId, change, since)
    .first();
  return taken !== null;
}

const botIdOf = (context: BotContext) => botUserId(context.rest, String(context.vars.DISCORD_BOT_TOKEN ?? ''));

/**
 * Why the asker may not act on the target, or null when they may. The owner, oneself and the bot are never targets;
 * a target must sit below both the asker's highest role and the bot's. A kick or a time-out needs the target in the
 * server; a ban does not.
 */
export async function whyNot(
  context: BotContext,
  guildId: string,
  asker: Asker,
  targetId: string,
  mustBeMember: boolean,
): Promise<string | null> {
  const snapshot = await context.snapshot(guildId);
  if (!snapshot) return 'The bot does not know this server yet.';
  if (targetId === snapshot.ownerId) return 'No one can act on the server owner.';
  if (targetId === asker.id) return 'You cannot act on yourself.';
  const botId = await botIdOf(context);
  if (targetId === botId) return 'The bot cannot act on itself.';
  const target = await context.rest.get(`/guilds/${guildId}/members/${targetId}`);
  if (!target.ok) {
    if (target.down) return 'Discord did not answer. Try again in a minute.';
    return mustBeMember ? 'That member is not in this server.' : null;
  }
  const targetTop = topPosition(snapshot.roles, idsOf(recordOf(target.json).roles));
  if (!asker.owner && topPosition(snapshot.roles, asker.roles) <= targetTop)
    return "That member's highest role is not below yours.";
  const bot = botId ? await context.rest.get(`/guilds/${guildId}/members/${botId}`) : null;
  if (bot?.ok && topPosition(snapshot.roles, idsOf(recordOf(bot.json).roles)) <= targetTop)
    return "That member's highest role is not below the bot's. Move the bot's role higher.";
  return null;
}

/** What Discord is asked to do for an act; a warning or a note asks nothing. */
async function applyToDiscord(context: BotContext, act: Act): Promise<RestResult | null> {
  const member = `/guilds/${act.guildId}/members/${act.user.id}`;
  const ban = `/guilds/${act.guildId}/bans/${act.user.id}`;
  const reason = act.reason || `By ${act.mod.name}`;
  switch (act.action) {
    case 'timeout': {
      const until = new Date(context.now() + Math.min(act.durationS ?? 0, TIMEOUT_MAX_S) * 1000).toISOString();
      return context.rest.patch(member, { communication_disabled_until: until }, { reason });
    }
    case 'untimeout':
      return context.rest.patch(member, { communication_disabled_until: null }, { reason });
    case 'kick':
      return context.rest.del(member, { reason });
    case 'ban':
      return askBanChange(context, act.guildId, act.user.id, 'ban', () =>
        context.rest.put(ban, { delete_message_seconds: act.deleteS ?? 0 }, { reason }),
      );
    case 'unban':
      return askBanChange(context, act.guildId, act.user.id, 'unban', () => context.rest.del(ban, { reason }));
    default:
      return null;
  }
}

/** The case as the log channel shows it. */
export function caseCard(act: Act, caseNo: number, nowMs: number) {
  const fields = [
    { name: 'Member', value: `${escapeText(act.user.name)} (${act.user.id})`, inline: true },
    { name: 'By', value: escapeText(act.mod.name), inline: true },
  ];
  if (act.durationS) fields.push({ name: 'For', value: durationWords(act.durationS), inline: true });
  fields.push({ name: 'Reason', value: act.reason ? escapeText(act.reason) : 'None given', inline: false });
  return embed({
    title: `Case ${caseNo} | ${TITLES[act.action]}`,
    color: COLOURS[act.action],
    fields,
    timestamp: nowMs,
  });
}

/**
 * Whether the bot holds the permission an act needs, from the server's roles and its own. A bot whose roles cannot be
 * read is let try: Discord answers for it.
 */
async function botMay(context: BotContext, snapshot: Snapshot | null, act: Act): Promise<boolean> {
  if (!snapshot) return true;
  const botId = await botIdOf(context);
  const self = botId ? await context.rest.get(`/guilds/${act.guildId}/members/${botId}`) : null;
  if (!self?.ok) return true;
  const permissionsOf = new Map(snapshot.roles.map((role) => [role.id, role.permissions]));
  let held = BigInt(permissionsOf.get(act.guildId) ?? '0');
  for (const id of idsOf(recordOf(self.json).roles)) held |= BigInt(permissionsOf.get(id) ?? '0');
  return holds(String(held), ACT_PERMISSION[act.action]);
}

/**
 * Do one act: Discord first, then the case, the member's message and the log line. A member is told before a kick
 * or a ban, while a direct message can still reach them, and only once the bot holds the permission for it.
 */
export async function moderate(context: BotContext, act: Act): Promise<Outcome> {
  const snapshot = await context.snapshot(act.guildId);
  const server = snapshot?.name ?? 'the server';
  const tell = act.config.dmMembers !== false && act.action !== 'note' && act.action !== 'unban';
  const told = tell
    ? {
        embeds: [
          embed({
            title: `You were ${DONE_WORDS[act.action]} in ${server}`,
            color: COLOURS[act.action],
            fields: [
              ...(act.durationS ? [{ name: 'For', value: durationWords(act.durationS) }] : []),
              { name: 'Reason', value: act.reason ? escapeText(act.reason) : 'None given' },
            ],
          }),
        ],
      }
    : null;
  const toldFirst = !!told && (act.action === 'kick' || act.action === 'ban');
  if (toldFirst) {
    if (!(await botMay(context, snapshot, act)))
      return { ok: false, caseNo: 0, message: 'The bot lacks the permission for that.' };
    await directMessage(context.rest, act.user.id, told);
  }
  const done = await applyToDiscord(context, act);
  if (done && !done.ok) {
    // Discord refused after the member was told: they are still here, so the message is taken back
    if (toldFirst)
      await directMessage(context.rest, act.user.id, {
        content: `Ignore the last message: you were not ${DONE_WORDS[act.action]} in ${server}.`,
      });
    const message =
      done.code === MISSING_PERMISSIONS
        ? 'The bot lacks the permission for that.'
        : `Discord refused it: ${done.message}`;
    return { ok: false, caseNo: 0, message };
  }
  if (told && !toldFirst) await directMessage(context.rest, act.user.id, told);
  const nowS = Math.floor(context.now() / 1000);
  // An unban ends every ban case; a new ban ends the ones before it, so an old time limit never lifts it.
  if (act.action === 'unban' || act.action === 'ban') await endBanCases(context, act.guildId, act.user.id);
  const caseNo = await recordCase(context, act, nowS);
  await postTo(context.rest, String(act.config.logChannel ?? ''), { embeds: [caseCard(act, caseNo, context.now())] });
  if (act.action === 'warn') await stepAfterWarning(context, act, nowS);
  const extra = act.durationS ? ` for ${durationWords(act.durationS)}` : '';
  return { ok: true, caseNo, message: `${act.user.name} was ${DONE_WORDS[act.action]}${extra}. Case ${caseNo}.` };
}

/** After a warning, the step set for the member's count of warnings, done by the bot. */
async function stepAfterWarning(context: BotContext, act: Act, nowS: number): Promise<void> {
  const days = Number(act.config.warnDays) || 0;
  const row = await context.database
    .prepare(
      "SELECT COUNT(*) AS count FROM mod_cases WHERE guild_id = ? AND user_id = ? AND action = 'warn' AND active = 1 AND created_at >= ?",
    )
    .bind(act.guildId, act.user.id, days ? nowS - days * 86_400 : 0)
    .first<{ count: number }>();
  const count = Number(row?.count ?? 0);
  const steps = Array.isArray(act.config.steps) ? act.config.steps.map(recordOf) : [];
  const step = steps.find((candidate) => Number(candidate.warnings) === count);
  if (!step || !isAction(step.action)) return;
  const botId = await botIdOf(context);
  await moderate(context, {
    ...act,
    action: step.action,
    mod: { id: botId || 'bot', name: BOT_NAME },
    reason: `Reached ${count} warnings`,
    durationS: step.action === 'kick' ? 0 : (Number(step.minutes) || 0) * 60,
  });
}

/** What an asker wants done, before it is checked. */
export interface Ask {
  readonly action: Action;
  readonly userId: string;
  readonly userName: string;
  readonly reason: string;
  readonly duration: string;
  readonly deleteS?: number;
}

/** Check and do one act for an asker, from a command or the panel. Answers the words to show them. */
export async function actFor(
  context: BotContext,
  guildId: string,
  asker: Asker,
  config: Settings,
  ask: Ask,
): Promise<{ ok: boolean; message: string }> {
  if (!asker.owner && !holds(String(asker.permissions), ACT_PERMISSION[ask.action]))
    return { ok: false, message: 'You lack the Discord permission for that.' };
  if (!/^\d{17,20}$/.test(ask.userId)) return { ok: false, message: 'That is not a user id.' };
  if (config.requireReason && !ask.reason.trim() && ask.action !== 'note')
    return { ok: false, message: 'A reason is required in this server.' };
  let durationS = 0;
  if (ask.duration) {
    durationS = parseDuration(ask.duration) ?? -1;
    if (durationS < 0) return { ok: false, message: 'Use a duration such as 10m, 2h or 7d.' };
  }
  if (ask.action === 'timeout' && (durationS <= 0 || durationS > TIMEOUT_MAX_S))
    return { ok: false, message: 'A time-out lasts from a second to 28 days.' };
  if (ask.action !== 'unban') {
    const mustBeMember = ask.action !== 'ban' && ask.action !== 'note';
    const refusal = await whyNot(context, guildId, asker, ask.userId, mustBeMember);
    if (refusal) return { ok: false, message: refusal };
  }
  const done = await moderate(context, {
    action: ask.action,
    guildId,
    user: { id: ask.userId, name: ask.userName || ask.userId },
    mod: { id: asker.id, name: asker.name },
    reason: ask.reason.trim(),
    durationS: ask.action === 'kick' || ask.action === 'unban' ? 0 : durationS,
    deleteS: ask.deleteS ?? 0,
    config,
  });
  return { ok: done.ok, message: done.message };
}
