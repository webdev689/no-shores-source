/**
 * Find a Company's Durable Object: one for each run's base (`/v1/find/<base>`), carrying its seekers' sockets to its
 * `Finder` (finding.ts) and starting the runs due each second while any socket is open.
 */

import { DurableObject } from 'cloudflare:workers';
import { runInstance } from '../roomNames.ts';
import { Finder, findingAt, foundRun, seekerOf } from './finding.ts';

/** How often it starts the runs due. */
const FIND_TICK_MS = 1_000;

export class CompanyFinder extends DurableObject<{ readonly DB: D1Database }> {
  private finder: Finder | null = null;
  private ticking: ReturnType<typeof setInterval> | null = null;

  override fetch(request: Request): Response {
    const base = findingAt(request);
    if (base === null) return new Response('Find a Company is reached by WebSocket', { status: 426 });
    const database = this.env.DB;
    this.finder ??= new Finder(base, {
      seeker: (token) => seekerOf(database, token, Date.now()),
      found: (run, accounts) => foundRun(database, run, accounts, Date.now()),
      now: Date.now,
      instance: () => runInstance(),
    });
    const finder = this.finder;
    if (finder.full) return new Response('Find a Company is full', { status: 503 });
    const [client, server] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket];
    server.accept();
    const socket = finder.opened(server);
    server.addEventListener('message', (event) => void finder.heard(socket, event.data));
    server.addEventListener('close', () => this.left(socket));
    server.addEventListener('error', () => this.left(socket));
    this.ticking ??= setInterval(() => void finder.tick().then(() => this.idle()), FIND_TICK_MS);
    return new Response(null, { status: 101, webSocket: client });
  }

  /** A seeker gone: out of the queue, and the clock stopped once none is left. */
  private left(socket: number): void {
    this.finder?.closed(socket);
    this.idle();
  }

  /** Stops the clock once the finder holds no socket: those it closed itself may never say they closed. */
  private idle(): void {
    if (this.finder?.open === 0 && this.ticking) {
      clearInterval(this.ticking);
      this.ticking = null;
    }
  }
}
