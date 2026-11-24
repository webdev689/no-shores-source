// A fake Discord and the platform around the bot, for the tests: Discord's REST and OAuth recording every call, real
// Ed25519 signatures for interactions, a Gateway namespace, an R2 bucket, and the Durable Object's SQL handle.

import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import type { SqlLike } from './cache.ts';
import type { Bucket } from './media.ts';
import type { Fetch } from './rest.ts';
import type { GatewayNamespace } from './worker.ts';

/** One call the bot made, as Discord saw it. */
export interface Call {
  readonly method: string;
  readonly path: string;
  readonly query: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
}
/** A fake route's answer: a status and JSON, or a whole Response. */
export type Answer = readonly [number, unknown] | Response;
export type Route = (call: Call) => Answer | Promise<Answer>;

export const ACCESS_TOKEN = 'acc-token-0000000000';

const headersOf = (init: RequestInit | undefined): Record<string, string> =>
  Object.fromEntries(
    Object.entries((init?.headers ?? {}) as Record<string, string>).map(([key, value]) => [key.toLowerCase(), value]),
  );

/**
 * A fake Discord. `routes` maps "METHOD /path" (ids literal) to an answer; a member's roles come from `members`, and
 * the person a sign-in names is `signedIn`, and the servers Discord says they are in are `guilds` (null: Discord does
 * not answer). Every call is recorded.
 */
export function fakeDiscord(routes: Readonly<Record<string, Route>> = {}, members = new Map<string, string[]>()) {
  const calls: Call[] = [];
  const world: { signedIn: Record<string, unknown>; guilds: string[] | null } = {
    signedIn: { id: '900000000000000010', username: 'mod', global_name: 'Mod' },
    guilds: [],
  };
  const base: Record<string, Route> = {
    'GET /api/v10/gateway/bot': () => [
      200,
      { url: 'wss://gateway.discord.gg', session_start_limit: { remaining: 999, reset_after: 0 } },
    ],
    'POST /api/v10/oauth2/token': (call) =>
      call.body.includes('code=goodcode')
        ? [200, { access_token: ACCESS_TOKEN, token_type: 'Bearer' }]
        : [400, { error: 'invalid_grant' }],
    'POST /api/v10/oauth2/token/revoke': () => [200, {}],
    'GET /api/v10/users/@me': (call) =>
      call.headers.authorization === `Bearer ${ACCESS_TOKEN}` ? [200, world.signedIn] : [401, {}],
    'GET /api/v10/users/@me/guilds': (call) =>
      call.headers.authorization !== `Bearer ${ACCESS_TOKEN}`
        ? [401, {}]
        : world.guilds === null
          ? [503, {}]
          : [200, world.guilds.map((id) => ({ id, name: `Server ${id.slice(-3)}` }))],
  };
  const fetch: Fetch = async (url, init) => {
    const address = new URL(url);
    const body = typeof init?.body === 'string' ? init.body : init?.body ? String(init.body) : '';
    const call: Call = {
      method: (init?.method ?? 'GET').toUpperCase(),
      path: address.pathname,
      query: address.search,
      headers: headersOf(init),
      body,
    };
    calls.push(call);
    const key = `${call.method} ${call.path}`;
    let route = routes[key] ?? base[key];
    const member = /^\/api\/v10\/guilds\/(\d+)\/members\/(\d+)$/.exec(call.path);
    if (!route && call.method === 'GET' && member) {
      const roles = members.get(member[2] ?? '');
      route = () =>
        roles ? [200, { user: { id: member[2] }, roles }] : [404, { code: 10007, message: 'Unknown Member' }];
    }
    if (!route) return Response.json({ message: 'no fake route', code: 0 }, { status: 404 });
    const answer = await route(call);
    return answer instanceof Response ? answer : Response.json(answer[1], { status: answer[0] });
  };
  return { fetch, calls, members, world };
}

/** An Ed25519 pair for the application, and a signer for interactions. */
export async function interactionKeys() {
  const pair = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  const publicKeyHex = Buffer.from(raw).toString('hex');
  /** A signed request to the interactions route. */
  const signed = async (body: unknown, { stamp = Math.floor(Date.now() / 1000) } = {}) => {
    const text = JSON.stringify(body);
    const signature = await crypto.subtle.sign(
      { name: 'Ed25519' },
      pair.privateKey,
      new TextEncoder().encode(String(stamp) + text),
    );
    return new Request('https://bot.test/v1/discord/interactions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-signature-ed25519': Buffer.from(signature).toString('hex'),
        'x-signature-timestamp': String(stamp),
      },
      body: text,
    });
  };
  return { publicKeyHex, signed };
}

/** A Gateway namespace: answers the status given, and records every path asked with its body. */
export function fakeGateway(status: unknown = { state: 'ready', live: true, latencyMs: 42 }) {
  const asked: Array<{ path: string; body: unknown }> = [];
  const stub = {
    async fetch(url: string, init?: RequestInit) {
      const path = new URL(url).pathname;
      asked.push({ path, body: typeof init?.body === 'string' ? JSON.parse(init.body) : null });
      return Response.json(path === '/config' ? { ok: true } : status);
    },
  };
  const namespace: GatewayNamespace = { idFromName: (name) => name, get: () => stub };
  return { namespace, asked };
}

/** An R2 bucket in memory: put, get and delete, each object with its type. */
export function fakeBucket() {
  const held = new Map<string, { bytes: Uint8Array<ArrayBuffer>; contentType: string }>();
  const bucket: Bucket & { held: typeof held } = {
    held,
    async put(key, bytes, options) {
      held.set(key, { bytes: new Uint8Array(bytes), contentType: options.httpMetadata.contentType });
    },
    async get(key) {
      const found = held.get(key);
      return found ? { body: found.bytes.slice().buffer, httpMetadata: { contentType: found.contentType } } : null;
    },
    async delete(key) {
      held.delete(key);
    },
  };
  return bucket;
}

/** The Durable Object's SQL handle over node:sqlite. */
export function fakeSql(): SqlLike {
  const sqlite = new DatabaseSync(':memory:');
  return {
    exec(query, ...bindings) {
      const statement = sqlite.prepare(query);
      const values = bindings as SQLInputValue[];
      const rows = /^\s*(SELECT|WITH)\b/i.test(query)
        ? (statement.all(...values) as Record<string, unknown>[])
        : (statement.run(...values), []);
      return { toArray: () => rows };
    },
  };
}
