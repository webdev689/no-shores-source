// The engagement modules' tests stand on this: the core's Gateway stand with a Discord that remembers what the bot
// did (posts, edits, channels made and deleted, reactions, members' roles), answered interactions run to the end,
// and interactions built as Discord sends them.

import { GUILD, TEXT_CHANNEL, APP_ID, standGateway } from '../botForTests.ts';
import type { BotContext, Interaction, InteractionOption } from '../kit.ts';
import { recordOf } from '../law/settings.ts';
import { moduleHandlers, registryOf } from '../registry.ts';
import { createRest } from '../rest.ts';
import type { ServerModule } from './module.ts';

/** The bot's own user id in the fake Discord. */
export const BOT_ID = '900000000000000098';
/** A route a test adds: the method, a pattern of the path below /api/v10, and the answer. */
export type ExtraRoute = readonly [string, RegExp, (body: unknown) => Response];

/** A Discord that keeps what the bot did, for the tests to read back. */
export function fakeWorld() {
  const state = {
    calls: [] as Array<{ method: string; path: string; body: unknown }>,
    posts: new Map<string, Array<Record<string, unknown>>>(),
    edits: [] as Array<Record<string, unknown>>,
    channels: new Map<string, Record<string, unknown>>(),
    gone: [] as string[],
    reactions: [] as string[],
    members: new Map<string, string[]>(),
    extra: [] as ExtraRoute[],
  };
  let made = 0;
  const nextId = () => `91000000000000${String(++made).padStart(4, '0')}`;
  const fetch = async (url: string, init?: RequestInit): Promise<Response> => {
    const method = (init?.method ?? 'GET').toUpperCase();
    const path = new URL(url).pathname.replace(/^\/api\/v10/, '');
    const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
    state.calls.push({ method, path, body });
    const extra = state.extra.find(([want, pattern]) => want === method && pattern.test(path));
    if (extra) return extra[2](body);
    const parts = path.split('/').filter(Boolean);
    const fields = recordOf(body);
    if (method === 'GET' && path === '/users/@me') return Response.json({ id: BOT_ID, username: 'bot' });
    if (method === 'POST' && parts[0] === 'channels' && parts[2] === 'messages') {
      const channelId = parts[1] ?? '';
      state.posts.set(channelId, [...(state.posts.get(channelId) ?? []), fields]);
      return Response.json({ id: nextId(), channel_id: channelId, ...fields });
    }
    if (method === 'PATCH' && (parts[0] === 'webhooks' || parts[2] === 'messages')) {
      state.edits.push(fields);
      return Response.json({ id: parts[3] ?? nextId(), ...fields });
    }
    if (method === 'PUT' && parts.includes('reactions')) state.reactions.push(decodeURIComponent(parts[5] ?? ''));
    if (method === 'POST' && parts[0] === 'guilds' && parts[2] === 'channels') {
      const id = nextId();
      state.channels.set(id, { id, ...fields });
      return Response.json({ id, ...fields });
    }
    if (method === 'DELETE' && parts[0] === 'channels' && parts.length === 2) state.gone.push(parts[1] ?? '');
    if (parts[0] === 'guilds' && parts[2] === 'members') {
      const userId = parts[3] ?? '';
      const roles = state.members.get(userId) ?? [];
      if (method === 'GET' && !state.members.has(userId))
        return Response.json({ code: 10007, message: 'Unknown Member' }, { status: 404 });
      const roleId = parts[5] ?? '';
      if (method === 'PUT') state.members.set(userId, [...roles.filter((role) => role !== roleId), roleId]);
      if (method === 'DELETE')
        state.members.set(
          userId,
          roles.filter((role) => role !== roleId),
        );
      return Response.json({ user: { id: userId, username: `user${userId.slice(-2)}` }, roles });
    }
    if (method === 'GET')
      return Response.json(path.endsWith('/messages') ? [] : { message: 'Unknown' }, {
        status: path.endsWith('/messages') ? 200 : 404,
      });
    return method === 'DELETE' || method === 'PUT' ? new Response(null, { status: 204 }) : Response.json({});
  };
  return { state, fetch, posts: (channelId: string) => state.posts.get(channelId) ?? [] };
}

/**
 * The Gateway's side with `settings` saved and on, `modules` hearing its events, and Discord the remembering fake.
 * `settle` runs every answer an interaction deferred.
 */
export async function standEngagement(settings: Readonly<Record<string, unknown>>, modules: readonly ServerModule[]) {
  const bot = await standGateway(settings);
  const world = fakeWorld();
  const pending: Array<Promise<unknown>> = [];
  const context: BotContext = {
    ...bot.context,
    rest: createRest({ token: 'bot-token-for-tests', fetch: world.fetch }),
    later: (work) => void pending.push(work),
  };
  bot.dispatcher.use(moduleHandlers(context, registryOf(modules)));
  const configOf = async (moduleId: string) => (await context.config(GUILD, moduleId))?.config ?? {};
  return { ...bot, context, world, configOf, settle: () => Promise.all(pending.splice(0)) };
}

/** An interaction from a member: a slash command by `name` and `options`, or a press of `customId`. */
export function interactionFrom(
  userId: string,
  {
    name = '',
    options = [],
    customId = '',
    roles = [],
    perms = '0',
    channelId = TEXT_CHANNEL,
  }: {
    readonly name?: string;
    readonly options?: readonly InteractionOption[];
    readonly customId?: string;
    readonly roles?: readonly string[];
    readonly perms?: string;
    readonly channelId?: string;
  } = {},
): Interaction {
  return {
    type: customId ? 3 : 2,
    id: '900000000000000500',
    application_id: APP_ID,
    token: 'interaction-token',
    guild_id: GUILD,
    channel_id: channelId,
    member: { user: { id: userId, username: `user${userId.slice(-2)}` }, roles, permissions: perms },
    data: customId ? { custom_id: customId } : { name, options },
  };
}
