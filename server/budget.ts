/** The most messages one socket sends in a second. A browser sends one input a tick, 60 a second, and a few more when
 *  it catches up a stall or the network bunches them; far past that is a flood, whose every message the room's object
 *  must take before its next tick, so every other player's snapshots would wait behind it. */
export const MESSAGES_A_SECOND = 240;

/** A socket's messages in the second it last sent in. */
export interface Count {
  readonly second: number;
  readonly messages: number;
}

/** The count after one more message at `now` (milliseconds), and whether the socket is still within its budget. */
export function counted(count: Count | undefined, now: number): { readonly count: Count; readonly within: boolean } {
  const second = Math.floor(now / 1000);
  const messages = count?.second === second ? count.messages + 1 : 1;
  return { count: { second, messages }, within: messages <= MESSAGES_A_SECOND };
}

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
