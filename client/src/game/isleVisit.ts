// A visit to one of the sea's islands: anchored at its anchorage (`docking.ts`), the player walks ashore on its beach,
// into its room (the server's, or the same room in the rooms' worker), standing on its own fine ground among its
// modules' boxes, in the world's metres. On foot E scavenges a wreck within reach, once each, and opens the dungeon's
// door; the room judges both.
import type { GearState } from '../network/gearMessages.ts';
import type { Difficulty } from '../heldmap/heldMap.ts';
import { RoomThread } from '../network/roomThread.ts';
import { RoomConnection, type RoomLink, type Snapshot } from '../network/roomConnection.ts';
import { Foot, type FootContext } from './foot.ts';
import { type DungeonDoor, isleNode, isleRoomName, isleUses, isleWords } from './isleLaw.ts';
import type { IsleHeld } from './isles.ts';

/** The player walks ashore on an island: online into its room on the server, which opens on the sea's word; alone
 *  into the same room in the rooms' worker, opened on the sea's word (`word`). The island and its dungeon stand at the
 *  tier the voyage set out at, Normal before one has, as a node landed at does. */
export async function ashoreOn(
  context: FootContext,
  held: IsleHeld,
  where: { readonly word: string | null; readonly continent: string; readonly voyage: Voyage },
  enter: (door: DungeonDoor) => void,
): Promise<Foot> {
  const { word, continent } = where;
  const seas = where.voyage.difficulty ?? 'normal';
  const node = isleNode(held.seen, held.plan, { continent, seas });
  const gear: { gear: GearState | null } = { gear: null };
  let hear: (snapshot: Snapshot) => void = () => undefined;
  const heard = (snapshot: Snapshot) => hear(snapshot);
  const { rooms } = context;
  let link: RoomLink;
  if (rooms) {
    const session = await context.session();
    link = await RoomConnection.open(
      rooms(isleRoomName(held.seen, seas)),
      heard,
      (sent) => (gear.gear = sent),
      session,
    );
  } else {
    if (!word) throw new Error('the sea no longer holds this island');
    link = await RoomThread.openIsland(await context.roomModule, word, heard, DIFFICULTIES.indexOf(seas));
  }
  const boxes = held.plan.blocks.map(([west, north, east, south, top]) => ({
    minX: west + held.seen.at[0],
    minY: north + held.seen.at[1],
    maxX: east + held.seen.at[0],
    maxY: south + held.seen.at[1],
    top,
    // From the ground up: an island's ground stands over the sea, so this is under it everywhere.
    bottom: -100,
  }));
  const open = (received: (snapshot: Snapshot) => void) => {
    hear = received;
    return link;
  };
  const place = { boxes, facing: held.plan.facing, uses: isleUses(held, enter, gear, { continent, seas }), gear };
  try {
    return await Foot.onDeck(context, node, Array.from(held.heights), open, place);
  } catch (error) {
    // A landing that fails leaves no socket open behind it, joining the island's room again and again.
    link.close?.();
    throw error;
  }
}

/** The voyage an island is landed from: the tier its card set it out at, none before one has (`HelmMap`). */
interface Voyage {
  readonly difficulty: Difficulty | undefined;
}

/** The tiers by their number in the rooms. */
const DIFFICULTIES: readonly Difficulty[] = ['normal', 'elite', 'abyss'];

/** The veil's words for walking ashore on an island: anchored off it, or washed up on its beach. */
export function ashoreWords(held: IsleHeld, washed = false): string {
  const isle = isleWords(held.seen);
  return washed ? `Washed up on ${isle} you found. Your ship lies off it.` : `Going ashore on ${isle}`;
}
