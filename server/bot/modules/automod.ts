// Auto-mod. Two layers. Discord's own AutoMod blocks words, spam and mass mentions before anyone sees them; the bot
// keeps its rules (their names start with RULE_PREFIX) in step with the settings each time they are saved, and leaves
// rules made by hand alone. The bot's own filters read each message on the Gateway for what AutoMod cannot: invites,
// links, capitals, emoji, floods and repeats. A warning or a time-out is a moderation case like any other.

import { escapeText } from '../law/message.ts';
import { PERMISSION, basePermissions } from '../law/access.ts';
import { recordOf, type Settings } from '../law/settings.ts';
import { type BotContext, botUserId, embed, postTo } from '../kit.ts';
import type { EventHandler, ServerModule } from './module.ts';
import { idsOf, moderate } from './moderationCases.ts';

export const RULE_PREFIX = 'No Shores: ';
const TRIGGER = Object.freeze({ KEYWORD: 1, SPAM: 3, PRESET: 4, MENTIONS: 5 });
const RESPONSE = Object.freeze({ BLOCK: 1, ALERT: 2, TIMEOUT: 3 });
/** How far back the flood and repeat filters look, at most. */
export const WINDOW_MS = 60_000;
export const REPEAT_COUNT = 3;
export const REPEAT_MS = 30_000;
/** A message must be this long before its capitals count. */
export const CAPS_MIN_LETTERS = 12;
/** The recent messages held for each member, newest last. */
const SEEN_KEPT = 40;

const INVITE = /(?:discord(?:app)?\.com\/invite|discord\.gg)\/[\w-]+/i;
const LINK = /https?:\/\/([^\s/<>]+)/gi;
const EMOJI = /<a?:\w+:\d+>|\p{Extended_Pictographic}/gu;

/** One of a member's recent messages, as the flood and repeat filters read it. */
export interface Seen {
  readonly at: number;
  readonly words: string;
}

/** The AutoMod rules the settings ask for, by name. A rule not asked for is absent, so saving removes it. */
export function wantedRules(config: Settings, enabled: boolean): Map<string, Settings> {
  const rules = new Map<string, Settings>();
  if (!enabled) return rules;
  const exempt = {
    exempt_roles: idsOf(config.exemptRoles).filter(Boolean).slice(0, 20),
    exempt_channels: idsOf(config.exemptChannels).filter(Boolean).slice(0, 50),
  };
  const alert = config.alertChannel
    ? [{ type: RESPONSE.ALERT, metadata: { channel_id: String(config.alertChannel) } }]
    : [];
  const block = {
    type: RESPONSE.BLOCK,
    metadata: { custom_message: "This message was blocked by the server's auto-mod." },
  };
  const minutes = Number(config.timeoutMinutes ?? 10);
  const timeout = { type: RESPONSE.TIMEOUT, metadata: { duration_seconds: minutes * 60 } };
  const add = (name: string, trigger: number, metadata: Settings, actions: readonly object[]) =>
    rules.set(`${RULE_PREFIX}${name}`, {
      name: `${RULE_PREFIX}${name}`,
      event_type: 1,
      trigger_type: trigger,
      trigger_metadata: metadata,
      actions,
      enabled: true,
      ...exempt,
    });
  const words = idsOf(config.words)
    .map((word) => word.trim())
    .filter(Boolean);
  if (words.length) add('Blocked words', TRIGGER.KEYWORD, { keyword_filter: words }, [block, ...alert]);
  const presets = [config.profanity && 1, config.sexual && 2, config.slurs && 3].filter(Boolean);
  if (presets.length) add('Word lists', TRIGGER.PRESET, { presets }, [block, ...alert]);
  const mentionLimit = Number(config.mentionLimit) || 0;
  if (mentionLimit > 0) {
    const metadata = { mention_total_limit: mentionLimit, mention_raid_protection_enabled: true };
    add('Mentions', TRIGGER.MENTIONS, metadata, [block, ...alert, timeout]);
  }
  if (config.spam) add('Spam', TRIGGER.SPAM, {}, [block, ...alert]);
  return rules;
}

/** Bring the server's own rules of the bot's in step with the settings: made, changed or deleted. Says what it did. */
export async function syncRules(
  context: BotContext,
  guildId: string,
  config: Settings,
  enabled: boolean,
): Promise<string> {
  const path = `/guilds/${guildId}/auto-moderation/rules`;
  const existing = await context.rest.get(path);
  if (!existing.ok) return "Discord's AutoMod was not updated: the bot needs Manage Server.";
  const ours = new Map(
    (Array.isArray(existing.json) ? existing.json.map(recordOf) : [])
      .filter((rule) => String(rule.name).startsWith(RULE_PREFIX))
      .map((rule) => [String(rule.name), String(rule.id)]),
  );
  const wanted = wantedRules(config, enabled);
  const reason = 'Auto-mod settings saved';
  const problems: string[] = [];
  for (const [name, rule] of wanted) {
    const id = ours.get(name);
    const done = id
      ? await context.rest.patch(`${path}/${id}`, rule, { reason })
      : await context.rest.post(path, rule, { reason });
    if (!done.ok) problems.push(`${name.slice(RULE_PREFIX.length)}: ${done.message}`);
  }
  for (const [name, id] of ours) if (!wanted.has(name)) await context.rest.del(`${path}/${id}`, { reason });
  if (problems.length) return `Some AutoMod rules were refused: ${problems.join('; ')}`;
  if (!wanted.size) return "Discord's AutoMod has none of the bot's rules.";
  return `Discord's AutoMod has ${wanted.size} of the bot's rules.`;
}

const allowedHost = (host: string, allowed: readonly string[]) =>
  allowed.some((site) => host === site || host.endsWith(`.${site}`));
const isOn = (config: Settings, filter: string) => (config[filter] ?? 'off') !== 'off';

/** What a message breaks, first match, or null. Flood and repeats read the member's recent messages from `seen`. */
export function breaks(
  config: Settings,
  content: string,
  seen: readonly Seen[],
  now: number,
): { filter: string; why: string } | null {
  if (isOn(config, 'invites') && INVITE.test(content)) return { filter: 'invites', why: 'an invite link' };
  if (isOn(config, 'links')) {
    const allowed = idsOf(config.allowedSites).map((site) => site.toLowerCase());
    for (const match of content.matchAll(LINK)) {
      const host = (match[1] ?? '').toLowerCase().replace(/:\d+$/, '');
      if (!allowedHost(host, allowed)) return { filter: 'links', why: `a link to ${host}` };
    }
  }
  if (isOn(config, 'caps')) {
    const letters = content.replace(/[^\p{L}]/gu, '');
    const upper = letters.replace(/[^\p{Lu}]/gu, '').length;
    if (letters.length >= CAPS_MIN_LETTERS && (upper * 100) / letters.length >= Number(config.capsPercent))
      return { filter: 'caps', why: 'too many capitals' };
  }
  if (isOn(config, 'emoji') && (content.match(EMOJI) ?? []).length >= Number(config.emojiMax))
    return { filter: 'emoji', why: 'too many emoji' };
  const floodMs = Number(config.floodSeconds) * 1000;
  if (isOn(config, 'flood') && seen.filter((entry) => now - entry.at <= floodMs).length >= Number(config.floodCount))
    return { filter: 'flood', why: 'too many messages too fast' };
  const words = content.trim().toLowerCase();
  const repeated = seen.filter((entry) => now - entry.at <= REPEAT_MS && entry.words === words).length;
  if (isOn(config, 'repeats') && words && repeated >= REPEAT_COUNT)
    return { filter: 'repeats', why: 'the same message again' };
  return null;
}

const events: Readonly<Record<string, EventHandler>> = {
  async MESSAGE_CREATE(context, data, config) {
    const author = recordOf(data.author);
    if (!data.guild_id || author.bot || data.webhook_id || !data.member) return;
    const guildId = String(data.guild_id);
    const channelId = String(data.channel_id);
    const roles = idsOf(recordOf(data.member).roles);
    const exemptRoles = idsOf(config.exemptRoles);
    if (idsOf(config.exemptChannels).includes(channelId) || roles.some((id) => exemptRoles.includes(id))) return;
    const snapshot = await context.snapshot(guildId);
    if (!snapshot) return;
    const userId = String(author.id);
    const server = { id: guildId, owner_id: snapshot.ownerId, roles: snapshot.roles };
    if ((basePermissions(server, { user_id: userId, roles }) & PERMISSION.MANAGE_MESSAGES) !== 0n) return;
    // Each member's recent messages, held in the Gateway object's memory: a flood is a matter of seconds.
    const memory = context.memory ?? new Map<string, unknown>();
    const key = `automod:${guildId}:${userId}`;
    const now = context.now();
    const held = memory.get(key);
    const seen = (Array.isArray(held) ? (held as Seen[]) : []).filter((entry) => now - entry.at <= WINDOW_MS);
    const content = String(data.content ?? '');
    const broken = breaks(config, content, seen, now);
    seen.push({ at: now, words: content.trim().toLowerCase() });
    memory.set(key, seen.slice(-SEEN_KEPT));
    if (!broken) return;
    const response = config[broken.filter];
    const reason = `Auto-mod: ${broken.why}`;
    await context.rest.del(`/channels/${channelId}/messages/${String(data.id)}`, { reason });
    const name = String(author.global_name || author.username || userId);
    if (response === 'warn' || response === 'timeout') {
      const moderation = await context.config(guildId, 'moderation');
      const botId = await botUserId(context.rest, String(context.vars.DISCORD_BOT_TOKEN ?? ''));
      await moderate(context, {
        action: response,
        guildId,
        user: { id: userId, name },
        mod: { id: botId || 'bot', name: 'Auto-mod' },
        reason,
        durationS: response === 'timeout' ? Number(config.timeoutMinutes) * 60 : 0,
        config: moderation?.config ?? {},
      });
    }
    await postTo(context.rest, String(config.alertChannel ?? ''), {
      embeds: [
        embed({
          title: 'Auto-mod',
          color: 0xd9a33c,
          description: `Deleted a message by ${escapeText(name)} (${userId}) in <#${channelId}>: ${broken.why}.`,
          fields: [{ name: 'Words', value: escapeText(content).slice(0, 1000) || '*(no words)*' }],
          timestamp: now,
        }),
      ],
    });
  },
};

export const automodModule: ServerModule = {
  id: 'automod',
  events,
  saved: (context, guildId, config, enabled) => syncRules(context, guildId, config, enabled),
};
