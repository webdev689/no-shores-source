// How far one frame moves the page on, and how much more of a slow frame the player's own ticks make up on foot, so
// the inputs they send keep the room's clock.

/** The most seconds one frame moves the page on: a longer one (a stall, a tab come back) moves it no further. */
export const FRAME_MOST_S = 0.1;

/** The most seconds one frame steps the player, and a room in the page, on: 18 of the rooms' ticks, the 24 a room
 *  waits on a player's late inputs before it stands them still less the 6 it leaves them once their inputs come again
 *  (crates/room/src/players.rs `VIEW_LAG`, `resumed`). A slow frame's ticks then reach the room in time to be taken,
 *  and never so many at once that they wait behind its clock. */
export const TICKS_MOST_S = 0.3;

/** The seconds past `FRAME_MOST_S` of a frame `elapsed` seconds long that the player's own ticks make up. */
export function lateSeconds(elapsed: number): number {
  return Math.max(0, Math.min(TICKS_MOST_S, elapsed) - FRAME_MOST_S);
}
