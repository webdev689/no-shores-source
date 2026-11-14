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
 * Drafts the layout from the painted land. Slot `n` (1 to 9) is the continent `slotIds[n]`. Each continent's coast
 * is traced and simplified at the coarsest tolerance `isSimple` accepts; a continent in more than one piece is not
 * drafted, and says why. Climates and isles carry over from `previous`.
 */
export function draftLayout(
  mask: LandMask,
  slotIds: readonly string[],
  previous: LayoutContent,
  isSimple: (outline: readonly Point[]) => boolean,
): Draft {
  const continents: ContinentEntry[] = [];
  const issues: string[] = [];
  const piecesBySlot = mask.piecesByLabel();
  for (let slot = 1; slot < slotIds.length; slot++) {
    const id = slotIds[slot] ?? `continent-${slot}`;
    const pieces = piecesBySlot[slot] ?? 0;
    if (pieces === 0) continue;
    if (pieces > 1) {
      issues.push(`${id} is in ${pieces} pieces: one continent is one landmass`);
      continue;
    }
    const coast = traceCoast(mask, slot);
    const outline = TOLERANCES_M.map((tolerance) => simplifyRing(coast, tolerance)).find(isSimple) ?? coast;
    const climate = previous.continents.find((continent) => continent.id === id)?.climate;
    continents.push(climate === undefined ? { id, outline } : { id, outline, climate });
  }
  return { layout: { continents, isles: previous.isles }, issues };
}

/** The continents' ids by slot, 1 to 9: those already in the layout first, in order, then new ones. */
export function slotIdsFor(layout: LayoutContent, slots: number): string[] {
  const ids = [''];
  const taken = new Set(layout.continents.map((continent) => continent.id));
  layout.continents.slice(0, slots).forEach((continent) => ids.push(continent.id));
  for (let next = 1; ids.length <= slots; next++) {
    const id = `continent-${next}`;
    if (!taken.has(id)) ids.push(id);
  }
  return ids;
}
