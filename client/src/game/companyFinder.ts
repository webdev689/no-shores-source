// Find a Company from the page: a socket to the accounts' finder for one run's base (server/accounts/finding.ts),
// which sends the session's token, hears the run found, and says why a search ended that the page did not stop.
import { nodeOfRoom, sharedRun } from './rooms.ts';
import { clockWords } from './tasks.ts';

/** The socket a search speaks through. */
export type FinderSocket = Pick<WebSocket, 'send' | 'close' | 'addEventListener'>;

/** A search under way: the run's base it is for, when it began, and the way to stop it. */
export interface Finding {
  readonly base: string;
  readonly since: number;
  stop(): void;
}

/** The words a search that ended unasked says. */
export const SEARCH_LOST = 'The search stopped. Try again.';
/** The close the finder ends a search with for a reason the player reads: no session, or a search in another tab. */
const SAID = 4003;

/** The run a playlist's finder (`playlist-elite`, `playlist-abyss`) may name: a playlist's run at its tier. */
function playlistRun(base: string, run: string): string | null {
  const where = base.startsWith('playlist-') ? nodeOfRoom(run) : null;
  return where && where.playlist !== null && where.run !== null && `playlist-${where.seas}` === base ? run : null;
}

/** The run a finder's message names, where it is one of `base`'s; null for any other message. */
function runIn(data: unknown, base: string): string | null {
  if (typeof data !== 'string') return null;
  try {
    const { run } = JSON.parse(data) as { run?: unknown };
    return typeof run === 'string' ? (playlistRun(base, run) ?? sharedRun(base, [run])) : null;
  } catch {
    return null;
  }
}

/** Searches for a company for a run of `base`: sends the session's token once open, hears the run found (one of
 *  `base`'s, once), and says why it ended, unless the page stopped it. */
export function findCompany(
  address: string,
  base: string,
  token: string,
  heard: { found(run: string): void; ended(why: string): void },
  now: () => number = Date.now,
  open: (address: string) => FinderSocket = (opening) => new WebSocket(opening),
): Finding {
  const socket = open(address);
  /** Whether the search has found its run, ended or been stopped: nothing more is heard of it. */
  let over = false;
  socket.addEventListener('open', () => socket.send(token));
  socket.addEventListener('message', (event) => {
    const run = over ? null : runIn(event.data, base);
    if (run === null) return;
    over = true;
    heard.found(run);
  });
  socket.addEventListener('close', (event) => {
    if (over) return;
    over = true;
    heard.ended(event.code === SAID && event.reason ? event.reason : SEARCH_LOST);
  });
  return {
    base,
    since: now(),
    stop: () => {
      if (over) return;
      over = true;
      socket.close(1000, 'stopped');
    },
  };
}

/** The wait as the card shows it: "Finding a company · 0:23". */
export function findingWords(since: number, now: number): string {
  // Whole seconds waited, so the clock turns as each second ends.
  return `Finding a company · ${clockWords(Math.floor((now - since) / 1000))}`;
}
