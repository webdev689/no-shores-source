// The lore as the gear message carries it (crates/protocol gear_wire): the chapters a player has found, and those
// lying in their room's node that they have not.
import type { Gear } from '../../../generated/messages/ts/overlook/wire/gear.ts';

/** The lore's ask: a chapter lying in the node found, by its number in `item` (its place in content/lore/lore.json,
 *  book by book). */
export const LORE_ASKS = { findLore: 73 } as const;

/** A chapter of the lore lying in the node: its number, and where it lies, x and y. */
export interface LoreLying {
  readonly chapter: number;
  readonly at: readonly [number, number];
}

/** The lore's chapters a player has found, by their place in content/lore/lore.json, book by book, in the order
 *  found; and those lying in this room's node that they have not, each its number and where it lies. */
export interface LoreState {
  readonly lore?: readonly number[];
  readonly loreHere?: readonly LoreLying[];
}

/** The lore a gear message carries: the chapters found, and those lying here, three numbers a chapter (its number,
 *  x and y). */
export function loreOf(gear: Gear): Required<LoreState> {
  const lying = Array.from(gear.loreHereArray() ?? []);
  const loreHere = Array.from({ length: Math.floor(lying.length / 3) }, (unused, place) => {
    const [chapter = 0, x = 0, y = 0] = lying.slice(place * 3, place * 3 + 3);
    return { chapter, at: [x, y] as const };
  });
  return { lore: Array.from(gear.loreArray() ?? []), loreHere };
}
