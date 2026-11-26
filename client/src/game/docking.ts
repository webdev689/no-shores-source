// A landing seen made: the view goes to the Oversea view and the ship sails in at ×60 from its berth's offing to the
// berth, at a port's pier, off a coast or at a sea island's anchorage, and only once it lies at rest there is the
// landing made. The ship lies docked there from then on, until its player comes back aboard: once the room has placed
// it, it is seen pulling away, sailing out at ×60 to the offing, and is theirs to sail from there.
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

/** How near where the page has the ship the room's word on it lies once the room has placed it, metres: the room keeps
 *  a ship to its whole metres. */
const PLACED_M = 2;

const apart = (one: Point2, other: Point2) => Math.hypot(one[0] - other[0], one[1] - other[1]);

/** The landing being berthed for, until the ship lies at its berth; and where it lies docked once it does. */
export class Docking {
  private pending: Berthed | null = null;
  /** Where the ship lies docked, once it came to rest at its berth, until it sails out again. */
  docked: Berthed | null = null;
  /** Whether the player has come back aboard, the ship to sail out once the room has placed it. */
  private aboard = false;

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

  /** The player is back aboard: the ship docked sails out once the room has placed it. */
  cameAboard(): void {
    this.aboard = this.docked !== null;
  }

  /** Back aboard, once the room has placed the ship (its settled word lies where the page has it): lying at its berth,
   *  it sails out at ×60 to the berth's offing, straight, as it came in. Set on a course of the player's first, or lying
   *  elsewhere, it takes none. Either way it is docked no more. */
  undock(sea: Pick<Sea, 'position' | 'course' | 'sighted' | 'passage'>): void {
    const docked = this.docked;
    if (!this.aboard || !docked) return;
    const placed = sea.sighted?.settledShip ?? null;
    const setOff = sea.course.length > 0;
    if (!setOff && (!placed || apart([placed.x, placed.y], sea.position) >= PLACED_M)) return;
    [this.aboard, this.docked] = [false, null];
    const { at, offing } = docked.berth;
    const atBerth = apart(sea.position, at) <= ANCHORED_M && apart(sea.position, offing) > ANCHORED_M;
    if (!setOff && atBerth) sea.passage.sailAlong([offing]);
  }
}
