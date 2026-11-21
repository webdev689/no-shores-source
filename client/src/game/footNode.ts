// A node's ground as a room stands on it, on foot: the land's window and its boxes set under the rules, the node's
// file a room in the page opens from, as the bake writes it for the server's, and that room opened.
import type { GearState } from '../network/gearMessages.ts';
import { LocalRoom } from '../network/localRoom.ts';
import { botPlayOf } from '../network/publicBots.ts';
import type { RoomLink, Snapshot } from '../network/roomConnection.ts';
import type { CombatRules } from '../rules/combatRules.ts';
import type { Block } from '../rules/movementRules.ts';
import type { FootContext } from './foot.ts';
import type { Rect } from './nodes.ts';
import { askedPublic, minuteShift } from './publicLaw.ts';
import type { NodeInfo } from './worldData.ts';

/** Cuts a node's window of the land over the rect, and its city's boxes there, and stands the movement rules and the
 *  fight's on them as its room stands its bodies. Answers the boxes and the window's text. */
export async function standOn(
  context: FootContext,
  combat: CombatRules,
  rect: Rect,
): Promise<{ boxes: readonly Block[]; ground: string }> {
  const [ground, boxes] = await Promise.all([context.land.window(rect), context.land.boxes(rect)]);
  context.movement.setCourse(boxes);
  combat.setCourse(boxes);
  if (!context.movement.setGround(ground) || !combat.setGround(ground))
    throw new Error('the ground of this place did not load');
  return { boxes, ground };
}

/** A node's file as the bake writes it, for a room in the page: its section and window rect, the window of the land
 *  cut there, its boxes, and where it fights its public events (the land's `grounds`, JSON; `null` for none). */
export function nodeText(
  node: NodeInfo,
  rect: Rect,
  ground: string,
  boxes: readonly Block[],
  grounds = 'null',
): string {
  const box = boxes.map((block) => [block.minX, block.minY, block.maxX, block.maxY, block.top, block.bottom]);
  const { id, kind, continent, ring, spawns } = node;
  const fought = grounds === 'null' ? '' : `,"grounds":${grounds}`;
  return `{"id":${JSON.stringify(id)},"kind":${JSON.stringify(kind)},"continent":${JSON.stringify(continent)},"ring":${JSON.stringify(ring)},"spawns":${JSON.stringify(spawns)},"bounds":${JSON.stringify(rect)},"boxes":${JSON.stringify(box)},"ground":${ground}${fought}}`;
}

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
