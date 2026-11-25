// The layout's first half: what Discord says the server holds now, and its roles and channels, each made once. A part
// is known by its key in `layout_parts` from the first build on: one renamed by hand is still the layout's, one
// deleted by hand is left out, and one already there by the layout's name when the layout first met it is adopted
// and left as its maker set it. Only a part the layout made gets the layout's details, and only as it is made.

import { PERMISSION, type PermissionName, basePermissions } from '../law/access.ts';
import { type Settings, recordOf } from '../law/settings.ts';
import { type BotContext, botUserId } from '../kit.ts';
import type { RestResult } from '../rest.ts';
import { CHANNELS, CHANNEL_TYPE, type LayoutChannel, type Overwrite, ROLES } from './noShores.ts';
import type { Ids } from './messages.ts';

/** What the panel's plan table shows for each part. */
export interface Row {
  readonly part: string;
  readonly name: string;
  readonly state: string;
}

/** One build or plan as it goes: what Discord holds, what the layout knows, and what it has said. */
export interface Walk {
  readonly context: BotContext;
  readonly guildId: string;
  /** False for the plan: nothing is changed, and each row says what a build would do. */
  readonly act: boolean;
  readonly guild: Settings;
  roles: Settings[];
  channels: Settings[];
  readonly botId: string;
  readonly botPermissions: bigint;
  /** The position of the bot's highest role: it gives only roles below it. */
  readonly botTop: number;
  readonly community: boolean;
  readonly records: Map<string, { readonly id: string; readonly made: boolean }>;
  readonly ids: Map<string, string>;
  readonly rows: Row[];
  /** Permissions the layout would set but the bot does not hold, by name. */
  readonly lacking: Set<PermissionName>;
  /** Parts Discord refused, with its words. */
  readonly refused: string[];
  readonly made: { roles: number; channels: number };
}

export const REASON = 'The No Shores layout';
/** Discord's feature names this build reads. */
const COMMUNITY = 'COMMUNITY';

/** The ids of the parts the walk has found or made so far, by their keys. */
export const idsOf = (walk: Walk): Ids => ({
  channel: (key) => walk.ids.get(`channel:${key}`) ?? '',
  role: (key) => walk.ids.get(`role:${key}`) ?? '',
});

/** What Discord holds of the server, and what the layout has made there before; null when Discord will not say. */
export async function look(context: BotContext, guildId: string, act: boolean): Promise<Walk | string> {
  const { rest } = context;
  const guildAnswer = await rest.get(`/guilds/${guildId}`);
  if (!guildAnswer.ok) return 'Discord did not say what the server holds. Try again in a minute.';
  const guild = recordOf(guildAnswer.json);
  const channelsAnswer = await rest.get(`/guilds/${guildId}/channels`);
  if (!channelsAnswer.ok) return "Discord did not list the server's channels. Try again in a minute.";
  const botId = await botUserId(rest, String(context.vars.DISCORD_BOT_TOKEN ?? ''));
  const memberAnswer = botId ? await rest.get(`/guilds/${guildId}/members/${botId}`) : null;
  if (!memberAnswer?.ok) return 'Discord did not say what the bot may do here. Try again in a minute.';
  const roles = (Array.isArray(guild.roles) ? guild.roles : []).map(recordOf);
  const held = (Array.isArray(recordOf(memberAnswer.json).roles) ? recordOf(memberAnswer.json).roles : []) as unknown[];
  const botRoles = held.map(String);
  const botPermissions = basePermissions(
    {
      id: guildId,
      owner_id: String(guild.owner_id ?? ''),
      roles: roles.map((role) => ({ id: String(role.id), permissions: String(role.permissions ?? '0') })),
    },
    { user_id: botId, roles: botRoles },
  );
  const botTop = Math.max(
    0,
    ...roles.filter((role) => botRoles.includes(String(role.id))).map((role) => Number(role.position) || 0),
  );
  const kept = await context.database
    .prepare('SELECT part, discord_id, made FROM layout_parts WHERE guild_id = ?')
    .bind(guildId)
    .all<{ part: string; discord_id: string; made: number }>();
  const records = new Map(kept.results.map((row) => [row.part, { id: row.discord_id, made: row.made === 1 }]));
  const features = Array.isArray(guild.features) ? guild.features.map(String) : [];
  return {
    context,
    guildId,
    act,
    guild,
    roles,
    channels: (Array.isArray(channelsAnswer.json) ? channelsAnswer.json : []).map(recordOf),
    botId,
    botPermissions,
    botTop,
    community: features.includes(COMMUNITY),
    records,
    ids: new Map(),
    rows: [],
    lacking: new Set(),
    refused: [],
    made: { roles: 0, channels: 0 },
  };
}

/** Remember a part the layout made or adopted. */
export async function record(walk: Walk, part: string, id: string, made: boolean): Promise<void> {
  walk.records.set(part, { id, made });
  await walk.context.database
    .prepare(
      `INSERT INTO layout_parts (guild_id, part, discord_id, made, at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (guild_id, part) DO UPDATE SET discord_id = excluded.discord_id, made = excluded.made`,
    )
    .bind(walk.guildId, part, id, made ? 1 : 0, Math.floor(walk.context.now() / 1000))
    .run();
}

const isAdmin = (walk: Walk) => (walk.botPermissions & PERMISSION.ADMINISTRATOR) === PERMISSION.ADMINISTRATOR;

/** The bits of `names` the bot may set; the rest are noted as lacking, for the checklist. */
function grantable(walk: Walk, names: readonly PermissionName[]): bigint {
  let bits = 0n;
  for (const name of names) {
    const bit = PERMISSION[name];
    if (isAdmin(walk) || (walk.botPermissions & bit) === bit) bits |= bit;
    else walk.lacking.add(name);
  }
  return bits;
}

/** Discord's words for a refusal. */
export const whyOf = (answer: RestResult): string =>
  answer.ok ? '' : answer.message || `Discord answered ${answer.status}`;

/** Each of the layout's roles: there, left out, adopted, or made. */
export async function walkRoles(walk: Walk): Promise<void> {
  for (const role of ROLES) {
    const part = `role:${role.key}`;
    const known = walk.records.get(part);
    if (known) {
      const there = walk.roles.some((held) => String(held.id) === known.id);
      if (there) walk.ids.set(part, known.id);
      walk.rows.push({ part: 'Role', name: role.name, state: there ? 'There' : 'Deleted by hand, left out' });
      continue;
    }
    const same = walk.roles.find((held) => held.name === role.name && !held.managed);
    if (same) {
      walk.ids.set(part, String(same.id));
      if (walk.act) await record(walk, part, String(same.id), false);
      walk.rows.push({ part: 'Role', name: role.name, state: 'There already, kept as it is' });
      continue;
    }
    const permissions = grantable(walk, role.permissions);
    if (!walk.act) {
      walk.ids.set(part, PLANNED);
      walk.rows.push({ part: 'Role', name: role.name, state: 'Will be made' });
      continue;
    }
    const made = await walk.context.rest.post(
      `/guilds/${walk.guildId}/roles`,
      { name: role.name, color: role.colour, hoist: role.hoist, mentionable: false, permissions: String(permissions) },
      { reason: REASON },
    );
    if (!made.ok) {
      walk.refused.push(`The role ${role.name}: ${whyOf(made)}`);
      walk.rows.push({ part: 'Role', name: role.name, state: `Discord refused: ${whyOf(made)}` });
      continue;
    }
    const created = recordOf(made.json);
    walk.roles.push(created);
    walk.ids.set(part, String(created.id));
    await record(walk, part, String(created.id), true);
    walk.made.roles++;
    walk.rows.push({ part: 'Role', name: role.name, state: 'Made' });
  }
}

/** A channel's overwrites: its category's, with its own laid over them, for whom each names. */
function overwritesOf(walk: Walk, channel: LayoutChannel) {
  const parent = CHANNELS.find((each) => each.key === channel.parent);
  const merged = new Map<string, Overwrite>();
  for (const overwrite of [...(parent?.overwrites ?? []), ...(channel.overwrites ?? [])])
    merged.set(overwrite.who, overwrite);
  const out: { id: string; type: number; allow: string; deny: string }[] = [];
  for (const overwrite of merged.values()) {
    const id =
      overwrite.who === 'everyone'
        ? walk.guildId
        : overwrite.who === 'bot'
          ? walk.botId
          : (walk.ids.get(`role:${overwrite.who}`) ?? '');
    if (!id) continue;
    out.push({
      id,
      type: overwrite.who === 'bot' ? 1 : 0,
      allow: String(grantable(walk, overwrite.allow ?? [])),
      deny: String(grantable(walk, overwrite.deny ?? [])),
    });
  }
  return out;
}

/** Discord's types a channel of the layout may already have: an announcement channel is a text one until Community. */
const typesOf = (channel: LayoutChannel): number[] =>
  channel.kind === 'announcement' ? [CHANNEL_TYPE.text, CHANNEL_TYPE.announcement] : [CHANNEL_TYPE[channel.kind]];

/** The body Discord makes a channel from. */
function channelBody(walk: Walk, channel: LayoutChannel): Settings {
  const type = channel.kind === 'announcement' && !walk.community ? CHANNEL_TYPE.text : CHANNEL_TYPE[channel.kind];
  const parentId = channel.parent ? walk.ids.get(`channel:${channel.parent}`) : undefined;
  return {
    name: channel.name,
    type,
    ...(parentId ? { parent_id: parentId } : {}),
    ...(channel.topic ? { topic: channel.topic } : {}),
    ...(channel.slowmode ? { rate_limit_per_user: channel.slowmode } : {}),
    permission_overwrites: overwritesOf(walk, channel),
    ...(channel.tags
      ? {
          available_tags: channel.tags.map((tag) => ({
            name: tag.name,
            moderated: !!tag.moderated,
            emoji_name: tag.emoji,
          })),
          default_sort_order: 0,
          default_forum_layout: 1,
        }
      : {}),
    ...(channel.reaction ? { default_reaction_emoji: { emoji_name: channel.reaction } } : {}),
  };
}

/** An announcement channel the layout made as a text one, before Community: made an announcement one once it is on. */
async function finishNews(walk: Walk, channel: LayoutChannel, id: string): Promise<string> {
  const held = walk.channels.find((each) => String(each.id) === id);
  if (channel.kind !== 'announcement' || Number(held?.type) !== CHANNEL_TYPE.text) return 'There';
  if (!walk.community) return 'There, as a text channel until Community is on';
  if (!walk.records.get(`channel:${channel.key}`)?.made) return 'There already, kept as it is';
  if (!walk.act) return 'Will become an announcement channel';
  const changed = await walk.context.rest.patch(
    `/channels/${id}`,
    { type: CHANNEL_TYPE.announcement },
    { reason: REASON },
  );
  if (!changed.ok) {
    walk.refused.push(`#${channel.name} as an announcement channel: ${whyOf(changed)}`);
    return `Discord refused: ${whyOf(changed)}`;
  }
  return 'Made an announcement channel';
}

/** The id a plan gives a part a build would make, so what hangs on it reads as it would be: never sent to Discord. */
export const PLANNED = '000000000000000000';

/**
 * A channel there already by a layout name, kept as it is: its words, permissions and messages. One outside its
 * layout category is moved into it, which is all Discord's own #general needs to sit where the layout puts it.
 */
async function adopt(walk: Walk, channel: LayoutChannel, held: Settings, parentId: string): Promise<string> {
  if (!channel.parent || !parentId || String(held.parent_id ?? '') === parentId) return 'There already, kept as it is';
  const into = CHANNELS.find((each) => each.key === channel.parent)?.name ?? '';
  if (!walk.act) return `There already, will be moved into ${into}`;
  const moved = await walk.context.rest.patch(
    `/channels/${String(held.id)}`,
    { parent_id: parentId },
    { reason: REASON },
  );
  if (!moved.ok) return `There already; Discord refused the move: ${whyOf(moved)}`;
  held.parent_id = parentId;
  return `There already, moved into ${into}`;
}

/** The categories a new Discord server starts with, removed once the layout has moved their channels out. */
const DISCORD_CATEGORIES = ['text channels', 'voice channels'];

/** Discord's own categories, left empty once their channels are the layout's: removed, so none sits empty. */
export async function tidyDiscordCategories(walk: Walk): Promise<void> {
  const ours = new Set(walk.ids.values());
  for (const category of [...walk.channels]) {
    const id = String(category.id);
    if (Number(category.type) !== CHANNEL_TYPE.category || ours.has(id)) continue;
    if (!DISCORD_CATEGORIES.includes(String(category.name).toLowerCase())) continue;
    const staying = walk.channels.filter((held) => String(held.parent_id ?? '') === id && !ours.has(String(held.id)));
    if (staying.length) continue;
    const name = String(category.name);
    if (!walk.act) {
      walk.rows.push({ part: 'Category', name, state: "Discord's own, empty once its channels move: will be removed" });
      continue;
    }
    const removed = await walk.context.rest.del(`/channels/${id}`, { reason: REASON });
    walk.rows.push({
      part: 'Category',
      name,
      state: removed.ok ? "Discord's own, left empty: removed" : `Kept: ${whyOf(removed)}`,
    });
    if (removed.ok) walk.channels = walk.channels.filter((held) => String(held.id) !== id);
  }
}

/** Each of the layout's categories and channels, in the order members see them. */
export async function walkChannels(walk: Walk): Promise<void> {
  for (const channel of CHANNELS) {
    const part = `channel:${channel.key}`;
    const label = channel.kind === 'category' ? 'Category' : 'Channel';
    const shown = channel.kind === 'category' || channel.kind === 'voice' ? channel.name : `#${channel.name}`;
    const known = walk.records.get(part);
    if (known) {
      const there = walk.channels.some((held) => String(held.id) === known.id);
      if (there) walk.ids.set(part, known.id);
      const state = there ? await finishNews(walk, channel, known.id) : 'Deleted by hand, left out';
      walk.rows.push({ part: label, name: shown, state });
      continue;
    }
    const parentId = channel.parent ? (walk.ids.get(`channel:${channel.parent}`) ?? '') : '';
    const names = [channel.name, ...(channel.also ?? [])].map((name) => name.toLowerCase());
    const taken = new Set(walk.ids.values());
    const same = walk.channels.find(
      (held) =>
        names.includes(String(held.name).toLowerCase()) &&
        typesOf(channel).includes(Number(held.type)) &&
        !taken.has(String(held.id)),
    );
    if (same) {
      walk.ids.set(part, String(same.id));
      if (walk.act) await record(walk, part, String(same.id), false);
      walk.rows.push({ part: label, name: shown, state: await adopt(walk, channel, same, parentId) });
      continue;
    }
    if (channel.parent && !parentId) {
      walk.rows.push({ part: label, name: shown, state: 'Left out with its category' });
      continue;
    }
    if (!walk.act) {
      walk.ids.set(part, PLANNED);
      const asText = channel.kind === 'announcement' && !walk.community;
      walk.rows.push({
        part: label,
        name: shown,
        state: asText ? 'Will be made, as text until Community' : 'Will be made',
      });
      continue;
    }
    const made = await walk.context.rest.post(`/guilds/${walk.guildId}/channels`, channelBody(walk, channel), {
      reason: REASON,
    });
    if (!made.ok) {
      const why = whyOf(made);
      walk.refused.push(`${shown}: ${why}`);
      walk.rows.push({ part: label, name: shown, state: `Discord refused: ${why}` });
      continue;
    }
    const created = recordOf(made.json);
    walk.channels.push(created);
    walk.ids.set(part, String(created.id));
    await record(walk, part, String(created.id), true);
    walk.made.channels++;
    walk.rows.push({ part: label, name: shown, state: 'Made' });
  }
}
