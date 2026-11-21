// A node's room on foot: the server's where the game is given rooms, else one in the page, opened from the node's
// file as the bake writes it for the server's.
import type { Difficulty } from '../heldmap/heldMap.ts';
import type { GearState } from '../network/gearMessages.ts';
import { LocalRoom } from '../network/localRoom.ts';
import { botPlayOf } from '../network/publicBots.ts';
import { RoomConnection, type RoomLink, type Snapshot } from '../network/roomConnection.ts';
import type { CombatRules } from '../rules/combatRules.ts';
import type { Block } from '../rules/movementRules.ts';
import type { FootContext } from './foot.ts';
import { nodeText, standOn } from './footGround.ts';
import { nodeRoom } from './rooms.ts';
import type { Rect } from './nodes.ts';
import { askedPublic, minuteShift } from './publicLaw.ts';
import type { NodeInfo } from './worldData.ts';

/** A room in the page on `node`'s ground, standing the foes a player asks for when `foeAsks`, its word on the
 *  player's gear kept in `alone`. It is told where the node fights its public events, as the bake tells the server's;
 *  under `npm run dev`, `&public=fissure|raid` sets its clock so that event starts at once, and `&speed=`, `&bots=`
 *  and `&heroic=0` play it through (`botPlayOf`). */
export async function openAlone(
  context: FootContext,
  node: NodeInfo,
  stood: { rect: Rect; ground: string; boxes: readonly Block[] },
  received: (snapshot: Snapshot) => void,
  foeAsks: boolean,
  alone: { gear: GearState | null },
): Promise<RoomLink> {
  const wanted = import.meta.env.DEV ? askedPublic(location.search) : null;
  const shift = wanted ? (minuteShift(node.id, wanted, Math.floor(Date.now() / 60_000)) ?? 0) : 0;
  const module = await context.roomModule;
  const text = nodeText(node, stood.rect, stood.ground, stood.boxes, await context.land.grounds(node.id));
  return LocalRoom.openNode(module, text, received, {
    foeAsks,
    gear: (sent) => (alone.gear = sent),
    minuteShift: shift,
    play: import.meta.env.DEV ? botPlayOf(location.search) : null,
  });
}

/** The room of `node` at `seas`: the server's where the game is given rooms, its word on the player's gear kept in
 *  `held.gear`, else one in the page (`openAlone`). The room names the rect its window was cut to, and the ground
 *  `stood` is stood on again where that differs; a room baked from older edits is stood on as it stands. Answers the
 *  link and the boxes stood on. */
export async function roomOf(
  context: FootContext,
  { node, seas }: { node: NodeInfo; seas: Difficulty },
  combat: CombatRules,
  stood: { rect: Rect; ground: string; boxes: readonly Block[] },
  received: (snapshot: Snapshot) => void,
  held: { gear: { gear: GearState | null }; alone: { gear: GearState | null }; foeAsks: boolean },
): Promise<{ link: RoomLink; boxes: readonly Block[] }> {
  const { rooms } = context;
  const session = await context.session();
  const connection = rooms
    ? await RoomConnection.open(rooms(nodeRoom(node, seas)), received, (sent) => (held.gear.gear = sent), session)
    : null;
  let stands = stood;
  const bounds = connection?.node?.bounds;
  try {
    if (bounds && bounds.some((value, index) => Math.abs(value - (stood.rect[index] ?? 0)) > 0.5)) {
      const rect: Rect = [bounds[0] ?? 0, bounds[1] ?? 0, bounds[2] ?? 0, bounds[3] ?? 0];
      stands = { rect, ...(await standOn(context, combat, rect)) };
    }
  } catch (error) {
    connection?.close();
    throw error;
  }
  const link = connection ?? (await openAlone(context, node, stands, received, held.foeAsks, held.alone));
  return { link, boxes: stands.boxes };
}
