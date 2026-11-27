// The Sealevel view over the player's ship: switched to from the Oversea view, the eye comes down along the camera's
// look to stand off the ship at its true scale, as the World Editor shows it afloat, and goes back up when switched
// back. It is drawn as large as `shownScale` holds it on the way, so at sea level it is seen whole at its size.
import { smooth01 } from '../overworld/overworldCamera.ts';
import type { Lying } from '../ships/deck.ts';
import { panShot, type Shot, shotOfOrbit } from './camera.ts';

/** The share eases toward the view switched to at `rate` a second. At sea level the eye stands `distanceM` from the
 *  point `lookAtM` over its waterline the World Editor looks at, its near plane `nearM` off, metres. */
export const CLOSE = { rate: 6, distanceM: 25, lookAtM: 4.5, nearM: 0.3 } as const;

/** How far the view has come down from the Oversea view to sea level: 0 not at all, 1 at its true size. */
export class CloseZoom {
  private target = 0;
  private share = 0;

  /** Switches to the Sealevel view (`down`) or back up to the Oversea view; the view eases there. */
  set(down: boolean): void {
    this.target = down ? 1 : 0;
  }

  /** Whether the Sealevel view is the one switched to, eased there or not. */
  get down(): boolean {
    return this.target === 1;
  }

  /** Eases the view `seconds` on toward the view switched to. */
  step(seconds: number): void {
    const toward = 1 - Math.exp(-Math.max(0, seconds) * CLOSE.rate);
    this.share += (this.target - this.share) * toward;
    if (Math.abs(this.target - this.share) < 1e-4) this.share = this.target;
  }

  /** How far down the view has come, eased: 0 the Oversea view, 1 at sea level, its true size. */
  get eased(): number {
    return smooth01(this.share);
  }

  /** The shot from the sea's `sea`, brought down as far as the switch has eased it over the ship as it `lying` lies,
   *  looking along `yaw` and `tilt` radians down, the Oversea camera's own. */
  shot(sea: Shot, lying: Lying, yaw: number, tilt: number): Shot {
    const eased = this.eased;
    return eased <= 0 ? sea : panShot(sea, this.closest(sea, lying, yaw, tilt), eased);
  }

  /** The shot at sea level, through the lens of the sea's `sea`. */
  closest(sea: Shot, lying: Lying, yaw: number, tilt: number): Shot {
    const orbit = {
      targetX: lying.x,
      targetY: lying.y,
      targetZ: lying.heave + CLOSE.lookAtM * lying.scale,
      yaw,
      pitch: tilt,
      distance: CLOSE.distanceM * lying.scale,
    };
    return shotOfOrbit(orbit, { fov: sea.fov, near: CLOSE.nearM, far: sea.far }, () => null, 0);
  }
}
