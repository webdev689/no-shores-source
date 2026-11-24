// Role menus: members pick their own roles with buttons, a list or reactions. Publishing posts the menu, or edits the
// message it posted before. Every role the bot gives or takes here is one the menu offers, nothing else.

import { DEFAULT_COLOUR, type Emoji, colorNumber, emojiOf, escapeText } from '../law/message.ts';
import { type Settings, recordOf } from '../law/settings.ts';
import {
  BOT_PREFIX,
  type BotContext,
  EPHEMERAL,
  type Interaction,
  NO_PINGS,
  REPLY,
  botUserId,
  embed,
  postTo,
  privateReply,
} from '../kit.ts';
import type { EventData, ServerModule } from './module.ts';

type MenuOption = { readonly role: string; readonly label: string; readonly emoji: string };
export type Menu = {
  readonly name: string;
  readonly channel: string;
  readonly title: string;
  readonly description: string;
  readonly style: 'buttons' | 'select' | 'reactions';
  readonly mode: 'toggle' | 'unique' | 'keep';
  readonly options: readonly MenuOption[];
};

/** The emoji as a reaction's address takes it. */
const reactionKey = (emoji: Emoji) => encodeURIComponent(emoji.id ? `${emoji.name}:${emoji.id}` : emoji.name);
/** Whether a reaction is this option's. */
const sameEmoji = (reacted: Settings, text: string) => {
  const want = emojiOf(text);
  return !!want && (want.id ? String(reacted.id) === want.id : reacted.name === want.name);
};
const menusOf = (config: Settings) => (config.menus ?? []) as Menu[];
const offeredOf = (menu: Menu) => menu.options.filter((option) => option.role);

/** The message a menu is posted as. */
export function menuMessage(menu: Menu, roleNames: ReadonlyMap<string, string>, accent: string) {
  const options = offeredOf(menu);
  const labelOf = (option: MenuOption) => (option.label || roleNames.get(option.role) || 'Role').slice(0, 80);
  const emojiPart = (option: MenuOption) => {
    const emoji = emojiOf(option.emoji);
    return emoji ? { emoji } : {};
  };
  const reactions = menu.style === 'reactions';
  const lines = reactions
    ? [menu.description, ...options.map((option) => `${option.emoji} ${escapeText(labelOf(option))}`)]
    : [menu.description];
  const card = embed({
    title: menu.title,
    description: lines.filter(Boolean).join('\n'),
    color: colorNumber(accent),
  });
  if (reactions) return { embeds: [card], components: [] };
  if (menu.style === 'select') {
    const list = {
      type: 3,
      custom_id: `${BOT_PREFIX}rolemenus:${menu.name}`,
      placeholder: 'Choose your roles',
      min_values: 0,
      max_values: menu.mode === 'unique' ? 1 : Math.max(1, options.length),
      options: options.map((option) => ({ value: option.role, label: labelOf(option), ...emojiPart(option) })),
    };
    return { embeds: [card], components: [{ type: 1, components: [list] }] };
  }
  const buttons = options.map((option) => ({
    type: 2,
    style: 2,
    custom_id: `${BOT_PREFIX}rolemenus:${menu.name}:${option.role}`,
    label: labelOf(option),
    ...emojiPart(option),
  }));
  const rows = [];
  for (let start = 0; start < buttons.length; start += 5)
    rows.push({ type: 1, components: buttons.slice(start, start + 5) });
  return { embeds: [card], components: rows };
}

/**
 * Change one member's roles within a menu: `chosen` the roles they want of it. A press toggles one role; a pick sets
 * the menu's roles to the list. Answers what changed.
 */
export async function applyChoice(
  context: BotContext,
  guildId: string,
  userId: string,
  has: readonly string[],
  menu: Menu,
  chosen: readonly string[],
  how: 'press' | 'pick',
) {
  const offered = offeredOf(menu).map((option) => option.role);
  const valid = chosen.filter((role) => offered.includes(role));
  let give: string[] = [];
  let take: string[] = [];
  if (how === 'press') {
    const role = valid[0];
    if (!role) return { give, take };
    if (has.includes(role)) take = menu.mode === 'keep' ? [] : [role];
    else give = [role];
    if (give.length && menu.mode === 'unique') take = offered.filter((other) => other !== role && has.includes(other));
  } else {
    give = valid.filter((role) => !has.includes(role));
    take = menu.mode === 'keep' ? [] : offered.filter((role) => has.includes(role) && !valid.includes(role));
  }
  const reason = `Role menu ${menu.name}`;
  for (const role of give)
    await context.rest.put(`/guilds/${guildId}/members/${userId}/roles/${role}`, undefined, { reason });
  for (const role of take) await context.rest.del(`/guilds/${guildId}/members/${userId}/roles/${role}`, { reason });
  return { give, take };
}

const changeWords = (change: { give: readonly string[]; take: readonly string[] }) => {
  const parts = [];
  if (change.give.length) parts.push(`Given: ${change.give.map((role) => `<@&${role}>`).join(' ')}.`);
  if (change.take.length) parts.push(`Taken: ${change.take.map((role) => `<@&${role}>`).join(' ')}.`);
  return parts.join(' ') || 'Nothing changed.';
};

async function onReaction(context: BotContext, data: EventData, config: Settings, added: boolean) {
  const guildId = String(data.guild_id);
  const post = await context.database
    .prepare('SELECT name FROM rolemenu_posts WHERE message_id = ? AND guild_id = ?')
    .bind(String(data.message_id), guildId)
    .first<{ name: string }>();
  if (!post) return;
  const userId = String(data.user_id);
  if (userId === (await botUserId(context.rest, String(context.vars.DISCORD_BOT_TOKEN ?? '')))) return;
  const menu = menusOf(config).find((candidate) => candidate.name === post.name);
  const option = menu?.options.find((candidate) => candidate.role && sameEmoji(recordOf(data.emoji), candidate.emoji));
  if (!menu || !option) return;
  const member = await context.rest.get(`/guilds/${guildId}/members/${userId}`);
  const has = member.ok ? ((recordOf(member.json).roles ?? []) as unknown[]).map(String) : [];
  const holds = has.includes(option.role);
  if (added ? !holds : holds && menu.mode !== 'keep')
    await applyChoice(context, guildId, userId, has, menu, [option.role], 'press');
}

const events: ServerModule['events'] = {
  MESSAGE_REACTION_ADD: (context, data, config) => onReaction(context, data, config, true),
  MESSAGE_REACTION_REMOVE: (context, data, config) => onReaction(context, data, config, false),
};

/** A button pressed or a list picked. */
async function onComponent(context: BotContext, interaction: Interaction, words: readonly string[], config: Settings) {
  const menu = menusOf(config).find((candidate) => candidate.name === words[0]);
  if (!menu) return privateReply('This menu is no longer offered.');
  const guildId = String(interaction.guild_id);
  const userId = String(interaction.member?.user?.id ?? '');
  const has = (interaction.member?.roles ?? []).map(String);
  const change = words[1]
    ? await applyChoice(context, guildId, userId, has, menu, [words[1]], 'press')
    : await applyChoice(context, guildId, userId, has, menu, (interaction.data?.values ?? []).map(String), 'pick');
  return { type: REPLY.MESSAGE, data: { content: changeWords(change), flags: EPHEMERAL, allowed_mentions: NO_PINGS } };
}

/** Post a menu, or edit the message it was posted as. */
async function publish(context: BotContext, guildId: string, input: Settings, config: Settings) {
  const menu = menusOf(config).find((candidate) => candidate.name === input.name);
  if (!menu) return { ok: false, message: `There is no menu named ${String(input.name)}. Save it first.` };
  if (!menu.channel) return { ok: false, message: "Choose the menu's channel first." };
  if (!offeredOf(menu).length) return { ok: false, message: 'Add at least one role first.' };
  if (menu.style === 'reactions' && offeredOf(menu).some((option) => !emojiOf(option.emoji)))
    return { ok: false, message: 'Every role needs an emoji in a reactions menu.' };
  const snapshot = await context.snapshot(guildId);
  const core = await context.config(guildId, 'core');
  const roleNames = new Map((snapshot?.roles ?? []).map((role) => [role.id, role.name]));
  const message = menuMessage(menu, roleNames, String(core?.config.accent ?? DEFAULT_COLOUR));
  const before = await context.database
    .prepare('SELECT channel_id, message_id FROM rolemenu_posts WHERE guild_id = ? AND name = ?')
    .bind(guildId, menu.name)
    .first<{ channel_id: string; message_id: string }>();
  let messageId = '';
  if (before?.channel_id === menu.channel) {
    const edited = await context.rest.patch(`/channels/${menu.channel}/messages/${before.message_id}`, message);
    if (edited.ok) messageId = String(before.message_id);
  }
  if (!messageId) {
    const posted = await postTo(context.rest, menu.channel, message);
    if (!posted) return { ok: false, message: 'The bot could not post in that channel.' };
    messageId = String(posted.id);
  }
  await context.database
    .prepare('INSERT OR REPLACE INTO rolemenu_posts (guild_id, name, channel_id, message_id) VALUES (?, ?, ?, ?)')
    .bind(guildId, menu.name, menu.channel, messageId)
    .run();
  if (menu.style === 'reactions')
    for (const option of offeredOf(menu)) {
      const emoji = emojiOf(option.emoji);
      if (emoji)
        await context.rest.put(
          `/channels/${menu.channel}/messages/${messageId}/reactions/${reactionKey(emoji)}/@me`,
          undefined,
        );
    }
  return { ok: true, message: before ? 'The menu was updated.' : 'The menu was posted.' };
}

export const roleMenusModule: ServerModule = {
  id: 'rolemenus',
  events,
  component: onComponent,
  actions: { publish: (context, guildId, input, _actor, config) => publish(context, guildId, input, config) },
};
