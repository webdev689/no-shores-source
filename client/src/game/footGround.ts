// A node's ground for a body on foot: its window of the land and its city's boxes, cut once and stood under the
// movement rules and the fight's, and the node's file written from them for a room in the page.
import type { CombatRules } from '../rules/combatRules.ts';
import type { Block } from '../rules/movementRules.ts';
import type { FootContext } from './foot.ts';
import type { Rect } from './nodes.ts';
import type { NodeInfo } from './worldData.ts';

/** Cuts a node's window of the land over the rect, and its city's boxes there, and stands the movement rules and the
 *  fight's on them as its room stands its bodies. Answers the boxes and the window's text. */
export async function standOn(
  context: Pick<FootContext, 'land' | 'movement'>,
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

/** A node's file as the bake writes it, for a room in the page: its section, its resource places and window rect, the
 *  window of the land cut there, and its boxes. */
export function nodeText(node: NodeInfo, rect: Rect, ground: string, boxes: readonly Block[]): string {
  const box = boxes.map((block) => [block.minX, block.minY, block.maxX, block.maxY, block.top, block.bottom]);
  const { id, kind, continent, ring, spawns } = node;
  const resources = (node.resources ?? []).map((site) => site.at);
  return `{"id":${JSON.stringify(id)},"kind":${JSON.stringify(kind)},"continent":${JSON.stringify(continent)},"ring":${JSON.stringify(ring)},"spawns":${JSON.stringify(spawns)},"resources":${JSON.stringify(resources)},"bounds":${JSON.stringify(rect)},"boxes":${JSON.stringify(box)},"ground":${ground}}`;
}
