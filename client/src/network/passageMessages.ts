// The passages as the room's word carries them (crates/protocol passage_wire): in the gear, the player's dive and its
// haul, each island's lamps lit this week and its day's lamp, and their Atheric bounties; in the snapshot, a passage
// zone's deal as it stands for them (`PassageSeen`).
import type { Gear } from '../../../generated/messages/ts/overlook/wire/gear.ts';
import type { GearItem as GearItemTable } from '../../../generated/messages/ts/overlook/wire/gear-item.ts';
import type { Snapshot } from '../../../generated/messages/ts/overlook/wire/snapshot.ts';

/** The passages' asks (`passage_wire`): go on through the onward mouth `column`; kindle the dead lamp `column`; light
 *  the zone's lamp; go home from it; begin a dive at the patrol zone's mouth `column`, by the route `slot` (0 public,
 *  1 a company's), at the lamp `node` lit this week (0 at the mouth). */
export const PASSAGE_ASKS = {
  goOn: 81,
  kindle: 82,
  lightLamp: 83,
  goHome: 84,
  beginDive: 85,
} as const;

/** What a dive carries and has not kept: its Vestiges and items as the gear's, its stocks (Weapon and Armor
 *  Fragments, then Essence), each island's resource in the catalogue's order, and the Atheric bounty whose find it
 *  holds (the cold lantern), empty for none. */
export interface HaulState<Item> {
  readonly vestiges: readonly { readonly rarity: number; readonly slot: number; readonly level: number }[];
  readonly items: readonly Item[];
  readonly stocks: readonly number[];
  readonly resources: readonly number[];
  readonly lantern: string;
}

/** A dive under way: its island (a continent's id) and the week of its web, the zone it is in and that zone's depth,
 *  the deepest lamp lit (0 none), its route (0 public, 1 a company's), the patrol zone's mouth it began at, whether the
 *  zone's deal was done while the player was in it, and its haul. */
export interface DiveState<Item> {
  readonly island: string;
  readonly week: number;
  readonly zone: number;
  readonly depth: number;
  readonly lamp: number;
  readonly route: number;
  readonly mouth: number;
  readonly done: boolean;
  readonly haul: HaulState<Item>;
}

/** An island's passages' lamps for a player: the lamps lit this week by number (1 to 4), and whether the day's lamp
 *  paid today. */
export interface IslandLamps {
  readonly island: string;
  readonly lamps: readonly number[];
  readonly dayLamp: boolean;
}

/** An Atheric bounty as it stands for a player: its id in content/gear/atheric_bounties.json, the step they are on
 *  (from 0) and their count toward it, and whether it is finished. */
export interface AthericBountyState {
  readonly id: string;
  readonly step: number;
  readonly count: number;
  readonly finished: boolean;
}

/** The passages' part of a player's gear: none of each from a room that sends none. */
export interface PassageGearState<Item> {
  readonly dive?: DiveState<Item> | null;
  readonly islandLamps?: readonly IslandLamps[];
  readonly athericBounties?: readonly AthericBountyState[];
}

/** The passages a gear message carries, its items read by `itemOf`. */
export function passagesOf<Item>(gear: Gear, itemOf: (item: GearItemTable) => Item): Required<PassageGearState<Item>> {
  const dive = gear.dive();
  const haul = dive?.haul();
  const vestiges = Array.from({ length: haul?.vestigesLength() ?? 0 }, (unused, index) => {
    const vestige = haul?.vestiges(index);
    return { rarity: vestige?.rarity() ?? 0, slot: vestige?.slot() ?? 0, level: vestige?.level() ?? 0 };
  });
  const items = Array.from({ length: haul?.itemsLength() ?? 0 }, (unused, index) => {
    const item = haul?.items(index);
    if (!item) throw new Error(`haul item ${index} is missing`);
    return itemOf(item);
  });
  const read = dive && {
    island: dive.island() ?? '',
    week: dive.week(),
    zone: dive.zone(),
    depth: dive.depth(),
    lamp: dive.lamp(),
    route: dive.route(),
    mouth: dive.mouth(),
    done: dive.done(),
    haul: {
      vestiges,
      items,
      stocks: Array.from(haul?.stocksArray() ?? []),
      resources: Array.from(haul?.resourcesArray() ?? []),
      lantern: haul?.lantern() ?? '',
    },
  };
  const islandLamps = Array.from({ length: gear.islandLampsLength() }, (unused, index) => {
    const lamps = gear.islandLamps(index);
    return {
      island: lamps?.island() ?? '',
      lamps: Array.from(lamps?.lampsArray() ?? []),
      dayLamp: lamps?.dayLamp() ?? false,
    };
  });
  const athericBounties = Array.from({ length: gear.athericBountiesLength() }, (unused, index) => {
    const bounty = gear.athericBounties(index);
    const [id, step, count] = [bounty?.id() ?? '', bounty?.step() ?? 0, bounty?.count() ?? 0];
    return { id, step, count, finished: bounty?.finished() ?? false };
  });
  return { dive: read ?? null, islandLamps, athericBounties };
}

/** A hold's target as it crosses: the lamp's, and none under way. */
export const HOLDING_LAMP = 255;
const NOT_HOLDING = 254;

/** A passage zone's deal as it stands for one player: its key (crates/passage's `Deal::key`), whether it is done,
 *  the dead lamps lit and the targets down (a bit each, in their order), the share of a Hold's ring held, the seconds
 *  left (a Hold's, a Gauntlet's, or until a public deal begins again), the waves called, whether the zone's mouths are
 *  open for the player and its lamp lit for them, and their hold of E under way (a dead lamp's number, or
 *  `HOLDING_LAMP`, and its share), null with none. */
export interface PassageSeenState {
  readonly deal: string;
  readonly done: boolean;
  readonly lit: number;
  readonly broken: number;
  readonly held: number;
  readonly left: number;
  readonly wave: number;
  readonly open: boolean;
  readonly lampLit: boolean;
  readonly holding: { readonly target: number; readonly share: number } | null;
}

/** The passage zone's deal a snapshot carries; null in any other room. */
export function passageSeenOf(snapshot: Snapshot): PassageSeenState | null {
  const seen = snapshot.passage();
  if (!seen) return null;
  const target = seen.holding();
  return {
    deal: seen.deal() ?? '',
    done: seen.done(),
    lit: seen.lit(),
    broken: seen.broken(),
    held: seen.held(),
    left: seen.left(),
    wave: seen.wave(),
    open: seen.open(),
    lampLit: seen.lampLit(),
    holding: target === NOT_HOLDING ? null : { target, share: seen.holdingShare() },
  };
}
