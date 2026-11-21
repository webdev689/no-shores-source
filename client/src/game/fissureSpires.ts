// The fissure's crystal spires as the room stands them while the Fissure runs (crates/room/src/public/fissure.rs
// SPIRES, the lattice-fissure module's parts): a block each, square to the grid at the fissure's mark, on the ground
// under its middle and sunk a little into it. The page's own movement and fight stand the same blocks beside the
// place's own, so what the page predicts a body does at a spire is what the room does.
import { moduleNumber, moduleParts } from '../city/modules.ts';
import { MARK, PUBLIC_KIND, PUBLIC_PHASE, type PublicEvent } from '../network/publicMessages.ts';
import type { Block } from '../rules/movementRules.ts';

/** How far a spire is sunk under the ground at its middle, metres (fissure.rs SPIRE_SUNK). */
export const SPIRE_SUNK_M = 0.3;

/** The spires' blocks for a fissure whose mark stands at (`x`, `y`), on the land `floor` gives. */
export function spireBlocks(x: number, y: number, floor: (x: number, y: number) => number): Block[] {
  return moduleParts(moduleNumber('lattice-fissure')).map(([west = 0, north = 0, , east = 0, south = 0, top = 0]) => {
    const ground = floor(x + (west + east) / 2, y + (north + south) / 2);
    return {
      minX: x + west,
      minY: y + north,
      maxX: x + east,
      maxY: y + south,
      top: ground + top,
      bottom: ground - SPIRE_SUNK_M,
    };
  });
}

/** Whatever keeps a course of blocks for bodies to run into: the page's movement, its fight. */
interface Course {
  setCourse(blocks: readonly Block[]): void;
}

/** The place's blocks, and the spires among them while a Fissure runs, kept in the page's movement and fight. */
export class SpireCourse {
  private readonly boxes: readonly Block[];
  private readonly courses: readonly Course[];
  /** Where the standing spires stand, or '' for none. */
  private standing = '';

  constructor(boxes: readonly Block[], courses: readonly Course[]) {
    this.boxes = boxes;
    this.courses = courses;
  }

  /** Stands the spires as `event` has its fissure open (running, its mark there), or takes them away; nothing for a
   *  frame with no word from the room. */
  frame(event: PublicEvent | null, floor: (x: number, y: number) => number): void {
    if (!event) return;
    const open = event.kind === PUBLIC_KIND.fissure && event.phase === PUBLIC_PHASE.running;
    const mark = open ? event.marks.find((each) => each.kind === MARK.fissure) : undefined;
    const standing = mark ? `${mark.at[0]},${mark.at[1]}` : '';
    if (standing === this.standing) return;
    this.standing = standing;
    const spires = mark ? spireBlocks(mark.at[0], mark.at[1], floor) : [];
    for (const course of this.courses) course.setCourse([...this.boxes, ...spires]);
  }
}
