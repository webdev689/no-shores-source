import type { LandView } from '../rules/landRules.ts';
import type { FleetHarbour } from './fleetLink.ts';
import { FleetSloop } from './fleetPlay.ts';
import { heightAt } from './reliefView.ts';

/** A fleet room's sea is open water: the Sloop joins it from water this deep, where the swell rolls whole, so the sea
 *  drawn round it is the room's (metres; the land crate's FULL_DEPTH_M). */
export const OPEN_WATER_M = 15;

/**
 * The World Editor's mooring in a fleet room, when its page offered one (`?room=`): it puts the Sloop to sea there
 * from open water, and keeps it while it sails.
 */
export class FleetDock {
  private readonly harbour: FleetHarbour;
  private held: FleetSloop | null = null;
  private asked = false;

  constructor(harbour: FleetHarbour) {
    this.harbour = harbour;
  }

  /** The Sloop, while it is in the fleet. */
  get sloop(): FleetSloop | null {
    return this.held;
  }

  /** Whether it has asked to join and the room has not answered yet. */
  get joining(): boolean {
    return this.asked;
  }

  /** Joins the fleet with the Sloop put to sea at world (x, y), heading `yaw`, in open water: `joined` once the room
   *  has welcomed it, or `fail` with why not. */
  join(
    view: LandView,
    [x, y, yaw]: readonly [number, number, number],
    joined: () => void,
    fail: (error: unknown) => void,
  ): void {
    if (this.held || this.asked) return;
    if (-(heightAt(view, x, y) ?? 0) < OPEN_WATER_M) {
      fail(new Error(`In a fleet the Sloop puts to sea in open water, ${OPEN_WATER_M} m deep or more.`));
      return;
    }
    const turn = 2 * Math.PI;
    const heading = ((yaw % turn) + turn) % turn;
    this.asked = true;
    this.harbour.join(
      [x, y, heading],
      (session) => {
        this.asked = false;
        this.held = new FleetSloop(session);
        joined();
      },
      (error) => {
        this.asked = false;
        fail(error);
      },
    );
  }

  /** Brings it in, or lets go of its join: it leaves the fleet. */
  leave(): void {
    this.harbour.leave();
    [this.held, this.asked] = [null, false];
  }
}
