// A test room launched from the Test Room, once the page has arrived past the title: into it as soon as the player
// stands on foot (asked again until they stand in it, as a trip asked while the arrival's veil stands is refused), and
// back to the character screen with the Test Room open once they leave it, by its way out or any other. While in it,
// the tab is marked, so Exit to Menu or a reload opens the Test Room too.
import type { Kept } from '../../network/accounts.ts';
import { nodeOfRoom } from '../rooms.ts';
import type { NodeInfo } from '../worldData.ts';
import { markCharacters, takeTestRun } from './characterMark.ts';

/** How often the page looks, ms. */
const LOOK_EVERY_MS = 1_000;
/** How often a refused way in is asked again, ms, and how many times before the page goes back to the Test Room. */
const ASK_EVERY_MS = 3_000;
const ASKS_MOST = 10;

/** What the page holds of where the player stands: the rooms they play in on foot, none at sea, or null while
 *  under way. */
export type StandingIn = readonly (string | null | undefined)[] | null;

/** Whether a room is a developer's test room. */
export const testRoomName = (room: string | null | undefined): boolean => Boolean(room && nodeOfRoom(room)?.test);

/** Goes into the test room kept for this load (`keepTestRun`), if any, and back to the characters once out of it. */
export function enterTestRun(
  tab: Kept,
  nodes: readonly NodeInfo[],
  standing: () => StandingIn,
  ways: {
    readonly intoRun: (node: NodeInfo, run: string) => void;
    readonly toBreach: (run: string) => void;
  },
  leave: () => void,
  clock: { readonly every: (work: () => void, span: number) => () => void; readonly now: () => number } = {
    every: (work, span) => {
      const id = setInterval(work, span);
      return () => clearInterval(id);
    },
    now: () => performance.now(),
  },
): void {
  const room = takeTestRun(tab);
  const named = room === null ? null : nodeOfRoom(room);
  const node = named && nodes.find((each) => each.id === named.id);
  if (room === null || !named?.test || !node) return;
  let [inside, askedAt, asked] = [false, -Infinity, 0];
  const stop = clock.every(() => {
    const rooms = standing();
    if (rooms === null) return;
    const testing = rooms.some(testRoomName);
    if (testing && !inside) {
      inside = true;
      markCharacters(tab, 'test');
    }
    if (inside && !testing) {
      stop();
      leave();
      return;
    }
    if (inside || clock.now() - askedAt < ASK_EVERY_MS) return;
    if (asked++ >= ASKS_MOST) {
      stop();
      leave();
      return;
    }
    askedAt = clock.now();
    if (named.breach !== null) ways.toBreach(room);
    else ways.intoRun(node, room);
  }, LOOK_EVERY_MS);
}
