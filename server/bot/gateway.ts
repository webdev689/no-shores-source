// The Durable Object that holds the bot's one Gateway connection. One instance, by name, for the whole bot. The
// Worker reaches it for its status and to make sure it runs; Discord's events reach the dispatcher through it.

import { type Cache, type SqlLike, createCache } from './cache.ts';
import { type Dispatcher, createDispatcher } from './dispatch.ts';
import { GatewayCore, type SocketLike, type StorageLike } from './gatewayCore.ts';
import { type BotContext, pruneMemory } from './kit.ts';
import { REGISTRY, moduleHandlers } from './registry.ts';
import { REST_TIMEOUT_MS, createRest } from './rest.ts';
import type { Env } from './worker.ts';

/** The one instance's name. */
export const GATEWAY_NAME = 'main';
/** How long a message's words are kept for the edit and delete logs. */
export const MESSAGE_KEEP_MS = 7 * 86_400_000;

/** The part of the Durable Object's state the Gateway uses. */
export interface GatewayState {
  readonly storage: StorageLike & {
    readonly sql: SqlLike;
    setAlarm(scheduledTime: number): Promise<void>;
  };
}

/**
 * Workers open an outbound WebSocket with a fetch that asks to upgrade; the answer carries the socket. It waits no
 * longer than a REST call: one connection attempt runs at a time, so an upgrade that never answers would hold every
 * alarm. The wait ends with the answer, so it never reaches the socket the answer carries.
 */
export async function openSocket(url: string, waitMs = REST_TIMEOUT_MS): Promise<SocketLike> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('Discord did not answer in time')), waitMs);
  let response: Response;
  try {
    response = await fetch(url, { headers: { upgrade: 'websocket' }, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
  const socket = (response as unknown as { webSocket?: SocketLike & { accept(): void } }).webSocket;
  if (!socket) throw new Error(`Discord answered ${response.status} instead of a WebSocket`);
  socket.accept();
  return socket;
}

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const said = (error: unknown) => (error instanceof Error ? error.message : String(error));

export class BotGateway {
  readonly cache: Cache;
  readonly dispatcher: Dispatcher;
  readonly memory = new Map<string, unknown>();
  readonly core: GatewayCore;

  constructor(state: GatewayState, env: Env) {
    const rest = createRest({ token: env.DISCORD_BOT_TOKEN });
    const database = env.BOT_DB;
    this.cache = createCache(state.storage.sql);
    this.dispatcher = createDispatcher({ database, now: Date.now, cache: this.cache });
    const context: BotContext = {
      vars: env,
      database,
      rest,
      now: Date.now,
      log: (line) => console.warn(line),
      config: (guildId, moduleId) => this.dispatcher.config(guildId, moduleId),
      snapshot: (guildId) => this.dispatcher.snapshot(guildId),
      later: (work) => void work.catch((error) => console.warn(`[bot] later work failed: ${said(error)}`)),
      cache: this.cache,
      memory: this.memory,
    };
    this.dispatcher.use(moduleHandlers(context, REGISTRY));
    this.core = new GatewayCore({
      token: String(env.DISCORD_BOT_TOKEN ?? ''),
      storage: state.storage,
      openSocket,
      setAlarm: (when) => state.storage.setAlarm(when),
      now: Date.now,
      chance: Math.random,
      async gatewayBot() {
        const answer = await rest.get('/gateway/bot');
        const found = (answer.ok ? answer.json : null) as {
          url?: unknown;
          session_start_limit?: { remaining?: unknown; reset_after?: unknown };
        } | null;
        if (typeof found?.url !== 'string') return null;
        const limit = found.session_start_limit ?? {};
        return {
          url: found.url,
          remaining: typeof limit.remaining === 'number' ? limit.remaining : 1,
          resetAfterMs: Number(limit.reset_after) || 0,
        };
      },
      onDispatch: (type, data) =>
        this.dispatcher.dispatch(type, (data && typeof data === 'object' ? data : {}) as Record<string, unknown>),
    });
  }

  async fetch(request: Request): Promise<Response> {
    switch (new URL(request.url).pathname) {
      case '/ensure':
        return reply(await this.core.ensure());
      case '/status':
        await this.core.load();
        return reply({ ...this.core.status, live: this.core.live });
      case '/restart':
        return reply(await this.core.restart());
      case '/stop':
        await this.core.stop();
        return reply(this.core.status);
      case '/sweep':
        this.cache.sweepMessages(Date.now() - MESSAGE_KEEP_MS);
        return reply({ ok: true });
      case '/config': {
        const body = (await request.json().catch(() => null)) as { guildId?: unknown; module?: unknown } | null;
        if (body?.guildId && body.module) this.dispatcher.forget(String(body.guildId), String(body.module));
        return reply({ ok: true });
      }
      default:
        return reply({ error: 'route' }, 404);
    }
  }

  async alarm(): Promise<void> {
    await this.core.alarm();
    // the member counts that moved since their last write go down with the heartbeat, and the memory lets go of the
    // members no window holds any more
    await this.dispatcher.flush().catch((error) => console.warn(`[bot] the counts were not written: ${said(error)}`));
    pruneMemory(this.memory, Date.now());
  }
}
