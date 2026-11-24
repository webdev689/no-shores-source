/**
 * Find a Company: a queue for each run's base, by level band, and the runs found for the players matched in it. Each
 * seeker's socket first sends their session's token; the band is read from the level their room last kept. A run
 * starts with four of a band, or fewer once its first has waited a minute, keeping apart any two where one blocks the
 * other. A group found is no company: the accounts keep whom each run was found for (`found_runs`), and that run's
 * room lets them in together, for that run alone. The Abyss Dungeon of the week is never matched. The two playlists
 * have a queue each, banded by five levels, whose runs are drawn as they are found (playlists.ts). A Breach's run is
 * launched for its seeker's company from the Playlist, up to eight, never matched.
 */

import { type BREACH_TIERS, RUN_MOST } from '../roomNames.ts';
import { liveAccount } from './characters.ts';
import { FOUND_KEPT_MS } from './companies.ts';
import type { Db } from './database.ts';
import { apartFrom } from './people.ts';
import { TOKEN, TOKEN_WAIT_MS } from '../keeping.ts';
import {
  WEEK_ELITE_OPENS,
  WEEK_ELITE_SHUT,
  drawnOf,
  playlistBand,
  playlistOf,
  playlistRun,
  playlistShut,
} from './playlists.ts';

/** How long the first seeker of a band waits before a run starts with fewer than four: the design's minute. */
export const FIND_WAIT_MS = 60_000;
/** The levels a band spans: those within one ten are matched together. */
export const BAND_LEVELS = 10;
/** The most sockets with a token one finder holds: a guard, as the rooms' is. It holds twice this in all, silent ones
 *  too, and lets go one that sent no token once TOKEN_WAIT_MS has passed, so silent ones fill it for that long at
 *  most. */
export const FINDING_MOST = 64;
/** Why a search ends whose account searches in another tab. */
const ANOTHER_TAB = 'You are finding a company in another tab.';
/** The longest base a run is found for, so its run's name (`--run-` and eight more) fits a room's 64. */
const BASE_MOST = 50;
/** An Elite Dungeon's base at Normal, the week's at Elite (`--sea` after it from the Playlist, whose run is started
 *  at sea), a Breach's at its tier (`node-<its gate's zone>--breach-<tier>`), or a playlist's, as Find a Company is
 *  asked for it by WebSocket. */
const FINDING =
  /^\/v1\/find\/(node-[a-z0-9]+(?:-[a-z0-9]+)*(?:--elite(?:--sea)?|--breach-(?:normal|hard))?|playlist-(?:elite|abyss))$/;
/** A Breach's base, and the level each of its tiers opens at (`gear::breach::Tier::opens_at`), in the gate's words. */
const BREACH_BASE = /--breach-(normal|hard)$/;
export const BREACH_OPENS = { normal: 24, hard: 28 } as const;
/** Each Breach by the patrol zone its gate stands in (`gear::breach::BREACHES`): no other zone launches one. */
export const BREACH_ZONES: Readonly<Record<string, string>> = { 'gullwing-vale': 'drowned-vale' };
/** Why Hard is shut to one who has not won the Breach at Normal (`gear::gate::Shut::BreachHard`). */
export const BREACH_HARD_SHUT = 'A Breach at Hard opens once you have won it at Normal.';
/** The Breach a base launches, by its zone; null for a base that is no Breach's. */
const breachOf = (base: string) => BREACH_ZONES[/^node-(.+)--breach-/.exec(base)?.[1] ?? ''] ?? null;
export const BREACH_LAUNCHED = 'A Breach is launched by its company from the Playlist.';
const breachShut = (tier: (typeof BREACH_TIERS)[number]) =>
  `A Breach at ${tier === 'normal' ? 'Normal' : 'Hard'} opens at level ${BREACH_OPENS[tier]}.`;

/** The week's Elite Dungeon's bases, from its door or from the Playlist. */
const WEEK = /--elite(?:--sea)?$/;

/** The band a level is matched in: 1 to 10 the first, 11 to 20 the second, 21 to 30 the third. */
export function bandOf(level: number): number {
  return Math.floor((Math.max(1, level) - 1) / BAND_LEVELS);
}

/** The run's base a Find a Company request is for, `/v1/find/<base>` by WebSocket: an Elite Dungeon at Normal
 *  (`node-<id>`), the week's at Elite (`node-<id>--elite`, or `node-<id>--elite--sea` from the Playlist) or a playlist (`playlist-elite`, `playlist-abyss`), short
 *  enough that its run's name fits 64; never the Abyss Dungeon of the week, a patrol's dungeon or a run. Null for any
 *  other request. */
export function findingAt(request: Request): string | null {
  if (request.headers.get('Upgrade') !== 'websocket') return null;
  const base = FINDING.exec(new URL(request.url).pathname)?.[1];
  if (base !== undefined && BREACH_BASE.test(base) && breachOf(base) === null) return null;
  return base !== undefined && base.length <= BASE_MOST ? base : null;
}

/** One waiting for a run: their socket's number, account, band, when they began, whom they are kept apart from, and
 *  whether they launch alone (a playlist's Launch: their run is started at once, for them and their company). */
export interface Seeker {
  readonly socket: number;
  readonly account: string;
  readonly band: number;
  readonly since: number;
  readonly apart: readonly string[];
  readonly alone?: boolean;
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
        if (group.length === RUN_MOST || first.alone) break;
        const free = other !== first && !taken.has(other) && !other.alone && other.band === first.band;
        if (free && group.every((one) => together(one, other))) group.push(other);
      }
      if (group.length < RUN_MOST && now - first.since < FIND_WAIT_MS && !first.alone) continue;
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

/** A session's account, the level its room last kept (1 for none yet), whether it played the prologue, and whom it
 *  blocks or is blocked by, by id; null for a token that is no live session. */
export async function seekerOf(database: Db, token: string, now: number): Promise<Seeking | null> {
  const account = await liveAccount(database, token, now);
  if (account === null) return null;
  const kept = await database
    .prepare(
      `SELECT json_extract(body, '$.shown.level') AS level, json_extract(body, '$.story.prologue') AS prologue,
       json_extract(body, '$.story.breaches') AS breaches FROM characters WHERE account_id = ?1`,
    )
    .bind(account)
    .first<{ level: number | null; prologue: number | null; breaches: string | null }>();
  const [level, prologue] = [Number(kept?.level ?? 1) || 1, Boolean(kept?.prologue)];
  const breaches = wonOf(kept?.breaches ?? null);
  return { account, level, prologue, breaches, apart: await apartFrom(database, account) };
}

/** The Breaches a character has won, by their records' keys (`drowned-vale/normal`), from their JSON; none for any
 *  other text. */
function wonOf(text: string | null): string[] {
  try {
    const won: unknown = JSON.parse(text ?? '[]');
    return Array.isArray(won) ? won.filter((each): each is string => typeof each === 'string') : [];
  } catch {
    return [];
  }
}

/** A seeker as the accounts read them for the finder. */
export interface Seeking {
  readonly account: string;
  readonly level: number;
  readonly prologue: boolean;
  /** The Breaches won, by their records' keys; none where the accounts did not say. */
  readonly breaches?: readonly string[];
  readonly apart: readonly string[];
}

/** Why one who has not played the prologue finds no company: the gate's own words (`gear::gate`). */
export const AFTER_PROLOGUE = 'This place opens after the prologue.';

/** A seeker's socket, as the finder speaks to it. */
export interface FinderSocket {
  send(text: string): void;
  close(code: number, reason: string): void;
}

/** What a finder needs: who a token's seeker is, a way to keep whom a run was found for, a clock, an instance, and
 *  for a playlist a draw of one of a count (the server's randomness when none is given). */
export interface FinderDeps {
  seeker(token: string): Promise<Seeking | null>;
  found(run: string, accounts: readonly string[]): Promise<boolean>;
  readonly now: () => number;
  readonly instance: () => string;
  readonly pick?: (count: number) => number;
}

/** One dungeon's or playlist's Find a Company: each socket's first message is its session's token; each run found is
 *  told to its seekers as {"run":"<base>--run-<instance>"}, a playlist's as its drawn run (`playlistRun`), and their
 *  sockets closed. */
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
    { readonly socket: FinderSocket; readonly since: number; heard: boolean; readonly alone: boolean }
  >();
  private next = 1;

  constructor(base: string, deps: FinderDeps) {
    this.base = base;
    this.deps = deps;
  }

  /** Holds a new seeker's socket; `alone` for a playlist's Launch, whose run is drawn and kept here at once. */
  opened(socket: FinderSocket, alone = false): number {
    // Sockets that never sign in let their oldest go, so a flood of them never shuts out those that do.
    const silent = [...this.sockets].filter(([, held]) => !held.heard);
    if (silent.length >= FINDING_MOST && silent[0]) this.letGo(silent[0][0], 4003, 'Sign in to find a company.');
    const number = this.next++;
    this.sockets.set(number, { socket, since: this.deps.now(), heard: false, alone });
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
    // Every run a finder starts opens after the prologue, so a seeker before it would be matched only to be refused.
    if (!found.prologue) return this.letGo(socket, 4003, AFTER_PROLOGUE);
    const playlist = playlistOf(this.base);
    const band = playlist === null ? bandOf(level) : playlistBand(playlist, level);
    if (playlist !== null && band === null) return this.letGo(socket, 4003, playlistShut(playlist));
    // The week's Elite Dungeon opens at its own level, which its room would hold a seeker to after they were matched,
    // and a Breach at its tier's.
    if (WEEK.test(this.base) && level < WEEK_ELITE_OPENS) return this.letGo(socket, 4003, WEEK_ELITE_SHUT);
    const breach = BREACH_BASE.exec(this.base)?.[1] as (typeof BREACH_TIERS)[number] | undefined;
    if (breach !== undefined && level < BREACH_OPENS[breach]) return this.letGo(socket, 4003, breachShut(breach));
    const won = `${breachOf(this.base) ?? ''}/normal`;
    if (breach === 'hard' && !(found.breaches ?? []).includes(won)) return this.letGo(socket, 4003, BREACH_HARD_SHUT);
    // A Breach is no stranger's: it is launched for a company, never matched.
    if (breach !== undefined && !held.alone) return this.letGo(socket, 4003, BREACH_LAUNCHED);
    // Only a playlist's run and a Breach's are launched alone: an Elite Dungeon's and the week's start from their
    // entrances.
    const alone = held.alone && (playlist !== null || breach !== undefined);
    const replaced = this.queue.join({ socket, account, band: band ?? 0, since: this.deps.now(), apart, alone });
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
      try {
        const playlist = playlistOf(this.base);
        const band = group[0]?.band ?? 0;
        const run =
          playlist === null
            ? `${this.base}--run-${this.deps.instance()}`
            : playlistRun(playlist, band, this.deps.pick ?? drawnOf, this.deps.instance());
        const accounts = group.map((one) => one.account);
        const kept = await this.deps.found(run, accounts).catch(() => false);
        for (const { socket } of group)
          if (kept) this.letGo(socket, 1000, 'found', JSON.stringify({ run }));
          else this.letGo(socket, 1011, 'the run could not be kept');
      } catch {
        // A run that could not be named is one that could not be kept.
        for (const { socket } of group) this.letGo(socket, 1011, 'the run could not be kept');
      } finally {
        for (const one of group) this.starting.delete(one.account);
      }
    }
  }

  get waiting(): number {
    return this.queue.size;
  }

  get open(): number {
    return this.sockets.size;
  }

  /** Whether it holds as many sockets with a token as it takes: silent ones make room as new ones come. */
  get full(): boolean {
    return [...this.sockets.values()].filter((held) => held.heard).length >= FINDING_MOST;
  }

  /** Closes a socket, taking it out of the queue first, once it is sent `last` if given. */
  private letGo(socket: number, code: number, reason: string, last?: string): void {
    const held = this.sockets.get(socket);
    this.closed(socket);
    try {
      if (last !== undefined) held?.socket.send(last);
      held?.socket.close(code, reason);
    } catch {
      // A socket that throws as it is spoken to has closed already: it is out of the queue all the same.
    }
  }
}

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
