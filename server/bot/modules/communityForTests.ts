// The community modules stood up for their tests: the core's Gateway side, with a fake Discord that remembers what the
// bot did to it (posts by channel, edits, direct messages, reactions, members' roles, answers to presses) and can
// refuse a channel or a role, lose a post or go down for edits.

import { GUILD, standGateway } from '../botForTests.ts';
import type { BotContext, Interaction } from '../kit.ts';
import { moduleHandlers, registryOf } from '../registry.ts';
import { createRest } from '../rest.ts';
import type { ServerModule } from './module.ts';

/** The bot's own user id in the fake Discord. */
export const BOT_USER = '900000000000000098';
/** The channel every direct message goes through. */
const DM_CHANNEL = '700000000000000001';

export type Posted = Record<string, unknown> & { readonly id: string };

/** A fake Discord's memory, and the fetch that answers from it. */
export function rememberingDiscord() {
  const world = {
    members: new Map<string, { roles: string[] }>(),
    posts: new Map<string, Posted[]>(),
    edits: [] as Posted[],
    dms: [] as Posted[],
    reactions: [] as string[],
    closed: new Set<string>(),
    deleted: new Set<string>(),
    editsDown: false,
    /** Roles the bot may not give or take, as for a role above its own. */
    refusedRoles: new Set<string>(),
    /** What a deferred answer to an interaction was changed to. */
    answers: [] as Record<string, unknown>[],
  };
  let made = 0;
  const answer = (status: number, body: unknown) => Response.json(body, { status });
  const fetch = async (url: string, init?: RequestInit): Promise<Response> => {
    const path = new URL(url).pathname.replace('/api/v10', '');
    const method = (init?.method ?? 'GET').toUpperCase();
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : {};
    const parts = path.split('/').filter(Boolean);
    const [first, second, third, fourth, fifth, sixth] = parts;
    if (method === 'GET' && path === '/users/@me') return answer(200, { id: BOT_USER, username: 'bot' });
    if (method === 'GET' && first === 'users' && second)
      return answer(200, { id: second, username: `user${second.slice(-2)}` });
    if (method === 'POST' && path === '/users/@me/channels') return answer(200, { id: DM_CHANNEL });
    if (method === 'PATCH' && first === 'webhooks') {
      world.answers.push(body);
      return answer(200, body);
    }
    if (first === 'channels' && second && third === 'messages') {
      if (method === 'POST' && !fourth) {
        if (world.closed.has(second)) return answer(403, { code: 50013, message: 'Missing Permissions' });
        const posted: Posted = { ...body, id: String(800000000000000000n + BigInt(++made)) };
        if (second === DM_CHANNEL) world.dms.push(posted);
        else world.posts.set(second, [...(world.posts.get(second) ?? []), posted]);
        return answer(200, posted);
      }
      if (method === 'PATCH' && fourth) {
        if (world.editsDown) return answer(503, { message: 'down' });
        const known = [...world.posts.values()].flat().some((post) => post.id === fourth);
        if (!known || world.deleted.has(fourth)) return answer(404, { code: 10008, message: 'Unknown Message' });
        const edit: Posted = { ...body, id: fourth };
        world.edits.push(edit);
        return answer(200, edit);
      }
      if (method === 'PUT' && fifth === 'reactions' && sixth) {
        world.reactions.push(decodeURIComponent(sixth));
        return new Response(null, { status: 204 });
      }
    }
    if (first === 'guilds' && third === 'members' && fourth) {
      const member = world.members.get(fourth);
      if (method === 'GET')
        return member
          ? answer(200, { user: { id: fourth }, roles: member.roles })
          : answer(404, { code: 10007, message: 'Unknown Member' });
      const role = parts[5];
      if (fifth === 'roles' && role) {
        if (world.refusedRoles.has(role)) return answer(403, { code: 50013, message: 'Missing Permissions' });
        const held = world.members.get(fourth) ?? { roles: [] };
        world.members.set(fourth, held);
        if (method === 'PUT' && !held.roles.includes(role)) held.roles.push(role);
        if (method === 'DELETE') held.roles = held.roles.filter((each) => each !== role);
        return new Response(null, { status: 204 });
      }
    }
    return answer(404, { message: 'no fake route', code: 0 });
  };
  return { world, fetch };
}

/**
 * The core's Gateway side with these modules on, answering through a remembering Discord. `settle` runs every answer
 * an interaction deferred.
 */
export async function standCommunity(
  settings: Readonly<Record<string, unknown>>,
  modules: readonly ServerModule[],
  vars: BotContext['vars'] = {},
) {
  const bot = await standGateway(settings, []);
  const discord = rememberingDiscord();
  const token = 'bot-token-for-tests';
  const pending: Array<Promise<unknown>> = [];
  const context: BotContext = {
    ...bot.context,
    vars: { DISCORD_BOT_TOKEN: token, BOT_URL: 'https://bot.example.workers.dev', ...vars },
    rest: createRest({ token, fetch: discord.fetch, sleep: async () => {} }),
    later: (work) => void pending.push(work),
  };
  bot.dispatcher.use(moduleHandlers(context, registryOf(modules)));
  const posts = (channel: string): Posted[] => discord.world.posts.get(channel) ?? [];
  const settingsOf = async (moduleId: string) => (await context.config(GUILD, moduleId))?.config ?? {};
  const settle = () => Promise.all(pending.splice(0));
  return { ...bot, context, world: discord.world, posts, settingsOf, settle };
}

/** An interaction from a member of the test server. */
export const interactionFrom = (
  userId: string,
  data: Interaction['data'],
  over: Partial<Interaction> = {},
): Interaction => ({
  type: 2,
  id: '700000000000000050',
  application_id: '900000000000000099',
  token: 'interaction-token',
  guild_id: GUILD,
  channel_id: '900000000000000030',
  member: { user: { id: userId, username: `user${userId.slice(-2)}` }, roles: [] },
  data,
  ...over,
});

/** An actor for the panel's acts: the owner, who may give any role, unless `mayGive` says otherwise. */
export const actorOf = (
  mayGive: (roleIds: readonly string[]) => null | { role: string; why: string } = () => null,
) => ({
  id: '900000000000000160',
  name: 'Ann',
  avatar: null,
  roles: [],
  permissions: 0n,
  owner: true,
  mayGive,
});
