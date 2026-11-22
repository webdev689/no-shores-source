import { resourcePicture } from '../combat/dropPictures.ts';
import { type Marked, OVER_HEAD_M, OVER_NODE_M } from '../combat/marksOver.ts';
import { crystalSpin } from '../combat/vestigeCrystal.ts';
import type { GearState } from '../network/gearMessages.ts';
import { BODY_HEIGHT } from '../player/crosshair.ts';

/** How near the stall a player stands for its asks, and a resource node to gather it, as the room has them. */
export const STALL_REACH = 4;
export const NODE_REACH = 2.5;

type Point = { readonly x: number; readonly y: number };
type Node = Point & { readonly resource: number };

/** The course's resource nodes a player at `where` can gather: within reach and not yet spent for them. */
export function nodesInReach(
  where: Point,
  nodes: readonly Node[],
  gear: GearState | null,
): { readonly node: number; readonly resource: number }[] {
  return nodes.flatMap((node, index) =>
    Math.hypot(node.x - where.x, node.y - where.y) <= NODE_REACH && !gear?.spent.includes(index)
      ? [{ node: index, resource: node.resource }]
      : [],
  );
}

/** What wears a mark over it on the course's flat ground, as in the game (game/overheadMarks.ts): the stall, as over a
 *  keeper's crown, a Vestige's crystal, as Vestiges are opened there; and each resource node not yet spent, its
 *  resource's. The drops lying for the player stand as
 *  their own pictures (`combat/drops.ts`). */
export function gearMarked(stall: Point, gear: GearState | null): Marked[] {
  const [crystal] = crystalSpin(0);
  const marked: Marked[] = crystal
    ? [{ picture: crystal.body, at: [stall.x, stall.y, BODY_HEIGHT + OVER_HEAD_M] }]
    : [];
  for (const node of gear?.nodes ?? []) {
    const picture = resourcePicture(node.resource);
    if (picture) marked.push({ picture, at: [node.x, node.y, OVER_NODE_M] });
  }
  return marked;
}
