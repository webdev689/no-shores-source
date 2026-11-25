// The ship the player sails, as the gear the room last sent says: its hull's build as the room's rules make it, its
// name and its waterline, the Sloop's until the gear says otherwise, and the Ship tab's papers of them; and whether
// they keep no ship yet, as the gear read each frame (`heard`) last said.
import type { GearState } from '../network/gearMessages.ts';
import { hullWaterline, SLOOP_HULL } from '../ships/hulls.ts';
import { calledOf } from './harbour/harbourModel.ts';
import { type HullBuild, type Kept, shipPanelOnceBuilt, type Voyaging } from './shipPanel.ts';

/** The ship sailed by `gear`, each hull's build by `builds`. */
export function sailedShip(gear: () => GearState | null | undefined, builds: () => readonly HullBuild[] | null) {
  let kept: number | null = null;
  const ship = () => gear()?.ship ?? null;
  const hull = () => ship()?.sailed ?? SLOOP_HULL;
  const build = () => builds()?.[hull()] ?? null;
  const called = () => calledOf(ship()?.fleet.find((each) => each.hull === hull()));
  const waterline = () => hullWaterline(hull());
  return {
    /** Hears the gear `here` holds as the game reads it each frame (the menu's feed), and hands it on: so it hears
     *  every gear the rooms send. */
    heard: <Here extends { readonly gear: GearState | null } | null>(here: Here): Here => {
      const now = here?.gear?.ship;
      if (now) kept = now.fleet.length;
      return here;
    },
    build,
    called,
    waterline,
    /** The Ship tab's papers, with its voyage (`sea`) only while it is at sea and the hurts the sea keeps with it. */
    papers: (sea: Voyaging | null, hurts: Kept | null) =>
      shipPanelOnceBuilt(build(), waterline(), sea, hurts, called()),
    /** Whether the gear last heard keeps no ship, held while a room yet to send gear is joined. */
    shipless: () => kept === 0,
  };
}
