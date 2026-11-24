// The ship the player sails, as the gear the room last sent says: its hull's build as the room's rules make it, its
// name and its waterline, the Sloop's until the gear says otherwise; and whether they keep no ship yet, as the gear
// read each frame (`heard`) last said.
import type { GearState } from '../network/gearMessages.ts';
import { hullWaterline, SLOOP_HULL } from '../ships/hulls.ts';
import { calledOf } from './harbour/harbourModel.ts';
import type { HullBuild } from './shipPanel.ts';

/** The ship sailed by `gear`, each hull's build by `builds`. */
export function sailedShip(gear: () => GearState | null | undefined, builds: () => readonly HullBuild[] | null) {
  let kept: number | null = null;
  const ship = () => gear()?.ship ?? null;
  const hull = () => ship()?.sailed ?? SLOOP_HULL;
  return {
    /** Hears the gear `here` holds as the game reads it, and hands it on. */
    heard: <Here extends { readonly gear: GearState | null } | null>(here: Here): Here => {
      const now = here?.gear?.ship;
      if (now) kept = now.fleet.length;
      return here;
    },
    build: () => builds()?.[hull()] ?? null,
    called: () => calledOf(ship()?.fleet.find((each) => each.hull === hull())),
    waterline: () => hullWaterline(hull()),
    /** Whether the gear last heard keeps no ship, held while a room yet to send gear is joined. */
    shipless: () => kept === 0,
  };
}
