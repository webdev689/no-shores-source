// A fake Discord server for the layout's tests: it keeps the roles, channels, members, messages, settings and welcome
// screen the bot makes, refuses what Discord refuses (an announcement channel before Community), and records every
// call, so a test reads back what a build or a plan did.

import { GUILD, OWNER, freshDatabase } from '../botForTests.ts';
import { PERMISSION, type PermissionName } from '../law/access.ts';
import { recordOf } from '../law/settings.ts';
import type { BotContext } from '../kit.ts';
import { createRest } from '../rest.ts';
import { readConfig, readSnapshot, snapshotOfGuild, writeSnapshot } from '../store.ts';
import type { Actor } from '../modules/module.ts';
import { BOT_PERMISSIONS } from './noShores.ts';

export const BOT = '900000000000000098';
export const BOT_ROLE = '900000000000000022';
export const APPLICATION = '900000000000000099';
/** The invite the bot first went out with: without what lets the moderators manage threads and mute. */
export const FIRST_INVITE: readonly PermissionName[] = BOT_PERMISSIONS.filter(
  (name) => !['MANAGE_THREADS', 'MUTE_MEMBERS', 'CREATE_PUBLIC_THREADS', 'SEND_MESSAGES_IN_THREADS'].includes(name),
);

export const OWNER_ACTOR: Actor = {
  id: OWNER,
  name: 'Owner',
  roles: [],
  permissions: 0n,
  owner: true,
  mayGive: () => null,
};

type Thing = Record<string, unknown>;
const bitsOf = (names: readonly PermissionName[]) => names.reduce((sum, name) => sum | PERMISSION[name], 0n);

/** A server holding only @everyone and the bot's own role, the bot's role at the top. */
export function fakeGuild(botPermissions: readonly PermissionName[] = BOT_PERMISSIONS) {
  let made = 0;
  const nextId = () => String(910000000000000000n + BigInt(++made));
  const guild: Thing = {
    id: GUILD,
    name: 'No Shores',
    icon: null,
    owner_id: OWNER,
    features: [] as string[],
    verification_level: 0,
    default_message_notifications: 0,
    explicit_content_filter: 0,
  };
  const state = {
    guild,
    roles: [
      {
        id: GUILD,
        name: '@everyone',
        position: 0,
        permissions: String(bitsOf(['VIEW_CHANNEL', 'SEND_MESSAGES', 'MENTION_EVERYONE'])),
        managed: false,
      },
      { id: BOT_ROLE, name: 'No Shores', position: 50, permissions: String(bitsOf(botPermissions)), managed: true },
    ] as Thing[],
    channels: [] as Thing[],
    members: new Map<string, string[]>([
      [BOT, [BOT_ROLE]],
      [OWNER, []],
    ]),
    messages: new Map<string, Thing[]>(),
    welcomeScreen: null as Thing | null,
    calls: [] as Array<{ method: string; path: string; body: Thing }>,
  };
  const answer = (status: number, body: unknown) => Response.json(body, { status });
  const refuse = (message: string) => answer(400, { code: 50035, message });
  const fetch = async (url: string, init?: RequestInit): Promise<Response> => {
    const path = new URL(url).pathname.replace('/api/v10', '');
    const method = (init?.method ?? 'GET').toUpperCase();
    const body = typeof init?.body === 'string' ? recordOf(JSON.parse(init.body)) : {};
    state.calls.push({ method, path, body });
    const [first, second, third, fourth, fifth, sixth] = path.split('/').filter(Boolean);
    if (path === '/users/@me') return answer(200, { id: BOT, username: 'No Shores', avatar: null });
    if (first === 'guilds' && second === GUILD) {
      if (!third && method === 'GET') return answer(200, { ...guild, roles: state.roles });
      if (!third && method === 'PATCH') {
        Object.assign(guild, body);
        return answer(200, guild);
      }
      if (third === 'channels' && method === 'GET') return answer(200, state.channels);
      if (third === 'channels' && method === 'POST') {
        const features = guild.features as string[];
        if (body.type === 5 && !features.includes('COMMUNITY'))
          return refuse('Announcement channels need the server to be a Community server');
        const channel = { ...body, id: nextId(), parent_id: body.parent_id ?? null, position: state.channels.length };
        state.channels.push(channel);
        return answer(201, channel);
      }
      if (third === 'roles' && method === 'POST') {
        for (const role of state.roles) if (Number(role.position) >= 1) role.position = Number(role.position) + 1;
        const role = { ...body, id: nextId(), position: 1, managed: false };
        state.roles.push(role);
        return answer(200, role);
      }
      if (third === 'roles' && fourth && method === 'PATCH') {
        const role = state.roles.find((each) => each.id === fourth);
        if (!role) return answer(404, { message: 'Unknown Role' });
        Object.assign(role, body);
        return answer(200, role);
      }
      if (third === 'welcome-screen' && method === 'PATCH') {
        state.welcomeScreen = body;
        return answer(200, body);
      }
      if (third === 'members' && fourth) {
        const held = state.members.get(fourth);
        if (!held) return answer(404, { message: 'Unknown Member' });
        if (method === 'GET') return answer(200, { user: { id: fourth }, roles: held });
        if (fifth === 'roles' && sixth && method === 'PUT') {
          state.members.set(fourth, [...held.filter((role) => role !== sixth), sixth]);
          return new Response(null, { status: 204 });
        }
      }
    }
    if (first === 'channels' && second) {
      const channel = state.channels.find((each) => each.id === second);
      if (!channel) return answer(404, { message: 'Unknown Channel' });
      if (!third && method === 'PATCH') {
        Object.assign(channel, body);
        return answer(200, channel);
      }
      if (!third && method === 'DELETE') {
        state.channels = state.channels.filter((each) => each.id !== second);
        return answer(200, channel);
      }
      const posts = state.messages.get(second) ?? [];
      if (third === 'messages' && !fourth && method === 'GET') return answer(200, [...posts].reverse());
      if (third === 'messages' && !fourth && method === 'POST') {
        const message = { ...body, id: nextId(), channel_id: second, author: { id: BOT } };
        state.messages.set(second, [...posts, message]);
        return answer(200, message);
      }
      if (third === 'messages' && fourth && method === 'PATCH') {
        const message = posts.find((each) => each.id === fourth);
        if (!message) return answer(404, { code: 10008, message: 'Unknown Message' });
        Object.assign(message, body);
        return answer(200, message);
      }
    }
    return answer(404, { message: `No fake route for ${method} ${path}` });
  };
  /** The channel by its name, and the messages in it. */
  const channelNamed = (name: string) => state.channels.find((channel) => channel.name === name);
  const postsIn = (name: string) => state.messages.get(String(channelNamed(name)?.id)) ?? [];
  const roleNamed = (name: string) => state.roles.find((role) => role.name === name);
  const changes = () => state.calls.filter((call) => call.method !== 'GET');
  return { state, fetch, channelNamed, postsIn, roleNamed, changes };
}

/** The bot's context over a fake server, its database holding the server's snapshot as the Gateway saw it. */
export async function standLayout(botPermissions?: readonly PermissionName[]) {
  const server = fakeGuild(botPermissions);
  const database = freshDatabase();
  await writeSnapshot(database, snapshotOfGuild({ ...server.state.guild, roles: server.state.roles, channels: [] }, 1));
  const forgotten: string[] = [];
  const context: BotContext = {
    vars: { DISCORD_BOT_TOKEN: `token-${Math.random()}`, DISCORD_APPLICATION_ID: APPLICATION },
    database,
    rest: createRest({ token: 'bot-token-for-tests', fetch: server.fetch }),
    now: () => 1_764_000_000_000,
    log: () => {},
    config: (guildId, moduleId) => readConfig(database, guildId, moduleId),
    snapshot: (guildId) => readSnapshot(database, guildId),
    later: () => {},
    forget: async (_guildId, moduleId) => void forgotten.push(moduleId),
  };
  const picture = async () => 'data:image/png;base64,iVBORw0KGgo=';
  return { server, database, context, forgotten, picture };
}
