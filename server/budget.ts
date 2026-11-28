/** The most messages one socket sends in a second. A browser sends one input a tick, 60 a second, and a few more when
 *  it catches up a stall or the network bunches them; far past that is a flood, whose every message the room's object
 *  must take before its next tick, so every other player's snapshots would wait behind it. */
export const MESSAGES_A_SECOND = 240;

/** The most bytes one input may be: an input with the largest dress fits well inside it. */
export const MESSAGE_MOST = 8192;

/** A socket's messages in the second it last sent in, and all it has sent. */
export interface Count {
  readonly second: number;
  readonly messages: number;
  readonly taken: number;
}

/** The count after one more message at `now` (milliseconds), and whether the socket is still within its budget. */
export function counted(count: Count | undefined, now: number): { readonly count: Count; readonly within: boolean } {
  const second = Math.floor(now / 1000);
  const messages = count?.second === second ? count.messages + 1 : 1;
  const taken = (count?.taken ?? 0) + 1;
  return { count: { second, messages, taken }, within: messages <= MESSAGES_A_SECOND };
}

/** How often a room tells a page how many of its messages it has taken, a few times a second: a page whose upload is
 *  held up while the room's snapshots still come in holds what it sends by it (`roomConnection.ts`, `quiet`). */
export const TOLD_EVERY = 30;

/** Whether a room tells a page how many it has taken after a message counted as `count`: every TOLD_EVERY. */
export const tellsTaken = (count: Count): boolean => count.taken % TOLD_EVERY === 0;

/** The most sockets one address may hold in a room before they sign in, each let go of a few seconds on
 *  (`TOKEN_WAIT_MS`): enough for a household's tabs, too few for one address to fill a room's places. */
export const UNSIGNED_FROM_ONE = 8;

/** Whether a room takes one more socket from `address` (`addressKey`), its sockets' own addresses being `held`. */
export function admitsFrom(
  held: Iterable<{ readonly address: string; readonly signed: boolean }>,
  address: string,
): boolean {
  let unsigned = 0;
  for (const socket of held) if (!socket.signed && socket.address === address) unsigned += 1;
  return unsigned < UNSIGNED_FROM_ONE;
}
