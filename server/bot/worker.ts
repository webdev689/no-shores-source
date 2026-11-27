// The bot's Worker: Discord's interactions, the panel's sign-in and API, uploaded pictures, a health check, each
// module's own public routes, and the clock that keeps the Gateway running and the database tidy. Each route lives
// in its own file; this one only wires them. Its secrets, put by the deploy: DISCORD_BOT_TOKEN, DISCORD_CLIENT_SECRET
// and CARD_SIGNING_KEY.

import {
  CALLBACK_PATH,
  SESSION_IDLE_S,
  SESSION_MAX_S,
  STATE_KEEP_S,
  TICKET_KEEP_S,
  exchange,
  finishLogin,
  startLogin,
} from './auth.ts';
import { GATEWAY_NAME } from './gateway.ts';
import { corsFor, fail, json } from './http.ts';
import { INTERACTION_PATH, interactionRoute } from './interactions.ts';
import { type BotContext, type Vars, createConfigCache, errorWords } from './kit.ts';
import { type Bucket, MEDIA_PATH, mediaKey, serveMedia } from './media.ts';
import { panelRoute } from './panel.ts';
import { REGISTRY, type Registry } from './registry.ts';
import { type Fetch, type Rest, createRest } from './rest.ts';
import { type Db, forgetLeftServers, readSnapshot, sweep } from './store.ts';

export { BotGateway } from './gateway.ts';

/** The Gateway's namespace, as the binding gives it. */
export interface GatewayNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(url: string, init?: RequestInit): Promise<Response> };
}
export interface Env extends Vars {
  readonly BOT_DB: Db;
  /** Pictures servers upload; without it, uploads say they are not set up. */
  readonly BOT_MEDIA?: Bucket;
  readonly GATEWAY: GatewayNamespace;
}
/** What outlives an answer: the runtime's `waitUntil`. */
export interface Execution {
  waitUntil(work: Promise<unknown>): void;
}
/** What a test hands in instead of the platform's: the network, the clock and the modules. */
export interface Over {
  readonly fetch?: Fetch;
  readonly nowMs?: number;
  readonly registry?: Registry;
}

/** Moves on every change to what the Worker answers, so a deploy can tell the new code is live. */
export const BOT_VERSION = 'core1';
/** A Worker isolate cannot hear the panel's saves, so it trusts a module's settings this long. */
export const WORKER_CONFIG_KEEP_MS = 30_000;

/** One REST door per isolate and token, so its rate-limit memory is shared by every request the isolate serves. */
const rests = new Map<string, Rest>();
function restOf(vars: Vars, given: Fetch | undefined): Rest {
  const token = String(vars.DISCORD_BOT_TOKEN ?? '');
  if (given) return createRest({ token, fetch: given });
  const kept = rests.get(token) ?? createRest({ token });
  if (rests.size > 4) rests.clear();
  rests.set(token, kept);
  return kept;
}

const configCaches = new WeakMap<Db, ReturnType<typeof createConfigCache>>();

/** The context a module runs in on the Worker: interactions, the clock and the panel's acts. */
export function workerContext(env: Env, execution: Execution, now: () => number, over: Over = {}): BotContext {
  let configs = configCaches.get(env.BOT_DB);
  if (!configs) {
    configs = createConfigCache(env.BOT_DB, now, WORKER_CONFIG_KEEP_MS);
    configCaches.set(env.BOT_DB, configs);
  }
  const held = configs;
  return {
    vars: env,
    database: env.BOT_DB,
    rest: restOf(env, over.fetch),
    now,
    log: (line) => console.warn(line),
    config: (guildId, moduleId) => held.get(guildId, moduleId),
    snapshot: (guildId) => readSnapshot(env.BOT_DB, guildId),
    later: (work) =>
      execution.waitUntil(work.catch((error) => console.warn(`[bot] later work failed: ${errorWords(error)}`))),
    async forget(guildId, moduleId) {
      held.forget(guildId, moduleId);
      const told = JSON.stringify({ guildId, module: moduleId });
      await askGateway(env, '/config', { method: 'POST', body: told }).catch(() => null);
    },
  };
}

async function askGateway(env: Env, path: string, init?: RequestInit): Promise<unknown> {
  const answer = await env.GATEWAY.get(env.GATEWAY.idFromName(GATEWAY_NAME)).fetch(`https://gateway${path}`, init);
  return answer.json();
}

export async function handle(request: Request, env: Env, execution: Execution, over: Over = {}): Promise<Response> {
  const url = new URL(request.url);
  const nowMs = over.nowMs ?? Date.now();
  const nowS = Math.floor(nowMs / 1000);
  const registry = over.registry ?? REGISTRY;
  const cors = corsFor(env, request);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (url.pathname === '/health') return json({ ok: true, version: BOT_VERSION, commit: String(env.BOT_COMMIT ?? '') });
  const context = workerContext(env, execution, () => over.nowMs ?? Date.now(), over);
  if (url.pathname === INTERACTION_PATH) return interactionRoute({ ...context, nowS, registry }, request);
  if (url.pathname.startsWith(MEDIA_PATH) && request.method === 'GET')
    return serveMedia(env.BOT_MEDIA ?? null, url.pathname);
  const auth = {
    vars: env,
    database: env.BOT_DB,
    fetch: over.fetch ?? ((to: string, init?: RequestInit) => fetch(to, init)),
    nowS,
    later: (work: Promise<unknown>) => execution.waitUntil(work.catch(() => {})),
    selfOrigin: url.origin,
    cors,
    ip: request.headers.get('cf-connecting-ip') ?? 'unknown',
  };
  if (url.pathname === '/v1/auth/discord' && request.method === 'GET') return startLogin(auth, url);
  if (url.pathname === CALLBACK_PATH && request.method === 'GET')
    return finishLogin(auth, url, request.headers.get('Cookie'));
  if (url.pathname === '/v1/auth/exchange' && request.method === 'POST') return exchange(auth, request);
  const panel = await panelRoute(
    {
      vars: env,
      database: env.BOT_DB,
      rest: context.rest,
      nowS,
      nowMs,
      cors,
      bot: context,
      media: env.BOT_MEDIA ?? null,
      registry,
      gateway: (path, init) => askGateway(env, path, init),
    },
    request,
    url,
  );
  if (panel) return panel;
  // a module's own routes come last, so none can take over the sign-in's or the panel's
  for (const shape of registry.modules) {
    const answered = await shape.fetch?.(context, request, url);
    if (answered) return answered;
  }
  return fail('route', 404, cors);
}

/**
 * The minute's clock: the Gateway made sure of, each module's minute run, and once an hour the database swept. A
 * module's job that throws is logged and stops no other.
 */
export async function tick(env: Env, nowMs: number, execution: Execution, over: Over = {}): Promise<void> {
  await askGateway(env, '/ensure').catch((error) =>
    console.warn(`[bot] the Gateway did not answer: ${errorWords(error)}`),
  );
  const context = workerContext(env, execution, () => nowMs, over);
  for (const shape of (over.registry ?? REGISTRY).modules) {
    try {
      await shape.minute?.(context);
    } catch (error) {
      console.warn(`[bot] ${shape.id}'s minute failed: ${errorWords(error)}`);
    }
  }
  if (new Date(nowMs).getUTCMinutes() !== 17) return;
  await askGateway(env, '/sweep').catch(() => null);
  await sweep(env.BOT_DB, Math.floor(nowMs / 1000), {
    stateS: STATE_KEEP_S,
    ticketS: TICKET_KEEP_S,
    sessionIdleS: SESSION_IDLE_S,
    sessionMaxS: SESSION_MAX_S,
  });
  // a picture the bucket will not let go of now is logged and stays; the bot never names it again
  await forgetLeftServers(env.BOT_DB, Math.floor(nowMs / 1000), async (ids) => {
    for (const id of ids)
      await env.BOT_MEDIA?.delete(mediaKey(id)).catch((error) =>
        console.warn(`[bot] a picture stayed: ${errorWords(error)}`),
      );
  });
}

export default {
  fetch: (request: Request, env: Env, execution: Execution) => handle(request, env, execution),
  scheduled: (controller: { readonly scheduledTime?: number }, env: Env, execution: Execution) =>
    execution.waitUntil(tick(env, Number(controller.scheduledTime) || Date.now(), execution)),
};
