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
