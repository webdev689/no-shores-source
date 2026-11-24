// The safety modules' rig: a Discord that keeps what the bot did to it (members, bans, time-outs, deleted messages,
// posts and direct messages), with the bot stood on the Gateway's side and on the Worker's around it.

import assert from 'node:assert/strict';
import { moduleOf } from '../law/modules.ts';
import { recordOf, validate, type Settings } from '../law/settings.ts';
import {
  APP_ID,
  BOT_ROLE,
  GUILD,
  MOD,
  MOD_ROLE,
  MEMBER,
  OWNER,
  TARGET,
  TEXT_CHANNEL,
  guildWithRanks,
  standGateway,
  signInPanel,
  standWorker,
} from '../botForTests.ts';
import type { BotContext, InteractionOption } from '../kit.ts';
import { registryOf, moduleHandlers } from '../registry.ts';
import { createRest, type Fetch } from '../rest.ts';
import { writeConfig } from '../store.ts';
import { handle, tick } from '../worker.ts';
import { antiraidModule } from './antiraid.ts';
import { automodModule } from './automod.ts';
import { logsModule } from './logs.ts';
import type { ServerModule } from './module.ts';
import { moderationModule } from './moderation.ts';

export const BOT = '900000000000000098';
export const ALERTS = '900000000000000032';
export const SAFETY: readonly ServerModule[] = [moderationModule, logsModule, automodModule, antiraidModule];
/** A route of a test's own, tried before the rest: its method, its path under the API, and its answer. */
export type Extra = readonly [string, RegExp, (found: RegExpExecArray, body: Settings) => Response];

/** A Discord that remembers. `inner` answers whatever this one does not, such as the sign-in's routes. */
export function safetyDiscord(inner?: Fetch) {
  const state = {
    members: new Map<string, string[]>([
      [OWNER, []],
      [MOD, [MOD_ROLE]],
      [MEMBER, []],
      [TARGET, []],
      [BOT, [BOT_ROLE]],
    ]),
    bans: new Map<string, Settings>(),
    timeouts: new Map<string, string | null>(),
    deleted: [] as string[],
    posts: [] as Array<{ channel: string; body: Settings }>,
    dms: [] as Array<{ to: string; body: Settings }>,
    edits: [] as string[],
    channels: new Map<string, Settings>(),
    messages: new Map<string, Settings[]>(),
    calls: [] as Array<{ method: string; path: string }>,
    extra: [] as Extra[],
    level: 1,
  };
  const dmChannels = new Map<string, string>();
  const reply = (json: unknown, status = 200) =>
    json === null ? new Response(null, { status: 204 }) : Response.json(json, { status });
  const unknown = () => reply({ code: 10007, message: 'Unknown' }, 404);
  const fetch: Fetch = async (url, init) => {
    const address = new URL(url);
    const path = address.pathname.replace('/api/v10', '');
    const method = (init?.method ?? 'GET').toUpperCase();
    const body = recordOf(typeof init?.body === 'string' && init.body ? JSON.parse(init.body) : {});
    state.calls.push({ method, path });
    for (const [wanted, pattern, answer] of state.extra) {
      const found = method === wanted ? pattern.exec(path) : null;
      if (found) return answer(found, body);
    }
    const idIn = (pattern: RegExp) => pattern.exec(path)?.[1] ?? '';
    const route = `${method} ${path.replace(/\d{5,25}/g, ':id')}`;
    const authorization = new Headers(init?.headers).get('authorization') ?? '';
    switch (route) {
      case 'GET /users/@me':
        if (authorization.startsWith('Bot ')) return reply({ id: BOT, username: 'bot' });
        break;
      case 'GET /users/:id':
        return reply({ id: idIn(/(\d+)$/), username: `user${path.slice(-2)}` });
      case 'POST /users/@me/channels': {
        const channel = `7${String(body.recipient_id).slice(1)}`;
        dmChannels.set(channel, String(body.recipient_id));
        return reply({ id: channel });
      }
      case 'GET /guilds/:id/members/:id': {
        const roles = state.members.get(idIn(/(\d+)$/));
        return roles ? reply({ user: { id: idIn(/(\d+)$/) }, roles }) : unknown();
      }
      case 'PATCH /guilds/:id/members/:id':
        if (!state.members.has(idIn(/(\d+)$/))) return unknown();
        state.timeouts.set(idIn(/(\d+)$/), (body.communication_disabled_until as string | null) ?? null);
        if (!body.communication_disabled_until) state.timeouts.delete(idIn(/(\d+)$/));
        return reply({});
      case 'DELETE /guilds/:id/members/:id':
        return state.members.delete(idIn(/(\d+)$/)) ? reply(null) : unknown();
      case 'PUT /guilds/:id/bans/:id':
        state.members.delete(idIn(/(\d+)$/));
        state.bans.set(idIn(/(\d+)$/), body);
        return reply(null);
      case 'DELETE /guilds/:id/bans/:id':
        return state.bans.delete(idIn(/(\d+)$/)) ? reply(null) : unknown();
      case 'GET /guilds/:id/bans':
        return reply(
          [...state.bans.keys()].map((id) => ({ user: { id, username: `user${id.slice(-2)}` }, reason: '' })),
        );
      case 'GET /guilds/:id':
        return reply({ id: GUILD, verification_level: state.level });
      case 'PATCH /guilds/:id':
        state.level = Number(body.verification_level);
        return reply({});
      case 'POST /channels/:id/messages': {
        const channel = idIn(/channels\/(\d+)/);
        const to = dmChannels.get(channel);
        if (to) state.dms.push({ to, body });
        else state.posts.push({ channel, body });
        return reply({ id: '800000000000000001', channel_id: channel });
      }
      case 'DELETE /channels/:id/messages/:id':
        state.deleted.push(idIn(/(\d+)$/));
        return reply(null);
      case 'POST /channels/:id/messages/bulk-delete':
        state.deleted.push(...(body.messages as string[]));
        return reply(null);
      case 'GET /channels/:id/messages':
        return reply(state.messages.get(idIn(/channels\/(\d+)/)) ?? []);
      case 'GET /channels/:id':
        return reply(state.channels.get(idIn(/channels\/(\d+)/)) ?? { id: idIn(/(\d+)$/), permission_overwrites: [] });
      case 'PATCH /channels/:id': {
        const channel = idIn(/(\d+)$/);
        state.channels.set(channel, { ...state.channels.get(channel), ...body });
        return reply({});
      }
      case 'PUT /channels/:id/permissions/:id': {
        const [channel, target] = [idIn(/channels\/(\d+)/), idIn(/(\d+)$/)];
        const held = state.channels.get(channel) ?? { id: channel, permission_overwrites: [] };
        const others = (held.permission_overwrites as Settings[]).filter((over) => over.id !== target);
        state.channels.set(channel, { ...held, permission_overwrites: [...others, { id: target, ...body }] });
        return reply(null);
      }
      default:
        if (method === 'PATCH' && path.endsWith('/messages/@original')) {
          state.edits.push(String(body.content ?? ''));
          return reply({});
        }
    }
    return inner ? inner(url, init) : unknown();
  };
  const postsTo = (channel: string) => state.posts.filter((post) => post.channel === channel).map((post) => post.body);
  return { fetch, state, postsTo };
}

/** Settings checked against their module's shape, as a save would. */
export function settingsOf(moduleId: string, given: Settings): Settings {
  const checked = validate(moduleOf(moduleId)?.schema ?? {}, given);
  assert.equal(checked.ok, true, JSON.stringify(checked.ok ? [] : checked.errors));
  return checked.ok ? checked.value : {};
}

/** The Gateway's side with the safety modules, their settings on, and a Discord that remembers. */
export async function standSafetyGateway(settings: Readonly<Record<string, Settings>>) {
  const bot = await standGateway(settings);
  const discord = safetyDiscord();
  const context: BotContext = {
    ...bot.context,
    rest: createRest({ token: 'bot-token-for-tests', fetch: discord.fetch }),
  };
  bot.dispatcher.use(moduleHandlers(context, registryOf(SAFETY)));
  return { ...bot, discord, context };
}

/** A slash command from a member with the permissions given, in the text channel. */
export function slash(
  from: string,
  name: string,
  options: readonly InteractionOption[] = [],
  { permissions = String(1n << 40n), roles = [MOD_ROLE] }: { permissions?: string; roles?: string[] } = {},
) {
  return {
    type: 2,
    id: '800000000000000002',
    application_id: APP_ID,
    token: 'interaction-token',
    guild_id: GUILD,
    channel_id: TEXT_CHANNEL,
    member: { user: { id: from, username: `user${from.slice(-2)}` }, roles, permissions },
    data: { name, options, resolved: { users: { [TARGET]: { id: TARGET, username: 'target' } } } },
  };
}

/** The Worker with the safety modules, moderation's settings saved, the ranked server seen, and a remembering Discord. */
export async function standSafetyWorker(moderation: Settings = {}, enabled = true) {
  const bot = await standWorker({ modules: SAFETY });
  const discord = safetyDiscord(bot.discord.fetch);
  await bot.dispatcher.dispatch('GUILD_CREATE', guildWithRanks());
  const config = settingsOf('moderation', moderation);
  await writeConfig(bot.database, {
    guildId: GUILD,
    moduleId: 'moderation',
    config,
    enabled,
    rev: 0,
    by: OWNER,
    nowS: 1,
  });
  const over = { fetch: discord.fetch, registry: bot.registry };
  const call = async (request: Request) => {
    try {
      return await handle(request, bot.env, bot.execution, over);
    } finally {
      await bot.execution.settle();
    }
  };
  /** Send a slash command; answers the words the bot drew, in the answer or after a deferral. */
  const ask = async (interaction: unknown) => {
    const body = (await (await call(await bot.keys.signed(interaction))).json()) as Settings;
    return { body, said: String(recordOf(body.data).content ?? discord.state.edits.at(-1) ?? '') };
  };
  const clock = (nowMs: number) => tick(bot.env, nowMs, bot.execution, over);
  const cases = () => bot.database.raw.prepare('SELECT * FROM mod_cases ORDER BY case_no').all() as Settings[];
  // the sign-in walks through the Worker's own fake Discord, which knows its OAuth routes
  const signIn = (userId: string) => signInPanel(bot, userId);
  return { ...bot, discord, call, ask, clock, cases, signIn };
}
