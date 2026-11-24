// Role menus: members pick their own roles with buttons, a list or reactions. Publishing posts the menu, or edits the
// message it posted before. Every role the bot gives or takes here is one the menu offers, nothing else.

import { DEFAULT_COLOUR, type Emoji, colorNumber, emojiOf, escapeText } from '../law/message.ts';
import { type Settings, recordOf } from '../law/settings.ts';
import {
  BOT_PREFIX,
  type BotContext,
  type Interaction,
  type InteractionReply,
  botUserId,
  deferred,
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

type How = 'press' | 'pick';

/**
 * What one member's choice within a menu would change: `chosen` the roles they want of it. A press toggles one role;
 * a pick sets the menu's roles to the list.
 */
export function planChoice(has: readonly string[], menu: Menu, chosen: readonly string[], how: How) {
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
  return { give, take };
}

/** What Discord did with a choice: the roles it gave and took, the ones it would not, and whether it was down. */
export interface Change {
  readonly given: readonly string[];
  readonly taken: readonly string[];
  readonly notGiven: readonly string[];
  readonly notTaken: readonly string[];
  readonly down: boolean;
}

/** Change one member's roles within a menu as `planChoice` says. Answers what Discord took of it. */
export async function applyChoice(
  context: BotContext,
  guildId: string,
  userId: string,
  has: readonly string[],
  menu: Menu,
  chosen: readonly string[],
  how: How,
): Promise<Change> {
  const { give, take } = planChoice(has, menu, chosen, how);
  const reason = `Role menu ${menu.name}`;
  const path = (role: string) => `/guilds/${guildId}/members/${userId}/roles/${role}`;
  const change = { given: [] as string[], taken: [] as string[], notGiven: [] as string[], notTaken: [] as string[] };
  let down = false;
  for (const role of give) {
    const done = await context.rest.put(path(role), undefined, { reason });
    (done.ok ? change.given : change.notGiven).push(role);
    down ||= !done.ok && done.down;
  }
  for (const role of take) {
    const done = await context.rest.del(path(role), { reason });
    (done.ok ? change.taken : change.notTaken).push(role);
    down ||= !done.ok && done.down;
  }
  return { ...change, down };
}

const mentions = (roles: readonly string[]) => roles.map((role) => `<@&${role}>`).join(' ');

const changeWords = (change: Change) => {
  const parts = [];
  if (change.given.length) parts.push(`Given: ${mentions(change.given)}.`);
  if (change.taken.length) parts.push(`Taken: ${mentions(change.taken)}.`);
  if (change.notGiven.length) parts.push(`Not given: ${mentions(change.notGiven)}.`);
  if (change.notTaken.length) parts.push(`Not taken: ${mentions(change.notTaken)}.`);
  if (change.notGiven.length || change.notTaken.length)
    parts.push(change.down ? 'Try again in a minute.' : 'The bot needs Manage Roles, and its own role above those.');
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

/**
 * A button pressed or a list picked. Each role is one call to Discord, and a rate limit can hold one for seconds, so
 * any change is answered later; a choice that changes nothing is answered at once.
 */
async function onComponent(
  context: BotContext,
  interaction: Interaction,
  words: readonly string[],
  config: Settings,
): Promise<InteractionReply> {
  const menu = menusOf(config).find((candidate) => candidate.name === words[0]);
  if (!menu) return privateReply('This menu is no longer offered.');
  const guildId = String(interaction.guild_id);
  const userId = String(interaction.member?.user?.id ?? '');
  const has = (interaction.member?.roles ?? []).map(String);
  const how: How = words[1] ? 'press' : 'pick';
  const chosen = words[1] ? [words[1]] : (interaction.data?.values ?? []).map(String);
  const plan = planChoice(has, menu, chosen, how);
  if (!plan.give.length && !plan.take.length) return privateReply('Nothing changed.');
  return deferred(context, interaction, async () => ({
    content: changeWords(await applyChoice(context, guildId, userId, has, menu, chosen, how)),
  }));
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
