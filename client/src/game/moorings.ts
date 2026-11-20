// Ships lying moored beside a social space's pier while a player walks it, as the Tower's Hangar showed the ships
// that brought its Guardians: each at her place from the city's plan, her sails furled, riding a slow swell, each on
// her own beat so the two never rise together.
import type { ShipPlace } from '../ships/shipView.ts';

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
