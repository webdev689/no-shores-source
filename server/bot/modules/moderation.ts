// Moderation: the slash commands, the panel's tables and acts, the clock that lifts temporary bans, and Discord's word
// of bans made by hand, which end them. Every act on a member goes through `actFor` in moderationCases.ts; the channel
// tools (purge, slow mode, lock) are here.

import { escapeText } from '../law/message.ts';
import { PERMISSION } from '../law/access.ts';
import { recordOf, type Settings } from '../law/settings.ts';
import {
  type BotContext,
  type Interaction,
  deferred,
  durationWords,
  holds,
  optionOf,
  postTo,
  privateReply,
} from '../kit.ts';
import type { ActionRunner, EventHandler, ServerModule, ViewReader } from './module.ts';
import {
  type Act,
  type Action,
  type Asker,
  type BanChange,
  BOT_NAME,
  OWN_BAN_S,
  TITLES,
  actFor,
  askBanChange,
  caseCard,
  endBanCases,
  isAction,
  recordCase,
  takeOwnBanChange,
} from './moderationCases.ts';

/** How long a temporary ban the bot could not lift waits before it is tried again. */
export const UNBAN_RETRY_S = 3600;
/** What a lock takes from @everyone: sending in the channel and in its threads. */
const SEND_BITS = PERMISSION.SEND_MESSAGES | (1n << 38n);
export const PURGE_MAX = 100;
/** Discord deletes in bulk only messages younger than two weeks; a minute's margin. */
export const PURGE_AGE_MS = 14 * 86_400_000 - 60_000;
/** The temporary bans one clock tick lifts, so a backlog never runs a tick long. */
export const UNBANS_A_TICK = 25;
const SLOWMODE_MAX_S = 21_600;
const LACKING = 'You lack the Discord permission for that.';

const USER_OPTION = { type: 6, name: 'member', description: 'Who', required: true };
const REASON_OPTION = {
  type: 3,
  name: 'reason',
  description: 'Why: kept in the case',
  required: false,
  max_length: 400,
};
const command = (name: string, description: string, permission: bigint, options: readonly object[]) => ({
  name,
  description,
  type: 1,
  contexts: [0],
  default_member_permissions: String(permission),
  options,
});

export const MODERATION_COMMANDS = Object.freeze([
  command('warn', 'Warn a member', PERMISSION.MODERATE_MEMBERS, [USER_OPTION, REASON_OPTION]),
  command('timeout', 'Time out a member', PERMISSION.MODERATE_MEMBERS, [
    USER_OPTION,
    {
      type: 3,
      name: 'duration',
      description: 'Such as 10m, 2h or 7d (28 days at most)',
      required: true,
      max_length: 12,
    },
    REASON_OPTION,
  ]),
  command('untimeout', 'End a time-out', PERMISSION.MODERATE_MEMBERS, [USER_OPTION, REASON_OPTION]),
  command('kick', 'Kick a member', PERMISSION.KICK_MEMBERS, [USER_OPTION, REASON_OPTION]),
  command('ban', 'Ban a member', PERMISSION.BAN_MEMBERS, [
    USER_OPTION,
    { type: 3, name: 'duration', description: 'Such as 7d; leave empty for no end', required: false, max_length: 12 },
    {
      type: 3,
      name: 'delete',
      description: 'Delete their recent messages',
      required: false,
      choices: [
        { name: 'None', value: '0' },
        { name: 'The last hour', value: '3600' },
        { name: 'The last day', value: '86400' },
        { name: 'The last week', value: '604800' },
      ],
    },
    REASON_OPTION,
  ]),
  command('unban', 'Unban a user', PERMISSION.BAN_MEMBERS, [
    { type: 3, name: 'user', description: 'Their user id', required: true, max_length: 20 },
    REASON_OPTION,
  ]),
  command('note', "Add a note to a member's record", PERMISSION.MODERATE_MEMBERS, [
    USER_OPTION,
    { type: 3, name: 'note', description: 'The note', required: true, max_length: 400 },
  ]),
  command('cases', "A member's cases", PERMISSION.MODERATE_MEMBERS, [USER_OPTION]),
  command('unwarn', 'Remove a warning by its case number', PERMISSION.MODERATE_MEMBERS, [
    { type: 4, name: 'case', description: 'The case number', required: true, min_value: 1 },
  ]),
  command('purge', 'Delete recent messages in this channel', PERMISSION.MANAGE_MESSAGES, [
    { type: 4, name: 'count', description: 'How many, 1 to 100', required: true, min_value: 1, max_value: PURGE_MAX },
    { type: 6, name: 'member', description: "Only this member's", required: false },
  ]),
  command('slowmode', "Set this channel's slow mode", PERMISSION.MANAGE_CHANNELS, [
    {
      type: 4,
      name: 'seconds',
      description: '0 turns it off; 21600 at most',
      required: true,
      min_value: 0,
      max_value: SLOWMODE_MAX_S,
    },
  ]),
  command('lock', 'Stop everyone sending in this channel', PERMISSION.MANAGE_CHANNELS, [REASON_OPTION]),
  command('unlock', 'Let everyone send in this channel again', PERMISSION.MANAGE_CHANNELS, [REASON_OPTION]),
]);

/** Who a slash command came from. */
export function askerOf(interaction: Interaction, ownerId: string): Asker {
  const user = interaction.member?.user ?? {};
  let permissions = 0n;
  try {
    permissions = BigInt(String(interaction.member?.permissions ?? '0'));
  } catch {
    permissions = 0n;
  }
  return {
    id: String(user.id ?? ''),
    name: String(user.global_name || user.username || 'Someone'),
    roles: (interaction.member?.roles ?? []).map(String),
    permissions,
    owner: String(user.id) === ownerId,
  };
}

function nameOf(interaction: Interaction, id: string): string {
  const user = recordOf(recordOf(recordOf(interaction.data?.resolved).users)[id]);
  return String(user.global_name || user.username || id);
}

const may = (asker: Asker, permission: bigint) => asker.owner || holds(String(asker.permissions), permission);

async function casesOf(context: BotContext, guildId: string, userId: string) {
  const rows = await context.database
    .prepare('SELECT * FROM mod_cases WHERE guild_id = ? AND user_id = ? ORDER BY case_no DESC LIMIT 15')
    .bind(guildId, userId)
    .all<Settings>();
  return rows.results ?? [];
}

const titleOf = (action: unknown): string => (isAction(action) ? TITLES[action] : String(action));
const caseLine = (row: Settings) =>
  `#${String(row.case_no)} ${titleOf(row.action)}${row.active ? '' : ' (cleared)'}: ${
    row.reason ? escapeText(String(row.reason)).slice(0, 120) : 'no reason'
  } <t:${String(row.created_at)}:d>`;

/** Remove a warning: it stops counting toward the automatic steps. */
async function unwarn(context: BotContext, guildId: string, caseNo: number) {
  const done = await context.database
    .prepare("UPDATE mod_cases SET active = 0 WHERE guild_id = ? AND case_no = ? AND action = 'warn' AND active = 1")
    .bind(guildId, caseNo)
    .run();
  return done.meta.changes === 1
    ? { ok: true, message: `Warning ${caseNo} removed.` }
    : { ok: false, message: `Case ${caseNo} is not a warning that still counts.` };
}

/** Lock or unlock a channel for @everyone, keeping every other permission the channel sets. */
async function setLock(context: BotContext, guildId: string, channelId: string, lock: boolean, reason: string) {
  const channel = await context.rest.get(`/channels/${channelId}`);
  if (!channel.ok) return 'Discord did not let the bot read this channel.';
  const overwrites = recordOf(channel.json).permission_overwrites;
  const everyone = recordOf(
    (Array.isArray(overwrites) ? overwrites : []).find((over) => recordOf(over).id === guildId),
  );
  const allow = BigInt(String(everyone.allow ?? '0')) & ~SEND_BITS;
  const denied = BigInt(String(everyone.deny ?? '0'));
  const deny = lock ? denied | SEND_BITS : denied & ~SEND_BITS;
  const done = await context.rest.put(
    `/channels/${channelId}/permissions/${guildId}`,
    { type: 0, allow: String(allow), deny: String(deny) },
    { reason: reason || (lock ? 'Locked' : 'Unlocked') },
  );
  if (!done.ok) return 'The bot lacks Manage Roles or Manage Channels here.';
  return lock ? 'This channel is locked.' : 'This channel is unlocked.';
}

/** Delete up to `count` recent messages, only one member's when named. */
async function purge(context: BotContext, channelId: string, count: number, onlyUser: string) {
  const page = await context.rest.get(`/channels/${channelId}/messages`, { query: { limit: 100 } });
  if (!page.ok) return 'Discord did not let the bot read this channel.';
  const young = context.now() - PURGE_AGE_MS;
  const ids = (Array.isArray(page.json) ? page.json.map(recordOf) : [])
    .filter((message) => !message.pinned && (!onlyUser || recordOf(message.author).id === onlyUser))
    .filter((message) => Date.parse(String(message.timestamp)) > young)
    .slice(0, count)
    .map((message) => String(message.id));
  if (!ids.length) return 'No messages younger than two weeks to delete.';
  const done =
    ids.length === 1
      ? await context.rest.del(`/channels/${channelId}/messages/${ids[0]}`)
      : await context.rest.post(`/channels/${channelId}/messages/bulk-delete`, { messages: ids });
  if (!done.ok) return 'The bot lacks Manage Messages here.';
  return `Deleted ${ids.length} message${ids.length === 1 ? '' : 's'}.`;
}

async function onCommand(context: BotContext, interaction: Interaction, config: Settings) {
  const guildId = String(interaction.guild_id ?? '');
  const snapshot = await context.snapshot(guildId);
  const asker = askerOf(interaction, snapshot?.ownerId ?? '');
  const name = String(interaction.data?.name ?? '');
  const reason = String(optionOf(interaction, 'reason') ?? '');
  const channelId = String(interaction.channel_id ?? '');
  if (isAction(name)) {
    const unbanning = name === 'unban';
    const userId = String(optionOf(interaction, unbanning ? 'user' : 'member') ?? '').trim();
    return deferred(context, interaction, async () => {
      const done = await actFor(context, guildId, asker, config, {
        action: name,
        userId,
        userName: unbanning ? userId : nameOf(interaction, userId),
        reason: name === 'note' ? String(optionOf(interaction, 'note') ?? '') : reason,
        duration: unbanning ? '' : String(optionOf(interaction, 'duration') ?? ''),
        deleteS: Number(optionOf(interaction, 'delete') ?? 0),
      });
      return { content: done.message };
    });
  }
  switch (name) {
    case 'cases': {
      // a server may let anyone use the command in its own settings; a member's record is still a moderator's to read
      if (!may(asker, PERMISSION.MODERATE_MEMBERS)) return privateReply(LACKING);
      const userId = String(optionOf(interaction, 'member') ?? '');
      const rows = await casesOf(context, guildId, userId);
      const who = escapeText(nameOf(interaction, userId));
      if (!rows.length) return privateReply(`${who} has no cases.`);
      return privateReply(`Cases for ${who}:\n${rows.map(caseLine).join('\n')}`.slice(0, 1900));
    }
    case 'unwarn': {
      if (!may(asker, PERMISSION.MODERATE_MEMBERS)) return privateReply(LACKING);
      return privateReply((await unwarn(context, guildId, Number(optionOf(interaction, 'case')))).message);
    }
    case 'purge': {
      if (!may(asker, PERMISSION.MANAGE_MESSAGES)) return privateReply(LACKING);
      const count = Math.max(1, Math.min(PURGE_MAX, Number(optionOf(interaction, 'count')) || 1));
      const onlyUser = String(optionOf(interaction, 'member') ?? '');
      return deferred(context, interaction, async () => ({
        content: await purge(context, channelId, count, onlyUser),
      }));
    }
    case 'slowmode': {
      if (!may(asker, PERMISSION.MANAGE_CHANNELS)) return privateReply(LACKING);
      const seconds = Math.max(0, Math.min(SLOWMODE_MAX_S, Number(optionOf(interaction, 'seconds')) || 0));
      const path = `/channels/${channelId}`;
      const done = await context.rest.patch(path, { rate_limit_per_user: seconds }, { reason: `By ${asker.name}` });
      if (!done.ok) return privateReply('The bot lacks Manage Channels here.');
      return privateReply(seconds ? `Slow mode is ${durationWords(seconds)}.` : 'Slow mode is off.');
    }
    case 'lock':
    case 'unlock': {
      if (!may(asker, PERMISSION.MANAGE_CHANNELS)) return privateReply(LACKING);
      return deferred(context, interaction, async () => ({
        content: await setLock(context, guildId, channelId, name === 'lock', reason),
      }));
    }
    default:
      return privateReply('That is not a moderation command.');
  }
}

/** Lift the temporary bans whose time is up, a bounded number a tick. */
async function minute(context: BotContext): Promise<void> {
  const nowS = Math.floor(context.now() / 1000);
  await context.database
    .prepare('DELETE FROM bot_ban_asks WHERE at < ?')
    .bind(nowS - OWN_BAN_S)
    .run();
  const due = await context.database
    .prepare(
      "SELECT guild_id, case_no, user_id, user_name FROM mod_cases WHERE expires_at > 0 AND expires_at <= ? AND active = 1 AND action = 'ban' ORDER BY expires_at LIMIT ?",
    )
    .bind(nowS, UNBANS_A_TICK)
    .all<Settings>();
  for (const row of due.results ?? []) {
    const guildId = String(row.guild_id);
    const found = await context.config(guildId, 'moderation');
    const userId = String(row.user_id);
    const lifted = await askBanChange(context, guildId, userId, 'unban', () =>
      context.rest.del(`/guilds/${guildId}/bans/${userId}`, { reason: `Case ${String(row.case_no)} ended` }),
    );
    // An unknown ban was lifted by hand already. A refusal (the bot lost Ban Members, or left the server) is tried
    // again in an hour, so it never holds the head of the line for every other server; anything else, next tick.
    if (!lifted.ok && lifted.status === 403) {
      await context.database
        .prepare('UPDATE mod_cases SET expires_at = ? WHERE guild_id = ? AND case_no = ?')
        .bind(nowS + UNBAN_RETRY_S, guildId, row.case_no)
        .run();
      continue;
    }
    if (!lifted.ok && lifted.status !== 404) continue;
    await context.database
      .prepare('UPDATE mod_cases SET active = 0 WHERE guild_id = ? AND case_no = ?')
      .bind(guildId, row.case_no)
      .run();
    const act: Act = {
      action: 'unban',
      guildId,
      user: { id: userId, name: String(row.user_name) },
      mod: { id: 'bot', name: BOT_NAME },
      reason: `The ban in case ${String(row.case_no)} ended`,
      config: found?.config ?? {},
    };
    const caseNo = await recordCase(context, act, nowS);
    await postTo(context.rest, String(act.config.logChannel ?? ''), { embeds: [caseCard(act, caseNo, context.now())] });
  }
}

/**
 * Discord's word of a ban or an unban, whoever made it. One made by hand ends the member's ban cases, as the bot's own
 * do in `moderate`, so the clock never lifts a ban it did not set. Word of the bot's own change can come after the
 * bot has opened another case (an unban, then a ban for a day), so it is told apart and changes nothing.
 */
const onBanChange =
  (change: BanChange): EventHandler =>
  async (context, data) => {
    const [guildId, userId] = [String(data.guild_id), String(recordOf(data.user).id)];
    if (!(await takeOwnBanChange(context, guildId, userId, change))) await endBanCases(context, guildId, userId);
  };
const events: Readonly<Record<string, EventHandler>> = {
  GUILD_BAN_ADD: onBanChange('ban'),
  GUILD_BAN_REMOVE: onBanChange('unban'),
};

const CASES_PAGE = 50;

const views: Readonly<Record<string, ViewReader>> = {
  async cases(context, guildId, query) {
    const before = Number(query.get('before')) || 0;
    const user = query.get('user') ?? '';
    const filters = ['guild_id = ?'];
    const binds: (string | number)[] = [guildId];
    if (/^\d{17,20}$/.test(user)) {
      filters.push('user_id = ?');
      binds.push(user);
    }
    if (before > 0) {
      filters.push('case_no < ?');
      binds.push(before);
    }
    const page = await context.database
      .prepare(`SELECT * FROM mod_cases WHERE ${filters.join(' AND ')} ORDER BY case_no DESC LIMIT ${CASES_PAGE}`)
      .bind(...binds)
      .all<Settings>();
    const rows = (page.results ?? []).map((row) => ({
      caseNo: Number(row.case_no),
      action: `${titleOf(row.action)}${row.active || row.action !== 'warn' ? '' : ' (removed)'}`,
      user: `${String(row.user_name)} (${String(row.user_id)})`,
      mod: String(row.mod_name),
      reason: String(row.reason),
      when: Number(row.created_at),
    }));
    const last = rows.at(-1);
    return { rows, next: rows.length === CASES_PAGE && last ? `before=${last.caseNo}` : '' };
  },
  async bans(context, guildId) {
    const answer = await context.rest.get(`/guilds/${guildId}/bans`, { query: { limit: 100 } });
    if (!answer.ok) return { rows: [], next: '', note: 'The bot lacks Ban Members, or Discord did not answer.' };
    const bans = Array.isArray(answer.json) ? answer.json.map(recordOf) : [];
    return {
      rows: bans.map((ban) => {
        const user = recordOf(ban.user);
        return {
          user: `${String(user.global_name || user.username || '')} (${String(user.id)})`,
          reason: String(ban.reason ?? ''),
        };
      }),
      next: '',
    };
  },
};

/** A panel act on a member: checked against the actor's own Discord permissions, as a command is. */
const memberAct =
  (action: Action): ActionRunner =>
  async (context, guildId, input, actor, config) => {
    const found = await context.rest.get(`/users/${String(input.user)}`);
    const user = found.ok ? recordOf(found.json) : {};
    return actFor(context, guildId, actor, config, {
      action,
      userId: String(input.user),
      userName: String(user.global_name || user.username || input.user),
      reason: String(input.reason ?? ''),
      duration: String(input.duration ?? ''),
    });
  };

const actions: Readonly<Record<string, ActionRunner>> = {
  warn: memberAct('warn'),
  timeout: memberAct('timeout'),
  untimeout: memberAct('untimeout'),
  kick: memberAct('kick'),
  ban: memberAct('ban'),
  unban: memberAct('unban'),
  note: memberAct('note'),
  unwarn: (context, guildId, input) => unwarn(context, guildId, Number(input.caseNo)),
};

export const moderationModule: ServerModule = {
  id: 'moderation',
  commands: MODERATION_COMMANDS,
  command: onCommand,
  events,
  minute,
  views,
  actions,
};
