// Ships lying moored beside a social space's pier while a player walks it, as the Tower's Hangar showed the ships
// that brought its Guardians: each at her place from the city's plan, her sails furled, riding a slow swell, each on
// her own beat so the two never rise together.
import { hullSails, hullWaterline, SLOOP_HULL } from '../ships/hulls.ts';
import { SailRig } from '../ships/sails.ts';
import type { DrawnShip } from '../ships/shipModels.ts';
import type { ShipPlace } from '../ships/shipView.ts';
import type { HullMask } from '../water/hullMask.ts';

/** How far a moored ship rises and falls, metres, and how far she pitches and rolls, radians; how long a swell takes
 *  to pass under her, seconds. */
export const MOORED_SWELL = { heave: 0.14, pitch: 0.012, roll: 0.02, seconds: 9 } as const;

/** Each moored ship's place at `time` (seconds): on the sea at its level, riding the swell. */
export function mooredPlaces(moorings: readonly (readonly [number, number, number])[], time: number): ShipPlace[] {
  return moorings.map(([x, y, heading], index) => {
    const phase = ((time / MOORED_SWELL.seconds) * 2 + index * 0.37) * Math.PI;
    return {
      x,
      y,
      z: MOORED_SWELL.heave * Math.sin(phase),
      heading,
      pitch: MOORED_SWELL.pitch * Math.sin(phase + 1.1),
      roll: MOORED_SWELL.roll * Math.sin(phase * 0.7 + 0.4),
    };
  });
}

/** Furled sails: a rig never set. */
const FURLED = new SailRig(hullSails(SLOOP_HULL));

/** The moored ships as a frame draws them, friendly sloops with their sails furled, and their still footprints on the
 *  water. */
export function mooredShips(
  moorings: readonly (readonly [number, number, number])[],
  time: number,
): { ships: DrawnShip[]; hulls: HullMask[] } {
  const places = mooredPlaces(moorings, time);
  const { lengthM, beamM } = hullWaterline(SLOOP_HULL);
  return {
    ships: places.map((place) => ({ hull: SLOOP_HULL, place, rig: FURLED, look: { side: 'friendly' } })),
    hulls: places.map(({ x, y, heading }) => ({ x, y, heading, halfLength: lengthM / 2, halfBeam: beamM / 2, way: 0 })),
  };
}
