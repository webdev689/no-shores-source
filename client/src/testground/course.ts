import course from '../../../content/testground/course.json' with { type: 'json' };
import type { Block } from '../rules/movementRules.ts';
import { rockBlocks } from './rockRow.ts';

/** A course of blocks to try every move on, north of the start: steps to walk up, a low wall to vault, a crate to
 *  mantle, a ledge to catch on a jump and shimmy along, a tall wall to climb, and a platform reached by stairs. The
 *  server's rooms stand on the same course, so it is content both read. */
export const COURSE: readonly Block[] = course.blocks;
/** Whether the page stands the natural rocks east of the course (`?rock`, offline only: a room's course has none). */
export const ROCKS_SHOWN =
  typeof location !== 'undefined' && /[?&]rock(&|=|$)/.test(location.search) && !/[?&]room=/.test(location.search);
/** What the page's body and its room in the page stand against: the course, and the rocks when they are shown. */
export const STOOD: readonly Block[] = ROCKS_SHOWN ? [...COURSE, ...rockBlocks()] : COURSE;

/** The player starts here, facing the course to the north. With the rocks shown, `?rock=<east>,<south>[,<bearing>,
 *  <degrees down>]` starts it there instead, looking that way, to picture a rock from in front of it or under it. */
export const START: { readonly x: number; readonly y: number; readonly yaw?: number; readonly pitch?: number } =
  (() => {
    const asked = ROCKS_SHOWN ? new URLSearchParams(location.search).get('rock')?.split(',').map(Number) : undefined;
    if (!asked || asked.length < 2 || !asked.every(Number.isFinite)) return course.start;
    const [x, y, bearing, down] = asked;
    const radians = (degrees: number | undefined): number | undefined =>
      degrees === undefined ? undefined : (degrees * Math.PI) / 180;
    return { x, y, yaw: radians(bearing), pitch: radians(down) };
  })();
/** The course's wooden blocks, its crate, which a footstep sounds on as wood. */
export const WOODEN: readonly Block[] = course.blocks.filter((block) => block.what.includes('crate'));

/** The stall south-east of the start, where Vestiges are identified and the vault is reached, as in a social space:
 *  the room answers those asks within reach of it. */
export const STALL: { readonly x: number; readonly y: number } = course.stall;

/** The resource nodes west of the start, each an island's resource by its place in the gear's list. */
export const RESOURCE_NODES: readonly { readonly x: number; readonly y: number; readonly resource: number }[] =
  course.resources;
