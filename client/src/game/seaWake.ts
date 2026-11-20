// Its wake on the sea's view: its bow and quarters stir the water under way, as it is drawn, at a ship's own way.
import { SHIP_SPEED } from '../overworld/voyage.ts';
import type { Lying } from '../ships/deck.ts';
import type { Waterline } from '../ships/shipMesh.ts';
import { type Stir, wakeStirs } from '../ships/swellPose.ts';

/** Its wake stirs the ripples only where it is drawn near its own size, the ripples round it a 32 m field, and at
 *  most as often as they step, seconds. */
export const WAKE = { mostScale: 1.5, everyS: 1 / 60 } as const;

/** Its wake, and the seconds since it last stirred the water. */
export class Wake {
  private sinceStir = 0;

  /** The stirs of its waterline lying as `lying`, `seconds` on: near its own size, as often as the ripples step. */
  stirs(lying: Lying, waterline: Waterline, seconds: number): Stir[] {
    this.sinceStir += seconds;
    if (lying.scale > WAKE.mostScale || this.sinceStir < WAKE.everyS) return [];
    this.sinceStir = 0;
    const { lengthM, beamM } = waterline;
    return wakeStirs(lying, (lengthM / 2) * lying.scale, (beamM / 2) * lying.scale, SHIP_SPEED).map((stir) => ({
      ...stir,
      radiusM: stir.radiusM * lying.scale,
    }));
  }
}
