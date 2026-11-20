// A visit to one of the sea's islands: the ship sails in round it to its anchorage and the player walks ashore on its
// beach, into its room (the server's, or the same room in the page), standing on its own fine ground among its
// modules' boxes, in the world's metres. On foot E scavenges a wreck within reach, once each, and opens the dungeon's
// door; the room judges both.
import type { GearState } from '../network/gearMessages.ts';
import { LocalRoom } from '../network/localRoom.ts';
import { RoomConnection, type RoomLink, type Snapshot } from '../network/roomConnection.ts';
import { Foot, type FootContext } from './foot.ts';
import { ANCHORED_M, type DungeonDoor, approach, isleNode, isleRoomName, isleUses, isleWords } from './isleLaw.ts';
import type { IsleHeld, Isles } from './isles.ts';
import type { Sea } from './sea.ts';

/** The player walks ashore on an island: online into its room on the server, which opens on the sea's word; alone
 *  into the same room in the page, opened on the page's sea's word (`word`). */
export async function ashoreOn(
  context: FootContext,
  held: IsleHeld,
  { word, continent }: { readonly word: string | null; readonly continent: string },
  enter: (door: DungeonDoor) => void,
): Promise<Foot> {
  const node = isleNode(held.seen, held.plan.ring, held.plan.spawns, continent);
  const gear: { gear: GearState | null } = { gear: null };
  let hear: (snapshot: Snapshot) => void = () => undefined;
  const heard = (snapshot: Snapshot) => hear(snapshot);
  const { rooms } = context;
  let link: RoomLink;
  if (rooms) {
    const session = await context.session;
    link = await RoomConnection.open(rooms(isleRoomName(held.seen)), heard, (sent) => (gear.gear = sent), session);
  } else {
    if (!word) throw new Error('the sea no longer holds this island');
    link = LocalRoom.openIsland(await context.roomModule, word, heard);
  }
  const boxes = held.plan.blocks.map(([west, north, east, south, top]) => ({
    minX: west + held.seen.at[0],
    minY: north + held.seen.at[1],
    maxX: east + held.seen.at[0],
    maxY: south + held.seen.at[1],
    top,
  }));
  const open = (received: (snapshot: Snapshot) => void) => {
    hear = received;
    return link;
  };
  const place = { boxes, facing: held.plan.facing, uses: isleUses(held, enter), gear };
  return Foot.onDeck(context, node, Array.from(held.heights), open, place);
}

/** The landing under way: the island the ship sails in to anchor off, until she lies at its anchorage. */
export class IsleLanding {
  private pending: number | null = null;

  /** Sets her course round the island to its anchorage: whether there is one to sail. */
  begin(sea: Sea, isles: Isles, id: number): boolean {
    const isle = isles.all().find((each) => each.seen.id === id);
    if (!isle?.built) return false;
    this.pending = id;
    sea.sailAlong(approach(sea.position, isle).slice(1));
    return true;
  }

  /** The island she has come to anchor off, once she lies at its anchorage, taken once; the landing given up if the
   *  island no longer stands. */
  arrived(sea: Sea, isles: Isles): IsleHeld | null {
    if (this.pending === null) return null;
    const held = isles.byId(this.pending);
    const isle = isles.all().find((each) => each.seen.id === this.pending);
    if (!held || !isle?.built) {
      this.pending = null;
      return null;
    }
    const [x, y] = sea.position;
    const [anchorX, anchorY] = isle.built.anchorage;
    if (sea.course.length > 0 || Math.hypot(anchorX - x, anchorY - y) > ANCHORED_M) return null;
    this.pending = null;
    return held;
  }

  /** The landing given up: she was turned elsewhere. */
  cancel(): void {
    this.pending = null;
  }

  /** The island her landing is under way to, if any. */
  get toward(): number | null {
    return this.pending;
  }
}

/** The veil's words for walking ashore on an island: anchored off it, or washed up on its beach. */
export function ashoreWords(held: IsleHeld, washed = false): string {
  const isle = isleWords(held.seen);
  return washed ? `Washed up on ${isle} you found. Your ship lies off it.` : `Going ashore on ${isle}`;
}
