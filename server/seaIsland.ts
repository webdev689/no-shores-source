// The rooms that stand on a sea's island, its own and its dungeon's: each opens only on the word of the sea that holds
// the island, with the seed that sea gives it; while players stand ashore it keeps the island held (`ashore.ts`).
import type { RoomDoor } from './roomDoor.ts';
import { isleRoom, seaDungeonRoom, seaRoomName } from './roomNames.ts';

/** The island a room stands on: its number at sea, its seed and its sea room's name. */
export interface HeldIsland {
  readonly id: number;
  readonly seed: string;
  readonly sea: string;
}

/** What a sea room says of its islands, by its name: its word on an island, and on an island's dungeon. */
type Seas = (sea: string) => {
  islandWord(id: number): Promise<string>;
  dungeonWord(room: string): Promise<string>;
};

/** Opens the island room `name` (after `isle-`) on the word of the sea its tier says: only an island that sea holds,
 *  with the seed its name gives, its guards raised to that sea's difficulty. The island and whether its room opened;
 *  null for an island that sea does not hold. */
export async function openIsland(
  room: RoomDoor,
  name: string,
  seas: Seas,
): Promise<{ readonly island: HeldIsland; readonly opened: boolean } | null> {
  const named = isleRoom(name);
  if (!named) return null;
  const sea = seaRoomName(named.seas);
  const word = await seas(sea).islandWord(named.id);
  if (!word || (JSON.parse(word) as { seed?: string }).seed !== named.seed) return null;
  const island = { id: named.id, seed: named.seed, sea };
  const [lootLow = 0, lootHigh = 0, worldLow = 0, worldHigh = 0] = crypto.getRandomValues(new Uint32Array(4));
  // Only an account the sea says is landed here scavenges: nobody sails ashore from afar by naming the room.
  const opened = room.openIsland(word) && room.checkLandings() && room.difficulty(named.seas);
  return { island, opened: opened && room.reseed([lootLow, lootHigh, worldLow, worldHigh]) };
}

/** The island a sea island's dungeon `name` stands behind the door of, on the word of the sea its tier says, as an
 *  island's room opens: only an island that sea holds, so with the seed and style the sea gives that island's dungeon.
 *  Only accounts the sea says are landed on the island play in it, and while they do the island is held. Null for an
 *  island that sea does not hold. */
export async function behindDoor(name: string, seas: Seas): Promise<HeldIsland | null> {
  const named = seaDungeonRoom(name);
  if (!named) return null;
  const sea = seaRoomName(named.seas);
  const word = await seas(sea).dungeonWord(name.split('--')[0] ?? '');
  if (!word) return null;
  const { id, seed } = JSON.parse(word) as { id: number; seed: string };
  return { id, seed, sea };
}
