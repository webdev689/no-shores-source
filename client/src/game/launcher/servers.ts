// The game's servers as the launcher shows them: the rooms and the accounts, each asked for its health and timed,
// again every 30 s while the launcher stands, so the player sees what Play is about to join. Each is timed on an open
// connection, as the game's own link to its room is: a fresh one also pays for setting the connection up.
import { LIVE_ACCOUNTS } from '../../network/accounts.ts';
import { LIVE_ROOMS } from '../../network/roomAddress.ts';

/** A server as last heard: being asked, up with the time its answer took, or not answering. */
export type Server =
  { readonly state: 'checking' } | { readonly state: 'up'; readonly ms: number } | { readonly state: 'down' };

/** The servers Play joins, with where each says it is up. */
export const SERVERS = [
  { name: 'Rooms', health: `${LIVE_ROOMS.replace(/^wss:/, 'https:')}/health` },
  { name: 'Accounts', health: `${LIVE_ACCOUNTS}/v1/health` },
] as const;
/** How often the launcher asks again, and how long an answer may take before the server counts as not answering. */
export const ASK_EVERY_MS = 30_000;
export const ASK_WITHIN_MS = 5_000;

/** Asks `health` whether its server is up: once to open the connection, then again on it, timed by `clock`. */
export async function askHealth(
  health: string,
  fetcher: (address: string, init: RequestInit) => Promise<Response> = fetch,
  clock: () => number = () => performance.now(),
): Promise<Server> {
  const ask = () => fetcher(health, { cache: 'no-store', signal: AbortSignal.timeout(ASK_WITHIN_MS) });
  try {
    const opening = await ask();
    if (!opening.ok) return { state: 'down' };
    await opening.arrayBuffer();
    const started = clock();
    const answer = await ask();
    return answer.ok ? { state: 'up', ms: Math.round(clock() - started) } : { state: 'down' };
  } catch {
    return { state: 'down' };
  }
}

/** A server's state in the player's words. */
export function serverWords(server: Server): string {
  if (server.state === 'checking') return 'Checking';
  return server.state === 'up' ? `Online, ${server.ms} ms` : 'Not answering';
}
