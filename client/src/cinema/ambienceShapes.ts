// The sea's and the storm's sounds as numbers: how levels glide, how thunder changes with distance, and when spot
// sounds fall due. Nothing here touches Web Audio, so each shape is tested on its own.

/** How fast sound crosses the air, in kilometres a second: thunder is heard this long after its flash. */
export const SOUND_KM_S = 0.343;

/** Clamps a bed's level to 0 (silent) to 1 (full); anything that is not a number is silence. */
export const clampLevel = (level: number): number => (Number.isFinite(level) ? Math.min(1, Math.max(0, level)) : 0);

/** A level `elapsedS` into its glide from `from` to `to` over `glideS`, eased at both ends so a gain never lurches. */
export function glided(from: number, to: number, elapsedS: number, glideS: number): number {
  if (glideS <= 0 || elapsedS >= glideS) return to;
  const along = Math.max(0, elapsedS / glideS);
  return from + (to - from) * along * along * (3 - 2 * along);
}

/** Thunder at a distance: how long after the flash, whether it cracks (a close strike tears; a far one only rolls),
 *  and how loud. */
export function thunderShape(distanceKm: number): {
  readonly delayS: number;
  readonly crack: boolean;
  readonly gain: number;
} {
  const kilometres = Math.max(0, Number.isFinite(distanceKm) ? distanceKm : 0);
  return {
    delayS: kilometres / SOUND_KM_S,
    crack: kilometres < 2.5,
    gain: 1 / (1 + kilometres / 1.5),
  };
}

/** Seconds to the next spot sound at its bed's full level: random as rain on a roof, exponential gaps averaging
 *  `meanGapS`. The caller counts them down slower as the bed quietens. */
export const nextGapS = (meanGapS: number, roll: number): number =>
  Math.max(0.05, -Math.log(1 - Math.min(roll, 0.999999)) * meanGapS);
