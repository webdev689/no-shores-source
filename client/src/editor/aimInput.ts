/** The wheel steps the load once in this long at most (seconds), as DFO's does. */
export const LOAD_STEP_S = 0.18;
/** Aiming, the look may rise this far over the horizon (radians), where the guns throw farthest. */
export const AIM_HIGHEST_LOOK = -0.35;

/** The guns' mouse while sailing, as DFO's: the right button held aims, its release fires, a left click while aiming
 *  puts the lay down unfired, and the wheel while aiming steps the load. */
export class AimInput {
  aiming = false;
  private fires = 0;
  private loadSteps = 0;
  private lastStep = Number.NEGATIVE_INFINITY;

  /** A button pressed: answers whether the aim took it. */
  down(button: number): boolean {
    if (button === 2) {
      this.aiming = true;
      return true;
    }
    if (button === 0 && this.aiming) {
      this.aiming = false;
      return true;
    }
    return false;
  }

  /** A button let go: the right one, while aiming, fires. */
  up(button: number): void {
    if (button === 2 && this.aiming) this.fires++;
    if (button === 2) this.aiming = false;
  }

  /** The wheel at `now` (seconds): answers whether the aim took it. */
  wheel(deltaY: number, now: number): boolean {
    if (!this.aiming) return false;
    if (deltaY !== 0 && now - this.lastStep >= LOAD_STEP_S) {
      this.loadSteps += Math.sign(deltaY);
      this.lastStep = now;
    }
    return true;
  }

  /** What the frame takes: whether it aims, and the releases and load steps since the last frame. */
  take(): { readonly aiming: boolean; readonly fires: number; readonly loadSteps: number } {
    const taken = { aiming: this.aiming, fires: this.fires, loadSteps: this.loadSteps };
    [this.fires, this.loadSteps] = [0, 0];
    return taken;
  }

  /** Sailing ended: nothing aimed or owed. */
  reset(): void {
    [this.aiming, this.fires, this.loadSteps] = [false, 0, 0];
  }
}
