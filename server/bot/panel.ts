// The panel's API. Every route needs a signed-in panel session, and every server route works out the person's level in
// that server from Discord itself (their roles, the server's roles, the owners the deploy names, the panel's grants),
// so taking a role away in Discord takes the panel away within a minute.

import {
  type Grant,
  type Level,
  PERMISSION,
  ROLE_REFUSALS,
  atLeast,
  basePermissions,
  levelOf,
  mentionRefusal,
  openRefusal,
  roleNameRefusal,
  roleRefusal,
} from './law/access.ts';
import { type BotModule, BOT_MODULES, moduleOf } from './law/modules.ts';
import { type RoleUse, everyoneSpots, referencedIds, roleSpots, validate } from './law/settings.ts';
import { type PanelUser, logout, sessionOf } from './auth.ts';
import { type HeaderSet, bearer, fail, json, readJson } from './http.ts';
import type { BotContext, Vars } from './kit.ts';
import { type Bucket, mediaRoute } from './media.ts';
import type { Actor } from './modules/module.ts';
import { EMOJI_REFUSAL, emojiOutside, messagePreview, testMessage } from './panelMessages.ts';
import type { Registry } from './registry.ts';
import type { Rest } from './rest.ts';
import {
  type Db,
  type Snapshot,
  audit,
  listedServers,
  presentGuilds,
  readAudit,
  readConfig,
  readSnapshot,
  roleOf,
  writeConfig,
} from './store.ts';

/** How long a member's roles are trusted before Discord is asked again, in milliseconds. */
export const MEMBER_KEEP_MS = 60_000;
/** How old roles may be to stand in while Discord does not answer: past it, the panel says Discord is away. */
export const MEMBER_STALE_MS = 10 * 60_000;
/** How many servers the panel asks Discord about at once when it lists a person's servers. */
const ASK_AT_ONCE = 5;

export interface PanelContext {
  readonly vars: Vars;
  readonly database: Db;
  readonly rest: Rest;
  readonly nowS: number;
  readonly nowMs: number;
  readonly cors: HeaderSet;
  readonly bot: BotContext;
  readonly media: Bucket | null;
  readonly registry: Registry;
  readonly gateway: (path: string, init?: RequestInit) => Promise<unknown>;
}

const members = new Map<string, { roles: string[] | null; at: number }>();

/** The user ids the deploy names as the bot's owners. */
export const ownersOf = (vars: Vars): string[] =>
  String(vars.BOT_OWNERS ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => /^\d{5,25}$/.test(entry));

/** A member's roles in a server, null when they are not in it, or 'down' while Discord is away. */
async function memberRoles(
  context: Pick<PanelContext, 'rest' | 'nowMs'>,
  guildId: string,
  userId: string,
): Promise<string[] | null | 'down'> {
  const key = `${guildId}:${userId}`;
  const hit = members.get(key);
  if (hit && context.nowMs - hit.at < MEMBER_KEEP_MS) return hit.roles;
  const answer = await context.rest.get(`/guilds/${guildId}/members/${userId}`);
  // while Discord is away, roles read a little while ago stand in; older ones may be roles taken since
  if (!answer.ok && answer.down) return hit && context.nowMs - hit.at < MEMBER_STALE_MS ? hit.roles : 'down';
  const held: unknown = answer.ok ? (answer.json as { roles?: unknown } | null)?.roles : null;
  const roles = Array.isArray(held) ? held.map(String) : null;
  if (members.size > 10_000) members.clear();
  members.set(key, { roles, at: context.nowMs });
  return roles;
}

const serverOf = (snapshot: Pick<Snapshot, 'guildId' | 'ownerId' | 'roles'>) => ({
  id: snapshot.guildId,
  owner_id: snapshot.ownerId,
  roles: snapshot.roles,
});

/** A person's level in a server. `grants` are the server's panel grants where the caller read them already. */
export async function levelIn(
  context: Pick<PanelContext, 'rest' | 'nowMs' | 'vars' | 'database'>,
  snapshot: Pick<Snapshot, 'guildId' | 'ownerId' | 'roles'>,
  userId: string,
  grants?: readonly Grant[],
): Promise<Level | 'down'> {
  const roles = await memberRoles(context, snapshot.guildId, userId);
  const owner = ownersOf(context.vars).includes(userId);
  if (roles === 'down') return owner ? 'owner' : 'down';
  if (roles === null) return owner ? 'owner' : 'none';
  const core = grants ? null : await readConfig(context.database, snapshot.guildId, 'core');
  const granted = grants ?? (Array.isArray(core?.config.panelGrants) ? (core.config.panelGrants as Grant[]) : []);
  return levelOf(serverOf(snapshot), { user_id: userId, roles }, { owners: ownersOf(context.vars), grants: granted });
}

/** Route a panel request. Answers null when the path is not the panel's. */
export async function panelRoute(context: PanelContext, request: Request, url: URL): Promise<Response | null> {
  const path = url.pathname;
  const { cors } = context;
  if (!path.startsWith('/v1/panel/') && path !== '/v1/auth/logout') return null;
  const session = await sessionOf(context, bearer(request));
  if (!session) return fail('auth', 401, cors, 'Sign in again.');
  const { user } = session;
  if (path === '/v1/auth/logout' && request.method === 'POST') return logout(context, session.tokenHash);
  if (path === '/v1/panel/me' && request.method === 'GET') return listServers(context, user, session.guilds);
  if (path === '/v1/panel/gateway' && request.method === 'POST') return gatewayAct(context, request, user);
  const match =
    /^\/v1\/panel\/g\/(\d{5,25})(?:\/(m\/([a-z0-9-]{1,32})(?:\/([va])\/([a-z0-9-]{1,32}))?|audit|test-message|media(?:\/([a-f0-9]{32}))?))?$/.exec(
      path,
    );
  if (!match) return fail('route', 404, cors);
  const [, guildId = '', part, moduleId, kind, partId = '', mediaId = ''] = match;
  const snapshot = await readSnapshot(context.database, guildId);
  if (!snapshot || !snapshot.present) return fail('guild', 404, cors, 'The bot is not in that server.');
  const level = await levelIn(context, snapshot, user.id);
  if (level === 'down' && !context.rest.on()) return fail('not-set-up', 503, cors, 'DISCORD_BOT_TOKEN is not set.');
  if (level === 'down') return fail('discord-down', 503, cors, 'Discord did not answer. Try again in a minute.');
  if (!atLeast(level, 'viewer')) return fail('level', 403, cors, 'You cannot open the panel for this server.');
  if (!part && request.method === 'GET') return overview(context, snapshot, level);
  if (part === 'test-message' && request.method === 'POST') return testMessage(context, request, snapshot, level, user);
  if (part?.startsWith('media')) return mediaRoute(context, request, snapshot, level, user, mediaId);
  if (part === 'audit' && request.method === 'GET') {
    const before = url.searchParams.get('before') || '0';
    if (!/^\d{1,15}$/.test(before)) return fail('query', 400, cors, 'Page the log by a row number.');
    return json({ entries: await readAudit(context.database, snapshot.guildId, Number(before)) }, 200, cors);
  }
  if (!moduleId) return fail('route', 404, cors);
  const shape = moduleOf(moduleId);
  if (!shape) return fail('module', 404, cors);
  if (!atLeast(level, shape.view)) return fail('level', 403, cors, 'Your level cannot see this module.');
  if (kind === 'v' && request.method === 'GET') return moduleView(context, snapshot.guildId, shape, partId, level, url);
  if (kind === 'a' && request.method === 'POST')
    return moduleAction(context, request, snapshot, shape, partId, level, user);
  if (kind) return fail('route', 404, cors);
  if (request.method === 'GET') {
    const config = await readConfig(context.database, snapshot.guildId, shape.id, snapshot);
    const preview = await messagePreview(context, snapshot, shape, user, config?.config);
    return json({ module: shape.id, ...config, canEdit: atLeast(level, shape.edit), preview }, 200, cors);
  }
  if (request.method === 'PUT') return saveModule(context, request, snapshot, shape, level, user);
  return fail('route', 404, cors);
}

/** A channel a setting or an act names must be one of this server's own: the bot's token reaches every server it is
 *  in, so a channel id from another would let one server's settings post there. */
const CHANNEL_REFUSAL = 'A channel named here is not in this server.';
const channelOutside = (snapshot: Snapshot, ids: readonly string[]): string | null => {
  const own = new Set(snapshot.channels.map((channel) => channel.id));
  return ids.find((id) => !own.has(id)) ?? null;
};

/**
 * GET /v1/panel/me: the servers this person may open, and their level in each: those they share with the bot, as
 * Discord named their servers at sign-in, read in one go. Where Discord did not, only so many are weighed.
 */
async function listServers(context: PanelContext, user: PanelUser, mine: readonly string[] | null): Promise<Response> {
  const guilds: Array<{ id: string; name: string; icon: string | null; level: Level }> = [];
  const servers = await listedServers(context.database, mine);
  for (let from = 0; from < servers.length; from += ASK_AT_ONCE) {
    const batch = servers.slice(from, from + ASK_AT_ONCE);
    const levels = await Promise.all(batch.map((server) => levelIn(context, server, user.id, server.grants)));
    batch.forEach((server, i) => {
      const level = levels[i];
      if (level && level !== 'down' && atLeast(level, 'viewer'))
        guilds.push({ id: server.guildId, name: server.name, icon: server.icon, level });
    });
  }
  return json({ user, owner: ownersOf(context.vars).includes(user.id), guilds }, 200, context.cors);
}

async function overview(context: PanelContext, snapshot: Snapshot, level: Level): Promise<Response> {
  const shown = BOT_MODULES.filter((shape) => atLeast(level, shape.view));
  const configs = await Promise.all(
    shown.map((shape) => readConfig(context.database, snapshot.guildId, shape.id, snapshot)),
  );
  const modules = shown.map((shape, i) => ({
    id: shape.id,
    title: shape.title,
    blurb: shape.blurb,
    group: shape.group,
    enabled: !!configs[i]?.enabled,
    canEdit: atLeast(level, shape.edit),
  }));
  const gateway = await context.gateway('/status').catch(() => null);
  return json(
    {
      guild: { id: snapshot.guildId, name: snapshot.name, icon: snapshot.icon, memberCount: snapshot.memberCount },
      level,
      gateway,
      modules,
      channels: snapshot.channels,
      roles: snapshot.roles.filter((role) => role.id !== snapshot.guildId),
      emojis: snapshot.emojis,
    },
    200,
    context.cors,
  );
}

/**
 * A role the save puts to a use where the settings did not before is held to Discord's own rule for that use (its
 * setting says which), so the panel never lets anyone hand out a role they could not hand out in Discord, nor move one
 * the owner only named (no experience, say) into a setting that gives it out (a reward, a welcome). Whether a role
 * lets anyone mention it is asked of Discord, as a snapshot may not say. A mention of everyone set here is the saver's
 * own, as in Discord: it needs Mention Everyone. Answers the refusal, or null.
 */
async function refusedRoles(
  context: PanelContext,
  snapshot: Snapshot,
  shape: BotModule,
  before: unknown,
  after: unknown,
  level: Level,
  user: PanelUser,
): Promise<Response | null> {
  const added = (use: RoleUse) => {
    const held = new Set(before ? roleSpots(shape.schema, before, use) : []);
    const fresh = roleSpots(shape.schema, after, use).filter((spot) => !held.has(spot));
    return [...new Set(fresh.map((spot) => spot.slice(spot.lastIndexOf('=') + 1)))];
  };
  const [given, opened, named, mentioned] = [added('give'), added('open'), added('name'), added('mention')];
  const loud = new Set(before ? everyoneSpots(shape.schema, before) : []);
  const louder = everyoneSpots(shape.schema, after).some((spot) => !loud.has(spot));
  const owner = level === 'owner';
  if (![...given, ...opened, ...named, ...mentioned].length && (!louder || owner)) return null;
  const roles = await memberRoles(context, snapshot.guildId, user.id);
  const member = { user_id: user.id, roles: Array.isArray(roles) ? roles : [] };
  const server = serverOf(snapshot);
  const asked = mentioned.length && !owner ? await context.rest.get(`/guilds/${snapshot.guildId}/roles`) : null;
  const current = asked?.ok && Array.isArray(asked.json) ? { ...server, roles: asked.json.map(roleOf) } : server;
  const refused =
    roleRefusal(server, member, given, { owner }) ??
    openRefusal(server, member, opened, { owner }) ??
    mentionRefusal(current, member, mentioned, { owner }) ??
    roleNameRefusal(server, named);
  if (refused)
    return json({ error: 'role', role: refused.role, message: ROLE_REFUSALS[refused.why] }, 403, context.cors);
  if (louder && !owner && (basePermissions(server, member) & PERMISSION.MENTION_EVERYONE) === 0n)
    return fail('everyone', 403, context.cors, 'You need Mention Everyone to mention everyone here.');
  return null;
}

async function saveModule(
  context: PanelContext,
  request: Request,
  snapshot: Snapshot,
  shape: BotModule,
  level: Level,
  user: PanelUser,
): Promise<Response> {
  const { cors, database } = context;
  const guildId = snapshot.guildId;
  if (!atLeast(level, shape.edit)) return fail('level', 403, cors, 'Your level cannot change this module.');
  const body = await readJson(request);
  if (!body) return fail('body', 400, cors);
  const checked = validate(shape.schema, body.config);
  if (!checked.ok) return json({ error: 'invalid', errors: checked.errors }, 400, cors);
  const rev = typeof body.rev === 'number' && Number.isSafeInteger(body.rev) && body.rev >= 0 ? body.rev : -1;
  if (rev < 0) return fail('body', 400, cors);
  const enabled = shape.alwaysOn ? true : body.enabled === true;
  const stale = (there: number) =>
    json({ error: 'stale', rev: there, message: 'Someone saved this page first. Reload it.' }, 409, cors);
  // the roles are weighed against the revision the write is made on, so no save can land on settings it was not
  // checked against
  const before = await readConfig(database, guildId, shape.id);
  if (rev !== (before?.rev ?? 0)) return stale(before?.rev ?? 0);
  const refused = await refusedRoles(context, snapshot, shape, before?.config, checked.value, level, user);
  if (refused) return refused;
  const named = referencedIds(shape.schema, checked.value);
  const foreign = channelOutside(snapshot, named.channels);
  if (foreign) return json({ error: 'channel', channel: foreign, message: CHANNEL_REFUSAL }, 403, cors);
  const strange = emojiOutside(snapshot, named.emojis);
  if (strange) return json({ error: 'emoji', emoji: strange, message: EMOJI_REFUSAL }, 403, cors);
  const write = { guildId, moduleId: shape.id, config: checked.value, enabled, rev, by: user.id, nowS: context.nowS };
  const saved = await writeConfig(database, write);
  if (!saved.ok) return stale(saved.stale);
  const changed = Object.keys(checked.value).filter(
    (key) => JSON.stringify(checked.value[key]) !== JSON.stringify(before?.config[key]),
  );
  await audit(database, {
    guildId,
    actorId: user.id,
    actorName: user.globalName || user.username,
    source: 'panel',
    action: before?.enabled !== enabled ? (enabled ? 'module.on' : 'module.off') : 'module.save',
    target: shape.id,
    detail: { changed },
    nowS: context.nowS,
  });
  const told = JSON.stringify({ guildId, module: shape.id });
  await context.gateway('/config', { method: 'POST', body: told }).catch(() => null);
  // A module that keeps something in Discord in step with its settings (AutoMod's rules) does it now and says how.
  const server = context.registry.byId(shape.id);
  const note = server?.saved
    ? await server.saved(context.bot, guildId, checked.value, enabled).catch(() => 'Discord was not updated.')
    : '';
  const preview = await messagePreview(context, snapshot, shape, user, checked.value);
  return json({ rev: saved.rev, config: checked.value, enabled, note, preview }, 200, cors);
}

/** GET .../m/<module>/v/<view>: one of a module's tables. */
async function moduleView(
  context: PanelContext,
  guildId: string,
  shape: BotModule,
  viewId: string,
  level: Level,
  url: URL,
): Promise<Response> {
  const spec = (shape.views ?? []).find((view) => view.id === viewId);
  const read = context.registry.byId(shape.id)?.views?.[viewId];
  if (!spec || !read) return fail('view', 404, context.cors);
  if (!atLeast(level, spec.level)) return fail('level', 403, context.cors, 'Your level cannot see this table.');
  return json(await read(context.bot, guildId, url.searchParams), 200, context.cors);
}

/**
 * POST .../m/<module>/a/<action>: one of a module's acts. Its input is checked against the shape the panel drew, and
 * the person must hold both the level and the Discord permission the act names: a panel grant never adds a permission.
 */
async function moduleAction(
  context: PanelContext,
  request: Request,
  snapshot: Snapshot,
  shape: BotModule,
  actionId: string,
  level: Level,
  user: PanelUser,
): Promise<Response> {
  const { cors, database } = context;
  const spec = (shape.actions ?? []).find((action) => action.id === actionId);
  const run = context.registry.byId(shape.id)?.actions?.[actionId];
  if (!spec || !run) return fail('action', 404, cors);
  if (!atLeast(level, spec.level)) return fail('level', 403, cors, 'Your level cannot do this.');
  const found = await readConfig(database, snapshot.guildId, shape.id, snapshot);
  if (!found?.enabled) return fail('module-off', 409, cors, `${shape.title} is off in this server.`);
  const held = await memberRoles(context, snapshot.guildId, user.id);
  const roles = Array.isArray(held) ? held : [];
  const owner = user.id === snapshot.ownerId || ownersOf(context.vars).includes(user.id);
  const permissions = Array.isArray(held) ? basePermissions(serverOf(snapshot), { user_id: user.id, roles }) : 0n;
  const needed = spec.perm ? PERMISSION[spec.perm] : 0n;
  if (!owner && needed && (permissions & needed) !== needed)
    return fail('permission', 403, cors, 'You lack the Discord permission for this.');
  const body = await readJson(request);
  const checked = validate(spec.inputs, body?.input ?? {});
  if (!checked.ok) return json({ error: 'invalid', errors: checked.errors }, 400, cors);
  const foreign = channelOutside(snapshot, referencedIds(spec.inputs, checked.value).channels);
  if (foreign) return json({ error: 'channel', channel: foreign, message: CHANNEL_REFUSAL }, 403, cors);
  const actor: Actor = {
    id: user.id,
    name: user.globalName || user.username,
    avatar: user.avatar,
    roles,
    permissions,
    owner,
    mayGive: (ids) => roleRefusal(serverOf(snapshot), { user_id: user.id, roles }, ids, { owner }),
  };
  const result = await run(context.bot, snapshot.guildId, checked.value, actor, found.config);
  await audit(database, {
    guildId: snapshot.guildId,
    actorId: user.id,
    actorName: actor.name,
    source: 'panel',
    action: `${shape.id}.${actionId}`,
    target: String(checked.value.user ?? checked.value.caseNo ?? ''),
    detail: { ok: result.ok, message: result.message },
    nowS: context.nowS,
  });
  return json(result, result.ok ? 200 : 400, cors);
}

/** POST /v1/panel/gateway {action: 'restart' | 'stop'}: the bot's owners only. */
async function gatewayAct(context: PanelContext, request: Request, user: PanelUser): Promise<Response> {
  const { cors } = context;
  if (!ownersOf(context.vars).includes(user.id)) return fail('level', 403, cors, "Only the bot's owners can do this.");
  const action = (await readJson(request))?.action;
  if (action !== 'restart' && action !== 'stop') return fail('body', 400, cors);
  const status = await context.gateway(`/${action}`, { method: 'POST' }).catch(() => null);
  for (const snapshot of await presentGuilds(context.database))
    await audit(context.database, {
      guildId: snapshot.guildId,
      actorId: user.id,
      actorName: user.globalName || user.username,
      source: 'panel',
      action: `gateway.${action}`,
      nowS: context.nowS,
    });
  return json({ gateway: status }, 200, cors);
}

/** For tests: forget cached member roles. */
export const resetMembers = (): void => members.clear();
