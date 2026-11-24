// The chests and searchable containers as the gear message carries them (crates/protocol finds_wire): those standing
// in the player's room that they have not opened, each by its number, which the ask that opens it names.
import type { Gear } from '../../../generated/messages/ts/overlook/wire/gear.ts';

/** The finds' ask: a chest or a container begun to be opened, E held, by its number in `item`; let go of by the
 *  gather's stop. */
export const FIND_ASKS = { openFind: 75 } as const;

/** A chest standing for the player: its number, the middle of its foot (x, y, z) and the way its front faces
 *  (radians clockwise from north). */
export interface GearChest {
  readonly number: number;
  readonly at: readonly [number, number, number];
  readonly facing: number;
}

/** A container searchable for the player: its number, its box across (west, north, east, south), its foot and its
 *  top, and its model, which names it. */
export interface GearSearchable {
  readonly number: number;
  readonly box: readonly [number, number, number, number];
  readonly foot: number;
  readonly top: number;
  readonly model: number;
}

/** The finds standing for a player, as their gear carries them, and the number of the last the room paid them for (0
 *  none). */
export interface FindState {
  readonly chests?: readonly GearChest[];
  readonly searchables?: readonly GearSearchable[];
  readonly opened?: number;
}

/** Each run of `size` numbers of a list. */
const runs = (numbers: readonly number[], size: number): number[][] =>
  Array.from({ length: Math.floor(numbers.length / size) }, (unused, place) =>
    numbers.slice(place * size, place * size + size),
  );

/** The finds a gear message carries: five numbers a chest, eight a container. */
export function findsOf(gear: Gear): Required<FindState> {
  const chests = runs(Array.from(gear.chestsArray() ?? []), 5).map(([number = 0, x = 0, y = 0, z = 0, facing = 0]) => ({
    number,
    at: [x, y, z] as const,
    facing,
  }));
  const held = Array.from(gear.searchablesArray() ?? []);
  const searchables = runs(held, 8).map(
    ([number = 0, west = 0, north = 0, east = 0, south = 0, foot = 0, top = 0, model = 0]) => ({
      number,
      box: [west, north, east, south] as const,
      foot,
      top,
      model,
    }),
  );
  return { chests, searchables, opened: gear.opened() };
}
