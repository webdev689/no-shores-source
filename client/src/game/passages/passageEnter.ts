// Into a passage zone's room on foot, the server's by its name or, playing alone, the same room in the rooms' worker
// opened from its ask (`open_passage`): under ground the zone's layout is a dungeon's, the body predicted on the Forge's
// floor among its walls and the pieces' solids; above ground on the hollow's heights among the solids, as a sea
// island's beach is stood on.
import { passageAsk } from '../../network/passageRoomDoor.ts';
import type { GearState } from '../../network/gearMessages.ts';
import { RoomConnection, type RoomLink, type Snapshot } from '../../network/roomConnection.ts';
import { RoomThread } from '../../network/roomThread.ts';
import type { Block } from '../../rules/movementRules.ts';
import type { IsleBlock, PassagePlan } from '../../rules/passageRules.ts';
import { seenBlocks } from '../dungeonLayout.ts';
import { Foot } from '../foot.ts';
import type { FootContext } from '../footPlace.ts';
import type { NodeInfo } from '../worldData.ts';
import { zonePlace } from './passageReach.ts';
import { zoneLayout } from './passageZone.ts';

/** The zone gone into: its plan and (above ground) heights, its island and week, the room joined, the patrol zone it
 *  webs out from, whether by a company's route, and the minute it opens at playing alone. */
export interface ZoneEntry {
  readonly plan: PassagePlan;
  readonly heights: Float64Array | null;
  readonly island: string;
  readonly week: number;
  readonly room: string;
  readonly patrol: NodeInfo;
  readonly company: boolean;
  readonly minute: number;
}

/** The pieces' solids as a course's blocks, from `bottom` up. */
export const solidBlocks = (solids: readonly IsleBlock[], bottom: number): Block[] =>
  solids.map(([minX, minY, maxX, maxY, top]) => ({ minX, minY, maxX, maxY, top, bottom }));

/** Stands the player in the zone `entry` names, joining its room. */
export async function enterZone(context: FootContext, entry: ZoneEntry): Promise<Foot> {
  const { plan, island, week, room, company, minute } = entry;
  const place = zonePlace(plan, entry.patrol, room);
  const alone = async (snapshot: (seen: Snapshot) => void, gear?: (sent: GearState) => void) =>
    RoomThread.openPassage(
      await context.roomModule,
      passageAsk(island, week, plan.zone.number, company, minute),
      snapshot,
      gear,
    );
  const layout = zoneLayout(plan);
  if (layout) {
    const [x, y] = plan.sites.arrive;
    const arrived = { ...layout, arrival: { ...layout.arrival, x, y, bearing: plan.sites.facing } };
    const blocks = [...seenBlocks(layout), ...solidBlocks(plan.solids, 0)];
    const into = { number: plan.zone.number, ask: { place: room, name: plan.zone.name }, room };
    return Foot.enterDungeon(context, { node: place, text: '' }, into, arrived, 'normal', {
      blocks,
      alone: (heard) => alone(heard.snapshot, heard.gear),
    });
  }
  if (!entry.heights) throw new Error(`${plan.zone.name} is above ground and has no heights`);
  const gear: { gear: GearState | null } = { gear: null };
  let hear: (snapshot: Snapshot) => void = () => undefined;
  const heard = (snapshot: Snapshot) => hear(snapshot);
  const link: RoomLink = context.rooms
    ? await RoomConnection.open(context.rooms(room), heard, (sent) => (gear.gear = sent), await context.session())
    : await alone(heard, (sent) => (gear.gear = sent));
  const open = (received: (snapshot: Snapshot) => void) => ((hear = received), link);
  // The hollow's ground stands under its walls everywhere, so its solids reach down past it.
  const boxes = solidBlocks(plan.solids, -100);
  try {
    return await Foot.onDeck(context, place, Array.from(entry.heights), open, {
      boxes,
      facing: plan.sites.facing,
      gear,
    });
  } catch (error) {
    link.close?.();
    throw error;
  }
}
