// A landing seen made: the view goes to the Oversea view and the ship sails in at ×60 from its berth's offing to the
// berth, at a port's pier, off a coast or at a sea island's anchorage, and only once it lies at rest there is the
// landing made. The ship lies docked there from then on.
import type { Point2 } from '../overworld/ground.ts';
import type { Berth } from './berths.ts';
import { ANCHORED_M } from './isleLaw.ts';
import type { LandingAim } from './landingAsk.ts';
import type { Sea } from './sea.ts';

/** A landing and the berth the ship lies at for it. */
export interface Berthed {
  readonly aim: LandingAim;
  readonly berth: Berth;
}

const apart = (one: Point2, other: Point2) => Math.hypot(one[0] - other[0], one[1] - other[1]);

/** The landing being berthed for, until the ship lies at its berth; and where it lies docked once it does. */
export class Docking {
  private pending: Berthed | null = null;
  /** Where the ship lies docked, once it came to rest at its berth. */
  docked: Berthed | null = null;

  /** Sets the ship sailing in to `berth` for `aim`, seen from the Oversea view, at a click's pace (×60): planned on water
   *  to its offing, then straight in, unless it lies there already. Whether it is made for: with no way there the
   *  voyage's line says why, and nothing is. */
  begin(sea: Pick<Sea, 'position' | 'course' | 'sailIn' | 'switchLevel'>, aim: LandingAim, berth: Berth): boolean {
    sea.switchLevel('oversea');
    const under = apart(sea.position, berth.at) > ANCHORED_M || sea.course.length > 0;
    if (under && !sea.sailIn(berth.offing, berth.at)) return false;
    this.pending = { aim, berth };
    return true;
  }

  /** The landing being berthed for, if any. */
  get making(): LandingAim | null {
    return this.pending?.aim ?? null;
  }

  /** The landing berthed for once the ship lies at rest at its berth, taken once, and the ship docked there; given up if
   *  the ship was turned elsewhere (steered, sent off on another voyage or a chase). */
  arrived(sea: Pick<Sea, 'position' | 'course' | 'bound'>): LandingAim | null {
    const pending = this.pending;
    if (!pending) return null;
    const near = (point: Point2) => apart(point, pending.berth.at) <= ANCHORED_M;
    if (sea.course.length === 0 && near(sea.position)) {
      [this.pending, this.docked] = [null, pending];
      return pending.aim;
    }
    // Under way to it, or stopped short of it to be resumed, the landing stands.
    const bound = sea.bound;
    if (!bound || !near(bound)) this.pending = null;
    return null;
  }

  /** The landing given up: another made for, a fight, or the player gone from the sea. */
  cancel(): void {
    this.pending = null;
  }
}
