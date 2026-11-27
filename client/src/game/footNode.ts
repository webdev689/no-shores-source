// A node's room for playing alone, opened from the node's file as the bake writes it for the server's, told where the
// node fights its public events.
import { LocalRoom } from '../network/localRoom.ts';
import { botPlayOf } from '../network/publicBots.ts';
import type { Difficulty } from '../heldmap/heldMap.ts';
import type { RoomLink } from '../network/roomConnection.ts';
import { RoomThread } from '../network/roomThread.ts';
import { TIERS } from './activityWords.ts';
import type { Heard } from './footPlace.ts';
import { WORLD_CLOCK, worldSeconds } from '../sky/worldClock.ts';
import { askedMinute, askedPublic, minuteShift } from './publicLaw.ts';
import { roomSeas } from './rooms.ts';

/** `node`'s room alone from its file's `text`, joined before entrance `entrance`'s door if given, at the difficulty
 *  the voyage's `seas` stand it at (`roomSeas`): in the rooms' worker, its word on the player's gear going to
 *  `heard.gear`. Under `npm run dev`, `&public=fissure|raid` sets its
 *  clock so that event starts at once, `&minute=<Unix minute>` stands its clock (and the page's) at that minute, and
 *  `&speed=`, `&bots=` and `&heroic=0` play it through (`botPlayOf`); a room so asked for runs in the game's own
 *  thread, where a picture script reaches its play. */
export async function openNodeAlone(
  module: WebAssembly.Module,
  node: { readonly id: string; readonly kind: string },
  text: string,
  heard: Heard,
  entrance?: number,
  seas: Difficulty = 'normal',
): Promise<RoomLink> {
  const local = { gear: heard.gear, entrance, seas: Math.max(0, TIERS.indexOf(roomSeas(node, seas))) };
  const wanted = import.meta.env.DEV ? askedPublic(location.search) : null;
  const play = import.meta.env.DEV ? botPlayOf(location.search) : null;
  const asked = import.meta.env.DEV ? askedMinute(location.search) : null;
  if (!wanted && !play && asked === null) return RoomThread.openNode(module, text, heard.snapshot, heard.asks, local);
  const now = Math.floor(Date.now() / 60_000);
  const from = asked ?? now;
  // The page's own clock, which no room played alone sets, is told the asked minute too, so its sky shows that hour.
  if (asked !== null) WORLD_CLOCK.heard(worldSeconds(asked * 60_000));
  const shift = from - now + (wanted ? (minuteShift(node.id, wanted, from) ?? 0) : 0);
  return LocalRoom.openNode(module, text, heard.snapshot, heard.asks, { ...local, minuteShift: shift, play });
}
