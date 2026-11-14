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

/** A drafted layout, and what stopped any continent from being drafted. */
export interface Draft {
  readonly layout: LayoutContent;
  readonly issues: readonly string[];
}

/**
 * Drafts the layout from the painted land. Slot `n` (1 to 9) is the continent `slotIds[n]`. A continent in `previous`
 * whose slot is not in `changed` keeps its outline exactly: tracing it again would move its coast a little each save.
 * Every other coast is traced and simplified at the coarsest tolerance `isSimple` accepts; a continent in more than
 * one piece is not drafted, and says why. Climates and isles carry over from `previous`.
 */
export function draftLayout(
  mask: LandMask,
  slotIds: readonly string[],
  previous: LayoutContent,
  isSimple: (outline: readonly Point[]) => boolean,
  changed: ReadonlySet<number>,
): Draft {
  const continents: ContinentEntry[] = [];
  const issues: string[] = [];
  const piecesBySlot = mask.piecesByLabel();
  for (let slot = 1; slot < slotIds.length; slot++) {
    const id = slotIds[slot] ?? `continent-${slot}`;
    const loaded = previous.continents.find((continent) => continent.id === id);
    if (loaded && !changed.has(slot)) {
      continents.push(loaded);
      continue;
    }
    const pieces = piecesBySlot[slot] ?? 0;
    if (pieces === 0) continue;
    if (pieces > 1) {
      issues.push(`${id} is in ${pieces} pieces: one continent is one landmass`);
      continue;
    }
    const coast = traceCoast(mask, slot);
    const outline = TOLERANCES_M.map((tolerance) => simplifyRing(coast, tolerance)).find(isSimple) ?? coast;
    const climate = loaded?.climate;
    continents.push(climate === undefined ? { id, outline } : { id, outline, climate });
  }
  return { layout: { continents, isles: previous.isles }, issues };
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
