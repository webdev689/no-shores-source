// A node's ground as a room stands on it, on foot: the land's window and its boxes set under the rules, and the
// node's file a room in the page opens from, as the bake writes it for the server's.
import type { CombatRules } from '../rules/combatRules.ts';
import type { Block } from '../rules/movementRules.ts';
import type { FootContext } from './foot.ts';
import type { Rect } from './nodes.ts';
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
