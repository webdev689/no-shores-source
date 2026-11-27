// Ships' lanterns, as DFO hung them: on poles at her quarters' rails, at her taffrail and by her cabin's door. The
// taffrail's is her mesh's own where it carries one (its place in her manifest, `shipLanterns`); the rest are ours,
// placed by each hull's parts, measured from its published mesh (its frame: x to its bow, y to starboard, z up from
// its waterline). Every one burns and lights as a ship's lantern does (`shipModels.ts`) unless she runs dark: the Grey
// Tithe's always, a friendly ship running from an attack. Far off at night, up to four of a lit ship's lanterns are
// warm points over the water, sized and faded as DFO drew them (`shipLights.ts`).
import type { ShipLook } from './dress.ts';
import type { HullName } from './hulls.ts';

type Point = readonly [number, number, number];

/** A lantern of ours: its glass's middle in its ship's frame; what it hangs by (a pole standing from its height `pole`,
 *  or an arm out from a wall at its `arm` along the ship). */
export interface Lantern {
  readonly at: Point;
  readonly hung: { readonly pole: number } | { readonly arm: number };
}

/** Where each hull's lanterns of ours hang. The Schooner, the Brig and the Frigate carry their taffrail's lantern in
 *  their mesh (`ship_details.py`), and have a companionway whose door a lantern hangs beside; the Sloop carries
 *  neither, so its taffrail lantern stands on a pole of ours. Each hull's quarters carry two on poles at the rail. */
export const HULL_LANTERNS: Readonly<Record<HullName, readonly Lantern[]>> = {
  sloop: [
    { at: [-9.35, 0, 3.85], hung: { pole: 2.7 } },
    { at: [-5.75, -2.85, 3.85], hung: { pole: 2.7 } },
    { at: [-5.75, 2.85, 3.85], hung: { pole: 2.7 } },
  ],
  schooner: [
    { at: [-9.65, -2.445, 4.94], hung: { pole: 3.79 } },
    { at: [-9.65, 2.445, 4.94], hung: { pole: 3.79 } },
    { at: [-4.55, 0.62, 2.95], hung: { arm: -4.82 } },
  ],
  brig: [
    { at: [-12.42, -3.005, 5.4], hung: { pole: 4.25 } },
    { at: [-12.42, 3.005, 5.4], hung: { pole: 4.25 } },
    { at: [-6.515, 0.62, 3.285], hung: { arm: -6.785 } },
  ],
  frigate: [
    { at: [-16.05, -3.305, 5.97], hung: { pole: 4.82 } },
    { at: [-16.05, 3.305, 5.97], hung: { pole: 4.82 } },
    { at: [-7.35, 0.62, 3.674], hung: { arm: -7.62 } },
  ],
};

/** A far ship's lanterns: drawn from LAMP_NEAR_M, whole LAMP_FADE_M past it; never under LAMP_MIN_M across, and
 *  LAMP_ANGLE of the eye's view (radians) at any range; at most LAMP_MOST of a ship's. */
export const LAMP_NEAR_M = 45;
export const LAMP_FADE_M = 45;
export const LAMP_MIN_M = 0.5;
export const LAMP_ANGLE = 0.004;
export const LAMP_MOST = 4;
export const LAMP_COLOUR = [1, 0.62, 0.22] as const;

/** A far lamp's size, metres across, `distance` metres from the eye. */
export const lampSize = (distance: number): number => Math.max(LAMP_MIN_M, distance * LAMP_ANGLE);

/** A far lamp's strength (0 to 1) `distance` metres from the eye: none within LAMP_NEAR_M, where the lantern is seen. */
export const lampAlpha = (distance: number): number => Math.min(1, Math.max(0, (distance - LAMP_NEAR_M) / LAMP_FADE_M));

/** Up to LAMP_MOST of `points`, spread along the list (a ship's lanterns hang stern to stem in its order): the first,
 *  the last and between. */
export function lampPoints<T>(points: readonly T[]): T[] {
  if (points.length <= LAMP_MOST) return points.slice();
  return Array.from(
    { length: LAMP_MOST },
    (unused, nth) => points[Math.round((nth * (points.length - 1)) / (LAMP_MOST - 1))] as T,
  );
}

/** Whether a ship drawn in `look` shows her lanterns at night: the Grey Tithe's never, nor one running dark. */
export function lanternsLit(look: Pick<ShipLook, 'side' | 'dark'>): boolean {
  return look.side !== 'tithe' && !look.dark;
}
