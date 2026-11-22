// A node's room for playing alone, opened from the node's file as the bake writes it for the server's, told where the
// node fights its public events.
import { LocalRoom } from '../network/localRoom.ts';
import { botPlayOf } from '../network/publicBots.ts';
import type { RoomLink } from '../network/roomConnection.ts';
import { RoomThread } from '../network/roomThread.ts';
import type { Heard } from './footPlace.ts';
import { askedPublic, minuteShift } from './publicLaw.ts';

/** Node `id`'s room alone from its file's `text`, joined before entrance `entrance`'s door if given: in the rooms'
 *  worker, its word on the player's gear going to `heard.gear`. Under `npm run dev`, `&public=fissure|raid` sets its
 *  clock so that event starts at once, and `&speed=`, `&bots=` and `&heroic=0` play it through (`botPlayOf`); a room
 *  so asked for runs in the game's own thread, where a picture script reaches its play. */
export async function openNodeAlone(
  module: WebAssembly.Module,
  id: string,
  text: string,
  heard: Heard,
  entrance?: number,
): Promise<RoomLink> {
  const local = { gear: heard.gear, entrance };
  const wanted = import.meta.env.DEV ? askedPublic(location.search) : null;
  const play = import.meta.env.DEV ? botPlayOf(location.search) : null;
  if (!wanted && !play) return RoomThread.openNode(module, text, heard.snapshot, heard.asks, local);
  const shift = wanted ? (minuteShift(id, wanted, Math.floor(Date.now() / 60_000)) ?? 0) : 0;
  return LocalRoom.openNode(module, text, heard.snapshot, heard.asks, { ...local, minuteShift: shift, play });
}
