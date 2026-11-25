// The room's word on a player in a passage zone (the gear's dive and haul, the snapshot's `PassageSeen`) read into
// what the passages' panels are worked out from (`PassageWord`, passageWords.ts).
import type { GearItem } from '../../network/gearMessages.ts';
import type { DiveState, HaulState, PassageSeenState } from '../../network/passageMessages.ts';
import { RARITIES, STOCK_NAMES, itemName, resourceName } from '../../player/gear.ts';
import type { PassageZone } from '../../rules/passageRules.ts';
import type { DealProgress, PassageHaul, PassageWord } from './passageWords.ts';

/** The haul as the panels say it: each item by its name and rarity, the Vestiges counted, each material counted by
 *  name, and whether the cold lantern is carried. */
export function haulOf(haul: HaulState<GearItem> | undefined): PassageHaul {
  if (!haul) return { items: [], vestiges: 0, materials: [], lantern: false };
  const counted = (names: (index: number) => string, counts: readonly number[]) =>
    counts.flatMap((count, index) => (count > 0 ? [{ name: names(index), count }] : []));
  return {
    items: haul.items.map((item) => ({ name: itemName(item), rarity: RARITIES[item.rarity]?.name ?? '' })),
    vestiges: haul.vestiges.length,
    materials: [...counted((index) => STOCK_NAMES[index] ?? '', haul.stocks), ...counted(resourceName, haul.resources)],
    lantern: haul.lantern !== '',
  };
}

/** How many bits of `bits` are set. */
const counted = (bits: number) => [...bits.toString(2)].filter((bit) => bit === '1').length;

/** How far the zone's deal is, as its tracker counts it: the dead lamps lit, the tally posts or collectors down, the
 *  waves beaten, a hold's or a gauntlet's seconds left; a gauntlet past its time with its mouth unreached is late. */
export function progressOf(zone: PassageZone, seen: PassageSeenState): DealProgress {
  const count =
    zone.deal === 'kindle'
      ? counted(seen.lit)
      : zone.deal === 'sever' || zone.deal === 'reckoning'
        ? counted(seen.broken)
        : zone.deal === 'ambush'
          ? Math.max(0, seen.wave - (seen.done ? 0 : 1))
          : null;
  const timed = !seen.done && (zone.deal === 'hold' || zone.deal === 'gauntlet');
  const late = zone.deal === 'gauntlet' && !seen.done && seen.left <= 0;
  return { done: seen.done, count, seconds: timed && !late ? seen.left : null, late };
}

/** The room's word on the player in `zone`: none until the room has said it. Its mouths are open for the player all
 *  together, once its deal was done while they were in it. */
export function passageWordOf(
  zone: PassageZone,
  dive: DiveState<GearItem> | null | undefined,
  seen: PassageSeenState | null | undefined,
): PassageWord | null {
  if (!seen) return null;
  return {
    zone: zone.number,
    deal: progressOf(zone, seen),
    lampLit: zone.lamp === null ? null : seen.lampLit,
    openMouths: seen.open ? zone.onward.map((unused, place) => place) : [],
    haul: haulOf(dive?.haul),
  };
}

/** Where a dive is: its island, its web's week and its zone. */
type DiveWhere = Pick<DiveState<unknown>, 'island' | 'week' | 'zone'>;

/** The passages' refusals, as the room numbers its answers (crates/gear `Refusal`, NoDive to NotInPassage, plus one). */
const REFUSED = { first: 171, last: 178 } as const;

/** What the room has said of an ask of the passages sent when it had answered `asked.answered` asks, its dive then
 *  `asked.dive`: yes once the dive has changed (begun, gone on or ended), whatever other asks it answered meanwhile,
 *  or for an ask whose `done` is its yes, the next done;
 *  a refusal of the passages' own; unanswered once `late`; else nothing yet. */
export function answerHeard(
  asked: { readonly answered: number; readonly dive: DiveWhere | null; readonly done?: boolean },
  gear: { readonly answered: number; readonly answer: number; readonly dive?: DiveWhere | null },
  late: boolean,
): 'yes' | { readonly refused: number } | 'unanswered' | null {
  // Where the dive is, not its haul, which fills as the player finds things.
  const where = (dive: DiveWhere | null | undefined) => (dive ? `${dive.island} ${dive.week} ${dive.zone}` : 'none');
  if (where(gear.dive) !== where(asked.dive)) return 'yes';
  if (asked.done && gear.answered !== asked.answered && gear.answer === 0) return 'yes';
  const refused = gear.answered !== asked.answered && gear.answer >= REFUSED.first && gear.answer <= REFUSED.last;
  if (refused) return { refused: gear.answer };
  return late ? 'unanswered' : null;
}
