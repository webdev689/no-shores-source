// A sea fight's light on what stands round it, as lamps of the sky's (DFO's point lights on the hulls): each gun's
// flash, each burning ship and a magazine's blast, from the effects' `light` marks, the nearest of them and of the
// lanterns and the city's lamps lit (`lampsRound`).
import type { LampPlace } from '../sky/lamps.ts';
import type { Mark } from './effects.ts';

/** The share of its light a fight's flash keeps by day: it shows faintly on a hull in the sun, fully at night. */
export const FIGHT_DAY_SHARE = 0.25;

/** The `light` marks among `marks` (window metres, heights before `shown`) as lamps in world metres: the window put
 *  back (`view`), each reaching as far as its mark has left of its reach (a flash's shrinking, a fire's flicker). */
export function fightLamps(
  marks: readonly Mark[],
  view: { readonly leftM: number; readonly topM: number },
  shown: number,
): LampPlace[] {
  const lamps: LampPlace[] = [];
  for (const mark of marks)
    if (mark.blend === 'light')
      lamps.push({
        at: [mark.x + view.leftM, mark.y + view.topM, mark.z * shown],
        reachM: mark.radius * (mark.alpha ?? 1),
        light: mark.colour,
        seed: 0,
        day: FIGHT_DAY_SHARE,
        steady: true,
      });
  return lamps;
}
