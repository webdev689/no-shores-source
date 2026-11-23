/**
 * The chat's Durable Object: one hall for the whole game (`/v1/chat`), carrying every page's chat socket to its `Hall`
 * (chatHall.ts), and letting go each second the sockets that sent no token in time.
 */

import { DurableObject } from 'cloudflare:workers';
import { hallDeps } from './chatDeps.ts';
import { addressKey } from '../address.ts';
import { Hall } from './chatHall.ts';

/** How often the hall lets go the sockets that sent no token. */
const HALL_TICK_MS = 1_000;

/** Whether a request is for the chat: `/v1/chat`, by WebSocket. */
export function chatAt(request: Request): boolean {
  return request.headers.get('Upgrade') === 'websocket' && new URL(request.url).pathname === '/v1/chat';
}

export class ChatHall extends DurableObject<{ readonly DB: D1Database }> {
  private hall: Hall | null = null;
  private ticking: ReturnType<typeof setInterval> | null = null;

  override fetch(request: Request): Response {
    if (!chatAt(request)) return new Response('The chat is reached by WebSocket', { status: 426 });
    this.hall ??= new Hall(hallDeps(this.env.DB, Date.now));
    const hall = this.hall;
    const address = addressKey(request.headers.get('CF-Connecting-IP') ?? 'nowhere');
    if (!hall.admits(address)) return new Response('The chat is full', { status: 503 });
    const [client, server] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket];
    server.accept();
    const socket = hall.opened(server, address);
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
