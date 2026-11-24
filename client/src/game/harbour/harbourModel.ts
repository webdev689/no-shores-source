// What the Harbourmaster's counter offers the player, from the gear the room last sent and the shipyard's own file
// (content/gear/shipyard.json, which the rules read too): each hull as kept, sailed, sold or not yet, with its price
// and what of it the player is short of; each dress of a part as worn on the ship chosen, kept, sold or not yet; and
// what naming a ship costs. The room is the judge of every ask; this only says what the page offers.
import shipyard from '../../../../content/gear/shipyard.json' with { type: 'json' };
import { ASKS, type GearAsk, type GearState } from '../../network/gearMessages.ts';
import type { GearKeptShip } from '../../network/shipMessages.ts';
import { DRESS_PARTS, type DressEntry, type DressPart, SHIP_DRESSES, dressOn } from '../../ships/fleetDress.ts';

/** The shipyard as its file holds it. */
export const SHIPYARD = shipyard;
/** A name's word's place for none, as the wire carries it. */
export const NO_WORD = 255;
/** The Sloop's number, the ship every player starts with. */
export const SLOOP = 0;

/** How a hull stands at the counter: the one sailed, kept at the harbour, to be had, short of its price, not sold yet
 *  at the ship's level, or given in the welcome and not yet handed over. */
export type HullState = 'sailing' | 'kept' | 'buy' | 'short' | 'locked' | 'given';

/** A hull at the counter: its number, name and words, how it stands, the ship level it is sold from, its price in
 *  Aurem and in Timber, Canvas, Iron and Heartwood with what of each the player is short of, the ask that has it or
 *  sails it (none while none would be answered), and its name once kept and named. */
export interface HullOffer {
  readonly hull: number;
  readonly name: string;
  readonly words: string;
  readonly state: HullState;
  readonly level: number;
  readonly aurem: number;
  readonly materials: readonly [number, number, number, number];
  readonly short: { readonly aurem: boolean; readonly materials: readonly boolean[] };
  readonly ask: GearAsk | null;
  readonly called: string | null;
}

/** A ship kept's name as a reader sees it, "the Grey Gull"; none before it is named. */
export function calledOf(ship: Pick<GearKeptShip, 'name'> | undefined): string | null {
  const [first, second] = ship?.name ?? [];
  const words = [
    first !== undefined && first !== NO_WORD ? shipyard.first[first] : undefined,
    second !== undefined && second !== NO_WORD ? shipyard.second[second] : undefined,
  ].filter((word): word is string => word !== undefined);
  return words.length > 0 ? `the ${words.join(' ')}` : null;
}

/** The ships kept, the one sailed, and the ship's level and stocks, as the gear message has them; a room that sends
 *  no ship's part keeps none. */
function fleetOf(gear: GearState) {
  const ship = gear.ship;
  return {
    fleet: ship?.fleet ?? [],
    sailed: ship?.sailed ?? SLOOP,
    level: ship?.level ?? 1,
    stocks: ship?.stocks ?? [],
    dresses: ship?.dresses ?? [],
  };
}

/** Every hull at the counter, in the shipyard's order. */
export function hullOffers(gear: GearState): HullOffer[] {
  const { fleet, sailed, level, stocks } = fleetOf(gear);
  return shipyard.hulls.map((found, hull): HullOffer => {
    const kept = fleet.find((ship) => ship.hull === hull);
    const materials = [found.timber, found.canvas, found.iron, found.heartwood] as const;
    const short = {
      aurem: gear.aurem < found.aurem,
      materials: materials.map((count, place) => (stocks[place] ?? 0) < count),
    };
    const state: HullState = kept
      ? hull === sailed
        ? 'sailing'
        : 'kept'
      : found.given
        ? 'given'
        : fleet.length === 0 || level < found.level
          ? 'locked'
          : short.aurem || short.materials.some(Boolean)
            ? 'short'
            : 'buy';
    const ask: GearAsk | null =
      state === 'kept'
        ? { kind: ASKS.sailShip, column: hull }
        : state === 'buy'
          ? { kind: ASKS.buyShip, column: hull }
          : null;
    const base = { hull, name: found.name, words: found.words, level: found.level, aurem: found.aurem };
    return { ...base, state, materials, short, ask, called: calledOf(kept) };
  });
}

/** How a dress stands for a ship: worn on it, kept and ready to lay, to be had, short of its price, not sold yet at
 *  the ship's level, or a faction's, kept only at its rank. */
export type DressState = 'worn' | 'kept' | 'buy' | 'short' | 'locked' | 'faction';

/** A dress at the counter: its number and entry, how it stands for the ship chosen, and the ask that buys it or
 *  lays it (none while none would be answered). */
export interface DressTile {
  readonly number: number;
  readonly entry: DressEntry;
  readonly state: DressState;
  readonly ask: GearAsk | null;
}

/** Each part's dresses for the ship kept of `hull`, in the parts' order: what is worn on it, and how each other stands
 *  by the gear. None for a ship not kept. */
export function dressRows(gear: GearState, hull: number): { readonly part: DressPart; readonly tiles: DressTile[] }[] {
  const { fleet, level, dresses } = fleetOf(gear);
  const ship = fleet.find((kept) => kept.hull === hull);
  if (!ship) return [];
  return DRESS_PARTS.map((part, index) => {
    const worn = dressOn(part, ship.dress[index]);
    const tiles = SHIP_DRESSES.flatMap((entry, number): DressTile[] => {
      if (entry.part !== part) return [];
      const kept = dresses.includes(number) || entry.source.kind === 'start';
      const price = entry.source.aurem ?? 0;
      const state: DressState =
        entry.id === worn?.id
          ? 'worn'
          : kept
            ? 'kept'
            : entry.source.kind === 'faction'
              ? 'faction'
              : level < (entry.source.level ?? 1)
                ? 'locked'
                : gear.aurem < price
                  ? 'short'
                  : 'buy';
      const ask: GearAsk | null =
        state === 'kept'
          ? { kind: ASKS.dressShip, column: hull, item: number }
          : state === 'buy'
            ? { kind: ASKS.buyDress, item: number }
            : null;
      return [{ number, entry, state, ask }];
    });
    return { part, tiles };
  });
}

/** What naming a ship kept costs now: nothing the first time, the shipyard's price after. */
export function namingPrice(ship: Pick<GearKeptShip, 'named'> | undefined): number {
  return ship?.named ? shipyard.renaming : 0;
}

/** The ask that names the ship of `hull` from two words by their places, `NO_WORD` for no first word. */
export function nameAsk(hull: number, first: number, second: number): GearAsk {
  return { kind: ASKS.nameShip, column: hull, node: first, slot: second };
}
