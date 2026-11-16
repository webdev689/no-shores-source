import course from '../../../content/testground/course.json' with { type: 'json' };
import type { Block } from '../rules/movementRules.ts';

/** The player starts here, facing the course to the north. */
export const START: { readonly x: number; readonly y: number } = course.start;

/** A course of blocks to try every move on, north of the start: steps to walk up, a low wall to vault, a crate to
 *  mantle, a ledge to catch on a jump and shimmy along, a tall wall to climb, and a platform reached by stairs. The
 *  server's rooms stand on the same course, so it is content both read. */
export const COURSE: readonly Block[] = course.blocks;
