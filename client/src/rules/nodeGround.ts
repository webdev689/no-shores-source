import type { LandRules } from './landRules.ts';
import type { MovementRules } from './movementRules.ts';

/** A rect of the world: west, north, east and south, metres. */
export type Rect = readonly [number, number, number, number];

/** Stands the movement rules on a node's ground as its room stands its bodies: the open landmass's window over the
 *  rect the room's welcome names, and its city's boxes there as the course. Answers whether the window was set; the
 *  landmass open in the land's door must be the node's, its city settled. */
export function standOnNode(land: LandRules, movement: MovementRules, bounds: Rect): boolean {
  movement.setCourse(land.boxes(...bounds));
  return movement.setGround(land.window(...bounds));
}
