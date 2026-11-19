import { markRing } from '../combat/marks.ts';
import type { GearState } from '../network/gearMessages.ts';

/** How near the stall a player stands for its asks, and a resource node to gather it, as the room has them. */
export const STALL_REACH = 4;
export const NODE_REACH = 2.5;
/** The stall's ring in brass, a resource node's in sea green (dim once spent), and a Vestige's in its rarity's colour,
 *  each beating slowly so it is seen across the ground. */
const BRASS = [0.93, 0.74, 0.32] as const;
const NODE = [0.35, 0.85, 0.7] as const;
const VESTIGE: readonly (readonly [number, number, number])[] = [
  [0.91, 0.89, 0.85],
  [0.44, 0.62, 0.91],
  [0.89, 0.76, 0.31],
  [0.88, 0.63, 0.18],
  [0.31, 0.85, 0.94],
];

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

/** The rings on the ground: the stall, the resource nodes and the Vestiges lying for the player, at `seconds` of the
 *  page's clock. */
export function gearRings(stall: Point, nodes: readonly Node[], gear: GearState | null, seconds: number): number[] {
  const out: number[] = [];
  const beat = 0.55 + 0.25 * Math.sin(seconds * 3);
  markRing(out, [stall.x, stall.y, 0], STALL_REACH - 0.12, STALL_REACH, [...BRASS, 0.8]);
  markRing(out, [stall.x, stall.y, 0], 0, 0.6, [...BRASS, beat]);
  nodes.forEach((node, index) => {
    const spent = gear?.spent.includes(index) ?? false;
    markRing(out, [node.x, node.y, 0], 0.3, 0.5, [...NODE, spent ? 0.2 : beat]);
  });
  for (const drop of gear?.drops ?? []) {
    const colour = VESTIGE[drop.rarity] ?? VESTIGE[0] ?? BRASS;
    markRing(out, drop.at, 0.15, 0.45, [...colour, beat + 0.2]);
  }
  return out;
}
