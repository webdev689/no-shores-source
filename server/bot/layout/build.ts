// The layout's second half, and its two ways in: the plan the panel shows, which changes nothing, and the build.
// Each of the server's settings is set once and then left to the owner; a module's settings are written only while
// the layout wrote them last, so a save from the panel makes them the owner's; the messages are posted through their
// modules' own acts, which update a post in place; and what only the server's owner can do is kept as a checklist in
// the staff channel, updated by every build.

import { PERMISSION, type PermissionName } from '../law/access.ts';
import { moduleOf } from '../law/modules.ts';
import { type Settings, defaults, recordOf, validate } from '../law/settings.ts';
import { type BotContext, postTo } from '../kit.ts';
import type { RestResult } from '../rest.ts';
import { announceModule } from '../modules/announce.ts';
import { automodModule } from '../modules/automod.ts';
import type { Actor, ServerModule } from '../modules/module.ts';
import { roleMenusModule } from '../modules/roleMenus.ts';
import { ticketsModule } from '../modules/tickets.ts';
import { channelOf, readConfig, readSnapshot, roleOf, writeConfig, writeSnapshot } from '../store.ts';
import { RULES, type Todo, checklistPayload } from './messages.ts';
import { LEFT_OFF, PING_MENU, POSTED_ANNOUNCEMENTS, modulePlans } from './moduleSettings.ts';
import { BOT_PERMISSIONS, HOUSE_ROLES, ROLES, SERVER, SERVER_WORDS, WELCOME_SCREEN } from './noShores.ts';
import {
  REASON,
  type Row,
  type Walk,
  idsOf,
  look,
  record,
  tidyDiscordCategories,
  walkChannels,
  walkRoles,
  whyOf,
} from './parts.ts';

/** Who a module's settings were last saved by when the layout saved them: never a Discord user's id. */
export const LAYOUT_BY = 'layout';
/** Discord's feature name for a server whose members accept its rules before they talk. */
const SCREENING = 'MEMBER_VERIFICATION_GATE_ENABLED';
/** The modules whose saves keep something in Discord in step: AutoMod's rules, and announcements' schedule. */
const SAVE_STEPS: readonly ServerModule[] = [announceModule, automodModule];

/** Fetches a picture the layout sets (the server's icon) as a data address Discord takes, or null. */
export type FetchPicture = (url: string) => Promise<string | null>;

export const fetchPicture: FetchPicture = async (url) => {
  const answer = await fetch(url).catch(() => null);
  if (!answer?.ok) return null;
  const bytes = new Uint8Array(await answer.arrayBuffer());
  let text = '';
  for (let start = 0; start < bytes.length; start += 0x8000)
    text += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
  return `data:image/png;base64,${btoa(text)}`;
};

/** One of the server's settings, set once: `apply` answers Discord's words when it refused, '' when it took it. */
async function once(walk: Walk, part: string, name: string, apply: () => Promise<string>, waits = '') {
  if (walk.records.has(part)) return walk.rows.push({ part: 'Setting', name, state: 'Set' });
  if (waits) return walk.rows.push({ part: 'Setting', name, state: waits });
  if (!walk.act) return walk.rows.push({ part: 'Setting', name, state: 'Will be set' });
  const refusal = await apply();
  if (refusal) {
    walk.refused.push(`${name}: ${refusal}`);
    return walk.rows.push({ part: 'Setting', name, state: `Discord refused: ${refusal}` });
  }
  await record(walk, part, '', true);
  return walk.rows.push({ part: 'Setting', name, state: 'Set' });
}

async function walkSettings(walk: Walk, picture: FetchPicture): Promise<void> {
  const { rest } = walk.context;
  const ids = idsOf(walk);
  const guild = `/guilds/${walk.guildId}`;
  const refusal = async (answer: Promise<RestResult>) => whyOf(await answer);
  await once(walk, 'setting:safety', 'Verification, notifications and the media filter', () =>
    refusal(
      rest.patch(
        guild,
        {
          verification_level: Math.max(Number(walk.guild.verification_level) || 0, SERVER.verificationLevel),
          default_message_notifications: SERVER.notifications,
          explicit_content_filter: Math.max(Number(walk.guild.explicit_content_filter) || 0, SERVER.contentFilter),
        },
        { reason: REASON },
      ),
    ),
  );
  await once(walk, 'setting:system', "Discord's own notices in #general", () =>
    refusal(
      rest.patch(
        guild,
        { system_channel_id: ids.channel(SERVER.systemChannel) || null, system_channel_flags: SERVER.systemFlags },
        { reason: REASON },
      ),
    ),
  );
  const everyone = walk.roles.find((role) => String(role.id) === walk.guildId);
  await once(walk, 'setting:everyonePing', 'Only the owner and the bot ping everyone', () =>
    refusal(
      rest.patch(
        `${guild}/roles/${walk.guildId}`,
        { permissions: String(BigInt(String(everyone?.permissions ?? '0')) & ~PERMISSION.MENTION_EVERYONE) },
        { reason: REASON },
      ),
    ),
  );
  const hasIcon = Boolean(walk.guild.icon);
  await once(
    walk,
    'setting:icon',
    "The server's icon",
    async () => {
      const data = await picture(SERVER.icon);
      return data ? refusal(rest.patch(guild, { icon: data }, { reason: REASON })) : 'the icon could not be fetched';
    },
    hasIcon ? 'There already, kept as it is' : '',
  );
  const later = walk.community ? '' : 'Waits for Community';
  await once(
    walk,
    'setting:community',
    'The rules, updates and safety channels, and the description',
    () =>
      refusal(
        rest.patch(
          guild,
          {
            rules_channel_id: ids.channel(SERVER.rulesChannel) || null,
            public_updates_channel_id: ids.channel(SERVER.updatesChannel) || null,
            safety_alerts_channel_id: ids.channel(SERVER.safetyChannel) || null,
            description: SERVER_WORDS,
          },
          { reason: REASON },
        ),
      ),
    later,
  );
  await once(
    walk,
    'setting:welcomeScreen',
    "Discord's welcome screen",
    () =>
      refusal(
        rest.patch(
          `${guild}/welcome-screen`,
          {
            enabled: true,
            description: SERVER_WORDS,
            welcome_channels: WELCOME_SCREEN.filter((entry) => ids.channel(entry.channel)).map((entry) => ({
              channel_id: ids.channel(entry.channel),
              description: entry.description,
              emoji_name: entry.emoji,
            })),
          },
          { reason: REASON },
        ),
      ),
    later,
  );
}

/**
 * The snapshot the panel and the modules read, from what Discord holds after the build's changes (asked again, as the
 * build's own lists still hold @everyone as it was), so new channels can be named at once and the panel's checks read
 * the server as it now is.
 */
async function freshSnapshot(walk: Walk): Promise<void> {
  const { context, guildId } = walk;
  const stored = await readSnapshot(context.database, guildId);
  if (!stored) return;
  const guild = await context.rest.get(`/guilds/${guildId}`);
  const roles = guild.ok ? recordOf(guild.json).roles : null;
  if (Array.isArray(roles)) walk.roles = roles.map(recordOf);
  const channels = await context.rest.get(`/guilds/${guildId}/channels`);
  if (channels.ok && Array.isArray(channels.json)) walk.channels = channels.json.map(recordOf);
  stored.roles = walk.roles.map(roleOf);
  stored.channels = walk.channels.filter((channel) => ![10, 11, 12].includes(Number(channel.type))).map(channelOf);
  stored.updatedAt = Math.floor(context.now() / 1000);
  await writeSnapshot(context.database, stored);
}

/** Each module's settings, written while the layout wrote them last. Answers how many were set. */
async function walkModules(walk: Walk): Promise<number> {
  const { context, guildId } = walk;
  const snapshot = await readSnapshot(context.database, guildId);
  let set = 0;
  for (const plan of modulePlans(idsOf(walk))) {
    const shape = moduleOf(plan.id);
    if (!shape) continue;
    const kept = await readConfig(context.database, guildId, plan.id, snapshot);
    const theirs = Boolean(kept?.updatedBy) && kept?.updatedBy !== LAYOUT_BY;
    const verb = plan.enabled ? 'on' : 'off';
    if (theirs) {
      walk.rows.push({ part: 'Module', name: shape.title, state: 'Changed in the panel, left as it is' });
      continue;
    }
    const checked = validate(shape.schema, { ...defaults(shape.schema), ...plan.config });
    if (!checked.ok) {
      walk.refused.push(`${shape.title}'s settings: ${checked.errors[0]?.message ?? 'not valid'}`);
      walk.rows.push({ part: 'Module', name: shape.title, state: `Not saved: ${checked.errors[0]?.message ?? ''}` });
      continue;
    }
    if (!walk.act) {
      walk.rows.push({ part: 'Module', name: shape.title, state: `Will be set, ${verb}` });
      continue;
    }
    const nowS = Math.floor(context.now() / 1000);
    const write = { guildId, moduleId: plan.id, config: checked.value, enabled: plan.enabled, by: LAYOUT_BY, nowS };
    const saved = await writeConfig(context.database, { ...write, rev: kept?.rev ?? 0 });
    if (!saved.ok) {
      walk.rows.push({ part: 'Module', name: shape.title, state: 'Someone saved it at the same time, left as it is' });
      continue;
    }
    await context.forget?.(guildId, plan.id);
    const step = SAVE_STEPS.find((module) => module.id === plan.id)?.saved;
    const note = step ? await step(context, guildId, checked.value, plan.enabled).catch(() => '') : '';
    set++;
    walk.rows.push({ part: 'Module', name: shape.title, state: `Set, ${verb}${note ? `. ${note}` : ''}` });
  }
  for (const id of LEFT_OFF) {
    const shape = moduleOf(id);
    if (shape) walk.rows.push({ part: 'Module', name: shape.title, state: 'Off, one switch away' });
  }
  return set;
}

/** The posts the layout keeps, through their modules' own acts. Answers how many went out. */
async function walkPosts(walk: Walk, actor: Actor): Promise<number> {
  const { context, guildId } = walk;
  const acts: { name: string; module: ServerModule; act: string; input: Settings }[] = [
    ...POSTED_ANNOUNCEMENTS.map((name) => ({
      name: `The ${name} post`,
      module: announceModule,
      act: 'send',
      input: { name },
    })),
    { name: 'The ping buttons', module: roleMenusModule, act: 'publish', input: { name: PING_MENU } },
    { name: 'The ticket button', module: ticketsModule, act: 'post', input: {} },
  ];
  let posted = 0;
  for (const each of acts) {
    if (!walk.act) {
      walk.rows.push({ part: 'Message', name: each.name, state: 'Will be posted, or updated in place' });
      continue;
    }
    const kept = await context.config(guildId, each.module.id);
    if (!kept?.enabled) {
      walk.rows.push({ part: 'Message', name: each.name, state: 'Its module is off, left out' });
      continue;
    }
    const run = each.module.actions?.[each.act];
    const result = run ? await run(context, guildId, each.input, actor, kept.config) : null;
    if (result?.ok) posted++;
    else if (result) walk.refused.push(`${each.name}: ${result.message}`);
    walk.rows.push({ part: 'Message', name: each.name, state: result?.message ?? 'Not posted' });
  }
  return posted;
}

/** The Founder's role for the server's owner, given once. */
async function walkFounder(walk: Walk): Promise<void> {
  const founder = idsOf(walk).role('founder');
  const owner = String(walk.guild.owner_id ?? '');
  if (!founder || !owner) return;
  await once(walk, 'member:founder', 'Founder for the server owner', async () => {
    const given = await walk.context.rest.put(`/guilds/${walk.guildId}/members/${owner}/roles/${founder}`, undefined, {
      reason: REASON,
    });
    return whyOf(given);
  });
}

/** What is left for the server's owner, in the order to do it. */
function todosOf(walk: Walk): Todo[] {
  const todos: Todo[] = [];
  const features = Array.isArray(walk.guild.features) ? walk.guild.features.map(String) : [];
  const channel = (key: string) => (idsOf(walk).channel(key) ? `<#${idsOf(walk).channel(key)}>` : `#${key}`);
  const lacking = new Set<PermissionName>(walk.lacking);
  const admin = (walk.botPermissions & PERMISSION.ADMINISTRATOR) === PERMISSION.ADMINISTRATOR;
  if (!admin)
    for (const name of BOT_PERMISSIONS) if ((walk.botPermissions & PERMISSION[name]) === 0n) lacking.add(name);
  if (lacking.size) {
    const application = String(walk.context.vars.DISCORD_APPLICATION_ID ?? '');
    const bits = BOT_PERMISSIONS.reduce((sum, name) => sum | PERMISSION[name], 0n);
    const link =
      `https://discord.com/oauth2/authorize?client_id=${application}&scope=bot+applications.commands` +
      `&permissions=${bits}&guild_id=${walk.guildId}&disable_guild_select=true`;
    const what = [...lacking].map((name) => name.toLowerCase().replaceAll('_', ' ')).join(', ');
    todos.push({
      name: 'Give the bot what it lacks',
      how: `Open this link and press Authorize, then press Build in the panel again. The bot lacks: ${what}.\n${link}`,
    });
  }
  if (!walk.community)
    todos.push({
      name: 'Turn on Community',
      how:
        `In Server Settings, open Enable Community and follow its steps: choose ${channel('rules')} for the rules ` +
        `and ${channel('staff')} for community updates. Then press Build in the panel again, to make the news ` +
        'channels announcement channels and set the welcome screen.',
    });
  if (walk.community && !features.includes(SCREENING))
    todos.push({
      name: 'Turn on rules screening',
      how:
        'In Server Settings, open Safety Setup, turn on Rules Screening, and add these rules:\n' +
        RULES.map(([name, words], index) => `${index + 1}. ${name}: ${words}`).join('\n'),
    });
  const given = ['founder', ...Object.values(HOUSE_ROLES), 'announcementPings', 'patchNotePings', 'eventPings'];
  const above = ROLES.filter((role) => given.includes(role.key)).filter((role) => {
    const held = walk.roles.find((each) => String(each.id) === idsOf(walk).role(role.key));
    return held && (Number(held.position) || 0) >= walk.botTop;
  });
  if (above.length)
    todos.push({
      name: "Move the bot's role up",
      how: `In Server Settings, Roles, drag the bot's role above ${above.map((role) => role.name).join(', ')}, so it can give them.`,
    });
  if (walk.refused.length)
    todos.push({ name: 'Discord refused some parts', how: walk.refused.slice(0, 10).join('\n') });
  return todos;
}

/** The checklist in #staff, posted once and then updated in place. */
async function keepChecklist(walk: Walk, todos: readonly Todo[]): Promise<void> {
  const staff = idsOf(walk).channel('staff');
  if (!staff || !walk.act) return;
  const payload = checklistPayload(todos);
  const kept = walk.records.get('message:checklist');
  if (kept?.id) {
    const edited = await walk.context.rest.patch(`/channels/${staff}/messages/${kept.id}`, payload);
    if (edited.ok) return;
  }
  const posted = await postTo(walk.context.rest, staff, payload);
  if (posted) await record(walk, 'message:checklist', String(posted.id), true);
}

/** The plan: every part with what a build would do to it, changing nothing. */
export async function planRows(context: BotContext, guildId: string): Promise<{ rows: Row[]; note: string }> {
  const walk = await look(context, guildId, false);
  if (typeof walk === 'string') return { rows: [], note: walk };
  await walkRoles(walk);
  await walkChannels(walk);
  await tidyDiscordCategories(walk);
  await walkSettings(walk, fetchPicture);
  await walkModules(walk);
  await walkPosts(walk, { id: '', name: '', roles: [], permissions: 0n, owner: true, mayGive: () => null });
  const todos = todosOf(walk);
  for (const todo of todos) walk.rows.push({ part: 'For you', name: todo.name, state: todo.how.split('\n')[0] ?? '' });
  return { rows: walk.rows, note: todos.length ? '' : 'Nothing is left for you once it is built.' };
}

/** The claim a build holds on a server while it runs, and how long one is trusted before it is taken as dropped. */
const BUILDING = 'build:running';
const BUILD_CLAIM_S = 600;

/**
 * One build a server at a time: two at once (two tabs, or the owner and a bot owner) would each find nothing made
 * and make it all. Answers whether this build holds the claim; a claim older than BUILD_CLAIM_S is taken over.
 */
async function claimBuild(context: BotContext, guildId: string): Promise<boolean> {
  const nowS = Math.floor(context.now() / 1000);
  const claimed = await context.database
    .prepare(
      `INSERT INTO layout_parts (guild_id, part, discord_id, made, at) VALUES (?, ?, '', 0, ?)
       ON CONFLICT (guild_id, part) DO UPDATE SET at = excluded.at WHERE layout_parts.at < ?`,
    )
    .bind(guildId, BUILDING, nowS, nowS - BUILD_CLAIM_S)
    .run();
  return claimed.meta.changes === 1;
}

/** The build: makes what is missing, sets what it owns, posts, and keeps the checklist. */
export async function build(
  context: BotContext,
  guildId: string,
  actor: Actor,
  picture: FetchPicture = fetchPicture,
): Promise<{ ok: boolean; message: string; rows: Row[] }> {
  if (!(await claimBuild(context, guildId)))
    return { ok: false, message: 'A build is already running in this server. Try again in a minute.', rows: [] };
  try {
    return await buildClaimed(context, guildId, actor, picture);
  } finally {
    await context.database
      .prepare('DELETE FROM layout_parts WHERE guild_id = ? AND part = ?')
      .bind(guildId, BUILDING)
      .run();
  }
}

async function buildClaimed(
  context: BotContext,
  guildId: string,
  actor: Actor,
  picture: FetchPicture,
): Promise<{ ok: boolean; message: string; rows: Row[] }> {
  const walk = await look(context, guildId, true);
  if (typeof walk === 'string') return { ok: false, message: walk, rows: [] };
  await walkRoles(walk);
  await walkChannels(walk);
  await tidyDiscordCategories(walk);
  await walkSettings(walk, picture);
  await freshSnapshot(walk);
  const set = await walkModules(walk);
  const posted = await walkPosts(walk, actor);
  await walkFounder(walk);
  const todos = todosOf(walk);
  await keepChecklist(walk, todos);
  const made = `Made ${walk.made.roles} roles and ${walk.made.channels} channels, set ${set} modules, posted ${posted} messages.`;
  const left = todos.length
    ? ` ${todos.length} ${todos.length === 1 ? 'thing is' : 'things are'} left for you: see the checklist in #staff.`
    : ' The server is finished.';
  return { ok: true, message: made + left, rows: walk.rows };
}
