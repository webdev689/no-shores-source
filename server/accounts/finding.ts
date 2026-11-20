/**
 * Find a Company: a queue for each run's base, by level band, and the runs found for the players matched in it. Each
 * seeker's socket first sends their session's token; the band is read from the level their room last kept. A run
 * starts with four of a band, or fewer once its first has waited a minute, keeping apart any two where one blocks the
 * other. A group found is no company: the accounts keep whom each run was found for (`found_runs`), and that run's
 * room lets them in together, for that run alone. The Abyss Dungeon of the week is never matched.
 */

import { RUN_MOST } from '../roomNames.ts';
import { liveAccount } from './characters.ts';
import type { Db } from './database.ts';
import { TOKEN, TOKEN_WAIT_MS } from '../keeping.ts';

/** How long the first seeker of a band waits before a run starts with fewer than four: the design's minute. */
export const FIND_WAIT_MS = 60_000;
/** The levels a band spans: those within one ten are matched together. */
export const BAND_LEVELS = 10;
/** The most sockets with a token one finder holds: a guard, as the rooms' is. A socket with none is let go once
 *  TOKEN_WAIT_MS has passed, so silent ones never fill it. */
export const FINDING_MOST = 64;
/** Why a search ends whose account searches in another tab. */
const ANOTHER_TAB = 'You are finding a company in another tab.';
/** The longest base a run is found for, so its run's name (`--run-` and eight more) fits a room's 64. */
const BASE_MOST = 50;
/** An Elite Dungeon's base at Normal, or the week's at Elite, as Find a Company is asked for it by WebSocket. */
const FINDING = /^\/v1\/find\/(node-[a-z0-9]+(?:-[a-z0-9]+)*(?:--elite)?)$/;

/** The band a level is matched in: 1 to 10 the first, 11 to 20 the second, 21 to 30 the third. */
export function bandOf(level: number): number {
  return Math.floor((Math.max(1, level) - 1) / BAND_LEVELS);
}

/** The run's base a Find a Company request is for, `/v1/find/<base>` by WebSocket: an Elite Dungeon at Normal
 *  (`node-<id>`) or the week's at Elite (`node-<id>--elite`), short enough that its run's name fits 64; never the
 *  Abyss Dungeon of the week, a patrol's dungeon or a run. Null for any other request. */
export function findingAt(request: Request): string | null {
  if (request.headers.get('Upgrade') !== 'websocket') return null;
  const base = FINDING.exec(new URL(request.url).pathname)?.[1];
  return base !== undefined && base.length <= BASE_MOST ? base : null;
}

/** One waiting for a run: their socket's number, account, band, when they began, and whom they are kept apart from. */
export interface Seeker {
  readonly socket: number;
  readonly account: string;
  readonly band: number;
  readonly since: number;
  readonly apart: readonly string[];
}

/** Whether two seekers may share a run: neither blocks the other. */
const together = (one: Seeker, other: Seeker) =>
  !one.apart.includes(other.account) && !other.apart.includes(one.account);

/** Those waiting for runs of one dungeon. */
export class Queue {
  private waiting: Seeker[] = [];

  /** Puts a seeker in: the socket of the same account's older search to let go, or null. The newer socket stays
   *  whichever lookup answered first, so a search is never ended by an older tab's. */
  join(seeker: Seeker): number | null {
    const earlier = this.waiting.find((one) => one.account === seeker.account) ?? null;
    if (earlier && earlier.socket > seeker.socket) return seeker.socket;
    this.waiting = [...this.waiting.filter((one) => one !== earlier), seeker];
    return earlier?.socket ?? null;
  }

  leave(socket: number): void {
    this.waiting = this.waiting.filter((one) => one.socket !== socket);
  }

  /** The runs to start at `now`, taken out of the queue, in the order their first joined. Within a band, oldest first,
   *  each with the oldest still free who block none of those taken: four as soon as there are four, or as many as
   *  there are once its first has waited FIND_WAIT_MS. */
  due(now: number): Seeker[][] {
    const oldest = [...this.waiting].sort((one, other) => one.since - other.since);
    const taken = new Set<Seeker>();
    const runs: Seeker[][] = [];
    for (const first of oldest) {
      if (taken.has(first)) continue;
      const group = [first];
      for (const other of oldest) {
        if (group.length === RUN_MOST) break;
        const free = other !== first && !taken.has(other) && other.band === first.band;
        if (free && group.every((one) => together(one, other))) group.push(other);
      }
      if (group.length < RUN_MOST && now - first.since < FIND_WAIT_MS) continue;
      for (const one of group) taken.add(one);
      runs.push(group);
    }
    this.waiting = this.waiting.filter((one) => !taken.has(one));
    return runs;
  }

  get size(): number {
    return this.waiting.length;
  }
}

/** A session's account, the level its room last kept (1 for none yet), and whom it blocks or is blocked by, by id;
 *  null for a token that is no live session. */
export async function seekerOf(
  database: Db,
  token: string,
  now: number,
): Promise<{ account: string; level: number; apart: string[] } | null> {
  const account = await liveAccount(database, token, now);
  if (account === null) return null;
  const kept = await database
    .prepare(`SELECT json_extract(body, '$.shown.level') AS level FROM characters WHERE account_id = ?1`)
    .bind(account)
    .first<{ level: number | null }>();
  const { results } = await database
    .prepare(
      `SELECT blocked_id AS other FROM blocks WHERE blocker_id = ?1
       UNION SELECT blocker_id AS other FROM blocks WHERE blocked_id = ?1 ORDER BY other`,
    )
    .bind(account)
    .all<{ other: string }>();
  return { account, level: Number(kept?.level ?? 1) || 1, apart: results.map((row) => row.other) };
}

/** A seeker's socket, as the finder speaks to it. */
export interface FinderSocket {
  send(text: string): void;
  close(code: number, reason: string): void;
}

/** What a finder needs: who a token's seeker is, a way to keep whom a run was found for, a clock and an instance. */
export interface FinderDeps {
  seeker(token: string): Promise<{ account: string; level: number; apart: readonly string[] } | null>;
  found(run: string, accounts: readonly string[]): Promise<boolean>;
  readonly now: () => number;
  readonly instance: () => string;
}

/** One dungeon's Find a Company: each socket's first message is its session's token; each run found is told to its
 *  seekers as {"run":"<base>--run-<instance>"} and their sockets closed. */
export class Finder {
  private readonly base: string;
  private readonly deps: FinderDeps;
  private readonly queue = new Queue();
  /** The accounts whose run is being started, out of the queue until their group is told: no second tab joins
   *  another group meanwhile. */
  private readonly starting = new Set<string>();
  /** Each socket held, by its number, when it opened, and whether its token has come. */
  private readonly sockets = new Map<
    number,
    { readonly socket: FinderSocket; readonly since: number; heard: boolean }
  >();
  private next = 1;

  constructor(base: string, deps: FinderDeps) {
    this.base = base;
    this.deps = deps;
  }

  opened(socket: FinderSocket): number {
    const number = this.next++;
    this.sockets.set(number, { socket, since: this.deps.now(), heard: false });
    return number;
  }

  async heard(socket: number, message: string | ArrayBuffer): Promise<void> {
    const held = this.sockets.get(socket);
    if (!held) return;
    if (held.heard || typeof message !== 'string' || !TOKEN.test(message))
      return this.letGo(socket, 1008, 'not a token');
    held.heard = true;
    const found = await this.deps.seeker(message).catch(() => undefined);
    // A socket closed while its seeker was looked up is no one's to put in.
    if (this.sockets.get(socket) !== held) return;
    if (found === undefined) return this.letGo(socket, 1011, 'the accounts did not answer');
    if (found === null) return this.letGo(socket, 4003, 'Sign in to find a company.');
    const { account, level, apart } = found;
    if (this.starting.has(account)) return this.letGo(socket, 4003, ANOTHER_TAB);
    const replaced = this.queue.join({ socket, account, band: bandOf(level), since: this.deps.now(), apart });
    if (replaced !== null) this.letGo(replaced, 4003, ANOTHER_TAB);
  }

  closed(socket: number): void {
    this.sockets.delete(socket);
    this.queue.leave(socket);
  }

  /** Lets go each socket that sent no token in time, then starts each run due: kept for its seekers, then told to
   *  each still here, whose socket closes. */
  async tick(): Promise<void> {
    const late = this.deps.now() - TOKEN_WAIT_MS;
    for (const [number, held] of this.sockets)
      if (!held.heard && held.since <= late) this.letGo(number, 4003, 'Sign in to find a company.');
    const due = this.queue.due(this.deps.now());
    for (const one of due.flat()) this.starting.add(one.account);
    for (const group of due) {
      const run = `${this.base}--run-${this.deps.instance()}`;
      const kept = await this.deps
        .found(
          run,
          group.map((one) => one.account),
        )
        .catch(() => false);
      for (const { socket } of group) {
        const held = this.sockets.get(socket);
        if (!held) continue;
        if (!kept) {
          this.letGo(socket, 1011, 'the run could not be kept');
          continue;
        }
        held.socket.send(JSON.stringify({ run }));
        this.letGo(socket, 1000, 'found');
      }
      for (const one of group) this.starting.delete(one.account);
    }
  }

  get waiting(): number {
    return this.queue.size;
  }

  get open(): number {
    return this.sockets.size;
  }

  /** Whether it holds as many sockets with a token as it takes. */
  get full(): boolean {
    return [...this.sockets.values()].filter((held) => held.heard).length >= FINDING_MOST;
  }

  /** Closes a socket, taking it out of the queue first. */
  private letGo(socket: number, code: number, reason: string): void {
    const held = this.sockets.get(socket);
    this.closed(socket);
    held?.socket.close(code, reason);
  }
}

/** How long the accounts keep whom a run was found for: a day, far past any run. */
export const FOUND_KEPT_MS = 24 * 60 * 60_000;

/** Keeps that `run` was found for `accounts`, so its room lets them in together, forgetting runs found more than
 *  FOUND_KEPT_MS ago; false if it could not be kept. */
export async function foundRun(database: Db, run: string, accounts: readonly string[], now: number): Promise<boolean> {
  try {
    await database
      .prepare('DELETE FROM found_runs WHERE found_at < ?1')
      .bind(now - FOUND_KEPT_MS)
      .run();
    if (accounts.length === 0) return true;
    const rows = accounts.map((_account, index) => `(?1, ?2, ?${index + 3})`).join(', ');
    await database
      .prepare(`INSERT OR REPLACE INTO found_runs (room, found_at, account_id) VALUES ${rows}`)
      .bind(run, now, ...accounts)
      .run();
    return true;
  } catch {
    return false;
  }
}
