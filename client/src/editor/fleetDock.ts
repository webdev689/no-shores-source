import type { LandView } from '../rules/landRules.ts';
import type { FleetHarbour } from './fleetLink.ts';
import { FleetSloop } from './fleetPlay.ts';
import { heightAt } from './reliefView.ts';

/** A fleet room's sea is open water: the Sloop joins it from water this deep, where the swell rolls whole, so the sea
 *  drawn round her is the room's (metres; the land crate's FULL_DEPTH_M). */
export const OPEN_WATER_M = 15;

/**
 * The World Editor's mooring in a fleet room, when its page offered one (`?room=`): it puts the Sloop to sea there
 * from open water, and keeps her while she sails.
 */
export class FleetDock {
  private readonly harbour: FleetHarbour;
  private held: FleetSloop | null = null;

  constructor(harbour: FleetHarbour) {
    this.harbour = harbour;
  }

  /** Her, while she is in the fleet. */
  get sloop(): FleetSloop | null {
    return this.held;
  }

  /** Joins the fleet with the Sloop put to sea at world (x, y), heading `yaw`, in open water: `joined` once the room
   *  has welcomed her, or `fail` with why not. */
  join(
    view: LandView,
    [x, y, yaw]: readonly [number, number, number],
    joined: () => void,
    fail: (error: unknown) => void,
  ): void {
    if (this.held) return;
    if (-(heightAt(view, x, y) ?? 0) < OPEN_WATER_M) {
      fail(new Error(`In a fleet the Sloop puts to sea in open water, ${OPEN_WATER_M} m deep or more.`));
      return;
    }
    const turn = 2 * Math.PI;
    const heading = ((yaw % turn) + turn) % turn;
    this.harbour.join(
      [x, y, heading],
      (session) => {
        this.held = new FleetSloop(session);
        joined();
      },
      fail,
    );
  }

  /** Brings her in: she leaves the fleet. */
  leave(): void {
    this.harbour.leave();
    this.held = null;
  }
}
