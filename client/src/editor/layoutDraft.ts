import { type LandMask } from './landMask.ts';
import { simplifyRing, traceCoast, type Point } from './traceCoast.ts';

/** A continent as the layout file holds it. */
export interface ContinentEntry {
  readonly id: string;
  readonly outline: readonly Point[];
  readonly climate?: string;
}

/** The layout file's content. Isles pass through the editor untouched for now. */
export interface LayoutContent {
  readonly continents: readonly ContinentEntry[];
  readonly isles: readonly unknown[];
}

/** Tolerances tried when simplifying a coast, coarsest first, down to none. */
export const TOLERANCES_M = [2_000, 1_000, 500, 0] as const;

/** Something wrong with the painted land, and where on the map it is, when it is one place. */
export interface Issue {
  readonly text: string;
  readonly at?: { readonly x: number; readonly y: number };
}

/** A drafted layout, what stopped any continent from being drafted, and the painted continents it leaves out. */
export interface Draft {
  readonly layout: LayoutContent;
  readonly issues: readonly Issue[];
  readonly heldBack: readonly string[];
}

/** How many of one continent's stray pieces are listed one by one; past that they are counted. */
const STRAYS_LISTED = 5;

/**
 * Drafts the layout from the painted land. Slot `n` (1 to 9) is the continent `slotIds[n]`. A continent in `previous`
 * whose slot is not in `changed` keeps its outline exactly: tracing it again would move its coast a little each save.
 * Every other coast is traced and simplified at the coarsest tolerance `isSimple` accepts. A continent in more than
 * one piece is held back, with an issue at each stray piece, largest first. Climates and isles carry over.
 */
export function draftLayout(
  mask: LandMask,
  slotIds: readonly string[],
  previous: LayoutContent,
  isSimple: (outline: readonly Point[]) => boolean,
  changed: ReadonlySet<number>,
): Draft {
  const continents: ContinentEntry[] = [];
  const issues: Issue[] = [];
  const heldBack: string[] = [];
  const pieces = mask.pieces();
  for (let slot = 1; slot < slotIds.length; slot++) {
    const id = slotIds[slot] ?? `continent-${slot}`;
    const loaded = previous.continents.find((continent) => continent.id === id);
    if (loaded && !changed.has(slot)) {
      continents.push(loaded);
      continue;
    }
    const own = pieces.filter((piece) => piece.label === slot).sort((first, second) => second.cells - first.cells);
    if (own.length === 0) continue;
    if (own.length > 1) {
      heldBack.push(id);
      const strays = own.slice(1);
      issues.push({ text: `${id} is in ${own.length} pieces, so Save leaves it out: join or erase the strays` });
      for (const stray of strays.slice(0, STRAYS_LISTED)) {
        const size = stray.cells.toLocaleString('en-US');
        issues.push({ text: `${id}: a stray piece of ${size} km² (show it)`, at: { x: stray.x, y: stray.y } });
      }
      if (strays.length > STRAYS_LISTED) issues.push({ text: `${id}: ${strays.length - STRAYS_LISTED} more strays` });
      continue;
    }
    const coast = traceCoast(mask, slot);
    const outline = TOLERANCES_M.map((tolerance) => simplifyRing(coast, tolerance)).find(isSimple) ?? coast;
    const climate = loaded?.climate;
    continents.push(climate === undefined ? { id, outline } : { id, outline, climate });
  }
  return { layout: { continents, isles: previous.isles }, issues, heldBack };
}

/**
 * The continents' ids by slot, 1 to 9. `continent-N` keeps slot N, so a reopened layout keys and colours each
 * continent as it was painted. Other ids take the free slots in order, and the slots left get new ids.
 */
export function slotIdsFor(layout: LayoutContent, slots: number): string[] {
  const bySlot = new Map<number, string>();
  const rest: string[] = [];
  for (const { id } of layout.continents) {
    const slot = Number(/^continent-(\d+)$/.exec(id)?.[1] ?? 0);
    if (slot >= 1 && slot <= slots && !bySlot.has(slot)) bySlot.set(slot, id);
    else rest.push(id);
  }
  const ids = [''];
  for (let slot = 1; slot <= slots; slot++) ids.push(bySlot.get(slot) ?? rest.shift() ?? `continent-${slot}`);
  return ids;
}
