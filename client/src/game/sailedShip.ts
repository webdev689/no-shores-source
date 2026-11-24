// The ship the player sails, as the gear the room last sent says: its hull's build as the room's rules make it, its
// name and its waterline, the Sloop's until the gear says otherwise; and whether they keep no ship yet, as last heard.
import type { GearState } from '../network/gearMessages.ts';
import { hullWaterline, SLOOP_HULL } from '../ships/hulls.ts';
import { calledOf } from './harbour/harbourModel.ts';
import type { HullBuild } from './shipPanel.ts';

/** The ship sailed by `gear`, each hull's build by `builds`. */
export function sailedShip(gear: () => GearState | null | undefined, builds: () => readonly HullBuild[] | null) {
  let kept: number | null = null;
  const ship = () => {
    const now = gear()?.ship;
    if (now) kept = now.fleet.length;
    return now ?? null;
  };
  const hull = () => ship()?.sailed ?? SLOOP_HULL;
  return {
    build: () => builds()?.[hull()] ?? null,
    called: () => calledOf(ship()?.fleet.find((each) => each.hull === hull())),
    waterline: () => hullWaterline(hull()),
    /** Whether the gear last heard keeps no ship: kept while a room yet to send gear is joined. */
    shipless: () => kept === 0,
  };
}
