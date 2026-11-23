// The ship's part of a player's own gear message: the ship's level and stocks, and its officers, each with nodes
// laid out as an item's.
import type { GearOfficer as GearOfficerTable } from '../../../generated/messages/ts/overlook/wire/gear-officer.ts';
import type { GearShip as GearShipTable } from '../../../generated/messages/ts/overlook/wire/gear-ship.ts';
import type { GearColumn } from './gearMessages.ts';

/** A named officer as the gear message tells of them (protocol's `GearOfficer`): post 0 First Mate to 4 Lookout,
 *  grade a rarity, names by their places in content/gear/crew.json, duty 0 aboard, 1 at their post, 2 ashore; their
 *  nodes as an item's, each column's XP their service's; and an offer's wage in Aurem. */
export interface GearOfficer {
  readonly id: number;
  readonly post: number;
  readonly grade: number;
  readonly given: number;
  readonly family: number;
  readonly duty: number;
  readonly level: number;
  readonly toNext: number;
  readonly trained: number;
  readonly trainedMost: number;
  readonly strength: number;
  readonly bought: number;
  readonly chosen: readonly number[];
  readonly columns: readonly GearColumn[];
  readonly wage: number;
}

/** The ship's part of the gear message: its experience, level, Prestige, Attack and Defense and how far to its next;
 *  Timber, Canvas, Iron and Heartwood in `stocks`; its hands of its complement; its officers, the officers of the
 *  day at a pledged faction's counter, and its trim at sea (the gear crate's `ShipTrim::to_floats`, in its order). */
export interface GearShip {
  readonly xp: bigint;
  readonly level: number;
  readonly prestige: number;
  readonly attack: number;
  readonly defense: number;
  readonly toNext: number;
  readonly toNextNeeds: number;
  readonly stocks: readonly number[];
  readonly hands: number;
  readonly handsMost: number;
  readonly officers: readonly GearOfficer[];
  readonly offers: readonly GearOfficer[];
  readonly trim: readonly number[];
  /** The faction pledged to, 0 none: the one whose counter signs officers on. */
  readonly pledge: number;
}

/** An officer as a message holds them. */
function officerOf(officer: GearOfficerTable, columnsOf: (held: GearOfficerTable) => GearColumn[]): GearOfficer {
  return {
    id: officer.id(),
    post: officer.post(),
    grade: officer.grade(),
    given: officer.given(),
    family: officer.family(),
    duty: officer.duty(),
    level: officer.level(),
    toNext: officer.toNext(),
    trained: officer.trained(),
    trainedMost: officer.trainedMost(),
    strength: officer.strength(),
    bought: officer.bought(),
    chosen: Array.from(officer.chosenArray() ?? []),
    columns: columnsOf(officer),
    wage: officer.wage(),
  };
}

/** The ship's part of a message, if it holds one; its officers' columns read as an item's are (`columnsOf`). */
export function shipOf(
  ship: GearShipTable | null,
  columnsOf: (held: GearOfficerTable) => GearColumn[],
): GearShip | null {
  if (!ship) return null;
  const listed = (length: number, nth: (index: number) => GearOfficerTable | null, what: string) =>
    Array.from({ length }, (unused, index) => {
      const officer = nth(index);
      if (!officer) throw new Error(`${what} ${index} is missing`);
      return officerOf(officer, columnsOf);
    });
  return {
    xp: ship.xp(),
    level: ship.level(),
    prestige: ship.prestige(),
    attack: ship.attack(),
    defense: ship.defense(),
    toNext: ship.toNext(),
    toNextNeeds: ship.toNextNeeds(),
    stocks: Array.from(ship.stocksArray() ?? []),
    hands: ship.hands(),
    handsMost: ship.handsMost(),
    officers: listed(ship.officersLength(), (index) => ship.officers(index), 'officer'),
    offers: listed(ship.offersLength(), (index) => ship.offers(index), 'offer'),
    trim: Array.from(ship.trimArray() ?? []),
    pledge: ship.pledge(),
  };
}
