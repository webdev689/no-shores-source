// The view brought in close over the player's Sloop: past the Overworld's lowest zoom the wheel keeps coming in, and
// she eases from her Overworld size to her own while the eye comes down to her, so at the closest she is seen whole at
// her true scale, as the World Editor shows her afloat.
import { smooth01 } from '../overworld/overworldCamera.ts';
import type { Lying } from '../ships/deck.ts';
import { panShot, type Shot, shotOfOrbit } from './camera.ts';

/** A wheel notch brings the view this share of the way in, and the share eases toward the wheel's at `rate` a second.
 *  At the closest the eye stands `distanceM` from the point `lookAtM` over her waterline the World Editor looks at, its near
 *  plane `nearM` off, metres. */
export const CLOSE = { perNotch: 0.2, rate: 6, distanceM: 25, lookAtM: 4.5, nearM: 0.3 } as const;

/** How far the view has come in past the Overworld's lowest zoom: 0 not at all, 1 at her true size. */
export class CloseZoom {
  private target = 0;
  private share = 0;

  /** The wheel's notches, positive in, `atLowest` when the Overworld's own zoom is as low as it goes: in past it
   *  brings the view closer, and out takes it back from close first. Answers the notches left for the Overworld's own
   *  zoom. */
  zoom(notches: number, atLowest: boolean): number {
    const coming = notches > 0 ? atLowest : this.target > 0;
    if (!coming || !notches) return notches;
    this.target = Math.min(1, Math.max(0, this.target + notches * CLOSE.perNotch));
    return 0;
  }

  /** Lets the view ease back out to the Overworld's. */
  release(): void {
    this.target = 0;
  }

  /** Eases the view `seconds` on toward the wheel's share. */
  step(seconds: number): void {
    const toward = 1 - Math.exp(-Math.max(0, seconds) * CLOSE.rate);
    this.share += (this.target - this.share) * toward;
    if (Math.abs(this.target - this.share) < 1e-4) this.share = this.target;
  }

  /** How far in the view has come, eased: 0 the Overworld's, 1 at her true size. */
  get eased(): number {
    return smooth01(this.share);
  }

  /** The shot from the sea's `sea`, brought in as far as the wheel asks over the Sloop as she `lying` lies, looking
   *  along `yaw` and `tilt` radians down, the Overworld camera's own. */
  shot(sea: Shot, lying: Lying, yaw: number, tilt: number): Shot {
    const eased = this.eased;
    if (eased <= 0) return sea;
    const orbit = {
      targetX: lying.x,
      targetY: lying.y,
      targetZ: lying.heave + CLOSE.lookAtM * lying.scale,
      yaw,
      pitch: tilt,
      distance: CLOSE.distanceM * lying.scale,
    };
    const close = shotOfOrbit(orbit, { fov: sea.fov, near: CLOSE.nearM, far: sea.far }, () => null, 0);
    return panShot(sea, close, eased);
  }
}
