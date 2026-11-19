import course from '../../../content/testground/course.json' with { type: 'json' };
import type { Block } from '../rules/movementRules.ts';

/** The player starts here, facing the course to the north. */
export const START: { readonly x: number; readonly y: number } = course.start;

/** A course of blocks to try every move on, north of the start: steps to walk up, a low wall to vault, a crate to
 *  mantle, a ledge to catch on a jump and shimmy along, a tall wall to climb, and a platform reached by stairs. The
 *  server's rooms stand on the same course, so it is content both read. */
export const COURSE: readonly Block[] = course.blocks;
/** The course's wooden blocks, its crate, which a footstep sounds on as wood. */
export const WOODEN: readonly Block[] = course.blocks.filter((block) => block.what.includes('crate'));

/** The stall south-east of the start, where Vestiges are identified and the vault is reached, as in a social space:
 *  the room answers those asks within reach of it. */
export const STALL: { readonly x: number; readonly y: number } = course.stall;

/** The resource nodes west of the start, each an island's resource by its place in the gear's list. */
export const RESOURCE_NODES: readonly { readonly x: number; readonly y: number; readonly resource: number }[] =
  course.resources;
