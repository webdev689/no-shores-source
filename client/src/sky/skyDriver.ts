import type { SkyLaw, SkyReading, Strike } from './skyLaw.ts';
import { lookOf } from './skyLook.ts';
import { AFTERNOON, type Lamp, type SkyLook, type SkyUniform } from './skyUniform.ts';
import { WORLD_CLOCK } from './worldClock.ts';

/** How far round the eye lightning is followed, metres, and how long a strike is kept, seconds: thunder from the
 *  edge of hearing (25 km) comes about 73 s after its flash. */
export const STRIKE_REACH_M = 40_000;
export const STRIKE_KEPT_S = 80;

/** The sky as the page last drew it, for whatever else reads it: the sound, the rain, the bolts. */
export interface SkyNow {
  readonly reading: SkyReading | null;
  readonly look: SkyLook;
  readonly climate: string;
  readonly eye: readonly [number, number, number];
  readonly worldS: number;
  /** Every strike within reach in the last STRIKE_KEPT_S seconds, earliest first. */
  readonly strikes: readonly Strike[];
}

/** The page's one view of the sky. */
export const SKY_NOW: { current: SkyNow } = {
  current: { reading: null, look: AFTERNOON, climate: 'sea', eye: [0, 0, 0], worldS: 0, strikes: [] },
};

/** A strike's light at an eye `distanceM` away, `ageS` after it: a bright stroke and two return strokes, gone in a
 *  third of a second, the nearest brightest; a strike in the cloud lights less than one to the ground. */
export function flashOf(strike: Strike, ageS: number, distanceM: number): number {
  if (ageS < 0 || ageS > 0.6) return 0;
  const strokes =
    Math.exp(-ageS * 14) + 0.6 * Math.exp(-Math.abs(ageS - 0.09) * 40) + 0.4 * Math.exp(-Math.abs(ageS - 0.2) * 40);
  const near = Math.max(0, 1 - distanceM / STRIKE_REACH_M);
  return strike.power * (strike.toGround ? 1 : 0.6) * near * near * Math.min(1, strokes);
}

/**
 * Reads the sky's law at the eye each frame, at the world clock's time and in the climate's air, follows the lightning
 * round it, and writes what the shaders read. Until the law has come, the sky stays the clear afternoon.
 */
export class SkyDriver {
  private law: SkyLaw | null = null;
  private readonly uniform: SkyUniform;
  private asked = Number.NEGATIVE_INFINITY;
  private strikes: Strike[] = [];
  /** How far the wind has carried the clouds' shadows here, metres east and south, summed frame by frame. */
  private clouds: [number, number] = [0, 0];

  constructor(law: Promise<SkyLaw>, uniform: SkyUniform) {
    this.uniform = uniform;
    law
      .then((started) => (this.law = started))
      .catch((error: unknown) => console.error('the sky could not start:', error));
  }

  /** The sky over the eye (world metres, height above the sea) in a climate's air, with the lamps lit round it. */
  frame(eye: readonly [number, number, number], climate: string, lamps: readonly Lamp[] = []): SkyNow {
    const law = this.law;
    if (!law) return SKY_NOW.current;
    const worldS = WORLD_CLOCK.seconds();
    const reading = law.at(eye[0], eye[1], Math.max(0, eye[2]), worldS, climate);
    // A window of world time is asked once: a long frame asks a little more, a jump in the clock starts afresh.
    const from = worldS - this.asked > 2 || worldS < this.asked ? worldS - 0.05 : this.asked;
    if (worldS > from) this.strikes.push(...law.strikes(eye[0], eye[1], STRIKE_REACH_M, from, worldS, climate));
    const step = Math.min(1, Math.max(0, worldS - this.asked));
    this.clouds = [this.clouds[0] + reading.wind[0] * step, this.clouds[1] + reading.wind[1] * step];
    this.asked = worldS;
    this.strikes = this.strikes.filter((strike) => worldS - strike.atS <= STRIKE_KEPT_S);
    const flash = Math.min(
      1,
      this.strikes.reduce(
        (sum, strike) => sum + flashOf(strike, worldS - strike.atS, Math.hypot(strike.x - eye[0], strike.y - eye[1])),
        0,
      ),
    );
    const look = lookOf(reading, worldS, flash);
    this.uniform.write(look, lamps, { eye: [eye[0], eye[1]], clouds: this.clouds });
    SKY_NOW.current = { reading, look, climate, eye, worldS, strikes: this.strikes };
    return SKY_NOW.current;
  }
}
