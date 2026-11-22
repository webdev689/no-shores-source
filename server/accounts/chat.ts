/**
 * The chat's Durable Object: one hall for the whole game (`/v1/chat`), carrying every page's chat socket to its `Hall`
 * (chatHall.ts), and letting go each second the sockets that sent no token in time.
 */

import { DurableObject } from 'cloudflare:workers';
import { liveAccount } from './characters.ts';
import type { Db } from './database.ts';
import { Hall, type HallDeps } from './chatHall.ts';
import { accountNamed, blocks } from './people.ts';

/** How often the hall lets go the sockets that sent no token. */
const HALL_TICK_MS = 1_000;

/** Whether a request is for the chat: `/v1/chat`, by WebSocket. */
export function chatAt(request: Request): boolean {
  return request.headers.get('Upgrade') === 'websocket' && new URL(request.url).pathname === '/v1/chat';
}

/** What the hall asks of the accounts' database, at `now`. */
export function hallDeps(database: Db, now: () => number): HallDeps {
  return {
    now,
    async speaker(token) {
      const account = await liveAccount(database, token, now());
      if (account === null) return null;
      const row = await database
        .prepare('SELECT username FROM accounts WHERE id = ?1')
        .bind(account)
        .first<{ username: string | null }>();
      return { account, name: row?.username ?? null };
    },
    async places(accounts) {
      const { results } = await database
        .prepare(
          `SELECT accounts.id AS id,
           CASE WHEN characters.held_until > ?1 THEN substr(characters.holder, 1, instr(characters.holder, ':') - 1)
                WHEN presence.until > ?1 THEN presence.room END AS place
           FROM accounts
           LEFT JOIN characters ON characters.account_id = accounts.id
           LEFT JOIN presence ON presence.account_id = accounts.id
           WHERE accounts.id IN (SELECT value FROM json_each(?2))`,
        )
        .bind(now(), JSON.stringify(accounts))
        .all<{ id: string; place: string | null }>();
      return new Map(results.map((row) => [row.id, row.place]));
    },
    async apart(account) {
      const { results } = await database
        .prepare(
          `SELECT blocked_id AS other FROM blocks WHERE blocker_id = ?1
           UNION SELECT blocker_id AS other FROM blocks WHERE blocked_id = ?1`,
        )
        .bind(account)
        .all<{ other: string }>();
      return results.map((row) => row.other);
    },
    async named(name) {
      const found = await accountNamed(database, name);
      return found && { account: found.id, name: found.username };
    },
    blocks: (blocker, blocked) => blocks(database, blocker, blocked),
  };
}

export class ChatHall extends DurableObject<{ readonly DB: D1Database }> {
  private hall: Hall | null = null;
  private ticking: ReturnType<typeof setInterval> | null = null;

  override fetch(request: Request): Response {
    if (!chatAt(request)) return new Response('The chat is reached by WebSocket', { status: 426 });
    this.hall ??= new Hall(hallDeps(this.env.DB, Date.now));
    const hall = this.hall;
    if (hall.full) return new Response('The chat is full', { status: 503 });
    const [client, server] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket];
    server.accept();
    const socket = hall.opened(server);
    server.addEventListener('message', (event) => void hall.heard(socket, event.data));
    server.addEventListener('close', () => this.left(socket));
    server.addEventListener('error', () => this.left(socket));
    this.ticking ??= setInterval(() => {
      hall.tick();
      this.idle();
    }, HALL_TICK_MS);
    return new Response(null, { status: 101, webSocket: client });
  }

  private left(socket: number): void {
    this.hall?.closed(socket);
    this.idle();
  }

  /** Stops the clock once the hall holds no socket. */
  private idle(): void {
    if (this.hall?.open === 0 && this.ticking) {
      clearInterval(this.ticking);
      this.ticking = null;
    }
  }
}
