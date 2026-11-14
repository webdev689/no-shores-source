import type { Block } from './motor.ts';

/** The player starts here, facing the course to the north. */
export const START = { x: 0, y: 10 } as const;

/** A course of blocks to try every move on, north of the start: steps to walk up, a low wall to vault, a crate to
 *  mantle, a ledge to hang from and shimmy along, a tall wall to climb, and a platform reached by stairs. */
export const COURSE: readonly Block[] = [
  // Steps, each under a step's height.
  { minX: -14, maxX: -11, minY: -1, maxY: 1, top: 0.25 },
  { minX: -14, maxX: -11, minY: -3, maxY: -1, top: 0.5 },
  { minX: -14, maxX: -11, minY: -5, maxY: -3, top: 0.75 },
  // A low, thin wall to vault.
  { minX: -9, maxX: -6, minY: -1.3, maxY: -1, top: 1 },
  // A crate to mantle onto.
  { minX: -4, maxX: -2, minY: -3, maxY: -1, top: 1.1 },
  // A ledge to hang from and shimmy along.
  { minX: 0, maxX: 6, minY: -3, maxY: -1, top: 1.7 },
  // A tall wall to climb.
  { minX: 8, maxX: 14, minY: -3, maxY: -1, top: 4 },
  // Stairs up to a platform.
  { minX: 16, maxX: 18, minY: -1, maxY: 1, top: 0.4 },
  { minX: 16, maxX: 18, minY: -2, maxY: -1, top: 0.8 },
  { minX: 16, maxX: 18, minY: -3, maxY: -2, top: 1.2 },
  { minX: 15, maxX: 21, minY: -8, maxY: -3, top: 1.6 },
];
