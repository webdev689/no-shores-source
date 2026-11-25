// Into a passage zone's room on foot, the server's by its name or, playing alone, the same room in the rooms' worker
// opened from its ask (`open_passage`): under ground the zone's layout is a dungeon's, above ground its hollow is stood
// on as a sea island's beach is; either way the body is predicted on the zone's own ground from the same ask
// (`setPassage`), as its room stands bodies on it.
import { passageAsk } from '../../network/passageRoomDoor.ts';
import type { GearState } from '../../network/gearMessages.ts';
import { RoomConnection, type RoomLink, type Snapshot } from '../../network/roomConnection.ts';
import { RoomThread } from '../../network/roomThread.ts';
import type { Block } from '../../rules/movementRules.ts';
import type { IsleBlock, PassagePlan } from '../../rules/passageRules.ts';
import { seenBlocks } from '../dungeonLayout.ts';
import { Foot } from '../foot.ts';
import { rulesOf } from '../footRoom.ts';
import type { FootContext } from '../footPlace.ts';
import type { NodeInfo } from '../worldData.ts';
import { PASSAGE_FULL } from '../rooms.ts';
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

/** The most copies of a public zone's room tried before the page gives up on it. */
const COPIES = 9;
const SETTLE_MS = 10_000;

/** A room joined, and whether it turned the player away for being full: told once its first snapshot comes, or it
 *  shuts, or `SETTLE_MS` pass. */
export type Joining = (name: string) => Promise<{ readonly link: RoomLink; readonly full: boolean }>;

/** The first public copy of `base`'s room with room for the player (`--2`, `--3` after the first), or a company's
 *  route's own room (`base` holding its `--run-` already), as the server keeps them. */
export async function joinPassage(base: string, join: Joining): Promise<RoomLink> {
  const route = base.includes('--run-');
  for (let copy = 1; copy <= (route ? 1 : COPIES); copy++) {
    const { link, full } = await join(copy > 1 ? `${base}--${copy}` : base);
    if (!full) return link;
    link.close?.();
  }
  throw new Error(PASSAGE_FULL);
}

/** Joins the server's room `name`, its snapshots to `snapshot` and its gear to `gear`, and waits to hear whether it
 *  takes the player. */
function joiner(context: FootContext, snapshot: (seen: Snapshot) => void, gear: (sent: GearState) => void): Joining {
  return async (name) => {
    let seen = false;
    const told = (shot: Snapshot) => ((seen = true), snapshot(shot));
    const link = await RoomConnection.open(context.rooms?.(name) ?? name, told, gear, await context.session());
    for (let waited = 0; !seen && link.shut === null && waited < SETTLE_MS; waited += 100)
      await new Promise((done) => setTimeout(done, 100));
    return { link, full: link.shut === PASSAGE_FULL };
  };
}

/** Stands the player in the zone `entry` names, joining its room. */
export async function enterZone(context: FootContext, entry: ZoneEntry): Promise<Foot> {
  const { plan, island, week, room, company, minute } = entry;
  const place = zonePlace(plan, entry.patrol, room);
  const ask = passageAsk(island, week, plan.zone.number, company, minute);
  const alone = async (snapshot: (seen: Snapshot) => void, gear?: (sent: GearState) => void) =>
    RoomThread.openPassage(await context.roomModule, ask, snapshot, gear);
  const linked = (snapshot: (seen: Snapshot) => void, gear: (sent: GearState) => void) =>
    context.rooms ? joinPassage(room, joiner(context, snapshot, gear)) : alone(snapshot, gear);
  const layout = zoneLayout(plan);
  if (layout) {
    const [x, y] = plan.sites.arrive;
    const arrived = { ...layout, arrival: { ...layout.arrival, x, y, bearing: plan.sites.facing } };
    const blocks = [...seenBlocks(layout), ...solidBlocks(plan.solids, 0)];
    const into = { number: plan.zone.number, ask: { place: room, name: plan.zone.name }, room };
    return Foot.enterDungeon(context, { node: place, text: '' }, into, arrived, 'normal', {
      ask,
      blocks,
      link: (heard) => linked(heard.snapshot, heard.gear),
    });
  }
  if (!entry.heights) throw new Error(`${plan.zone.name} is above ground and has no heights`);
  const gear: { gear: GearState | null } = { gear: null };
  let hear: (snapshot: Snapshot) => void = () => undefined;
  const heard = (snapshot: Snapshot) => hear(snapshot);
  const link = await linked(heard, (sent) => (gear.gear = sent));
  const open = (received: (snapshot: Snapshot) => void) => ((hear = received), link);
  // The hollow's ground stands under its walls everywhere, so its solids reach down past it.
  const boxes = solidBlocks(plan.solids, -100);
  try {
    const foot = await Foot.onDeck(context, place, Array.from(entry.heights), open, {
      boxes,
      facing: plan.sites.facing,
      gear,
    });
    // The deck's grid stood the step; the fight predicts on the hollow's own ground and blocks, as its room does.
    if (!(await rulesOf(context)).combat.setPassage(ask)) throw new Error('the passage’s ground did not load');
    return foot;
  } catch (error) {
    link.close?.();
    throw error;
  }
}
