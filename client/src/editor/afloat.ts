import type { LandView, Pose, ShipFloats } from '../rules/landRules.ts';
import { RUNG_WORDS } from '../ships/helmKeys.ts';
import type { Waterline } from '../ships/shipMesh.ts';
import type { ShipPlace } from '../ships/shipView.ts';
import { type Stir, WAKE_WAY, wakeStirs } from '../ships/swellPose.ts';
import type { HullMask } from '../water/hullMask.ts';
import type { Orbit } from './orbit.ts';

/** Its deck and a little over, metres above its waterline: where the camera looks at it. */
const LOOK_AT_M = 4.5;
/** The helm's rung with its sails set (crates/sailing/src/ship.rs). */
export const SAILS_RUNG = 2;
/** How far it runs between stirrings of the water at its bow and quarters, metres. */
const WAKE_STEP_M = 0.5;

/** The Sloop as the World Editor shows it, whoever steps it: its numbers and pose as last given, and the run that
 *  owes the water its wake. */
export class Afloat {
  protected ship: ShipFloats;
  protected pose: Pose;
  private travelled = 0;
  private stirrings = 0;

  constructor(ship: ShipFloats, pose: Pose) {
    this.ship = ship;
    this.pose = pose;
  }

  /** Takes its next numbers and pose, its run since the last stirring its wake. */
  protected moveTo(next: ShipFloats, pose: Pose): void {
    if (Math.hypot(next[3] ?? 0, next[4] ?? 0) >= WAKE_WAY) {
      this.travelled += Math.hypot((next[0] ?? 0) - (this.ship[0] ?? 0), (next[1] ?? 0) - (this.ship[1] ?? 0));
      const whole = Math.floor(this.travelled / WAKE_STEP_M);
      this.stirrings += whole;
      this.travelled -= whole * WAKE_STEP_M;
    }
    this.ship = next;
    this.pose = pose;
  }

  /** Its numbers, as last given. */
  floats(): ShipFloats {
    return this.ship;
  }

  /** Its bow and quarters stir the water, once a frame at most, when it has run half a metre since: deeper the faster
   *  it runs. */
  wake(view: LandView, waterline: Waterline): readonly Stir[] {
    const owed = this.stirrings > 0;
    this.stirrings = 0;
    if (!owed) return [];
    return wakeStirs(this.place(view, 1), waterline.lengthM / 2, waterline.beamM / 2, this.way());
  }

  /** Its footprint on the water in its hull's `line`, for the water's surface. */
  hull(view: LandView, waterline: Waterline, line: Float32Array): HullMask {
    const { x, y, heading } = this.place(view, 1);
    const [halfLength, halfBeam] = [waterline.lengthM / 2, waterline.beamM / 2];
    return { id: 'own', x, y, heading, halfLength, halfBeam, way: this.way(), line };
  }

  /** Its way, m/s. */
  way(): number {
    return Math.hypot(this.ship[3] ?? 0, this.ship[4] ?? 0);
  }

  /** The camera's orbit turned on it: its target at its middle in the window, a little over its deck. */
  orbit(around: Orbit, view: LandView): Orbit {
    return { ...around, targetX: (this.ship[0] ?? 0) - view.leftM, targetY: (this.ship[1] ?? 0) - view.topM };
  }

  /** Where the camera looks at it, metres above still water. */
  lookAtM(): number {
    return this.pose.heave + LOOK_AT_M;
  }

  /** Where it is drawn in the window, its height scaled as the land is drawn. */
  place(view: Pick<LandView, 'leftM' | 'topM'>, exaggeration: number): ShipPlace {
    return {
      x: (this.ship[0] ?? 0) - view.leftM,
      y: (this.ship[1] ?? 0) - view.topM,
      z: this.pose.heave * exaggeration,
      heading: this.ship[2] ?? 0,
      pitch: this.pose.pitch,
      roll: this.pose.roll,
    };
  }

  /** What the panel says of it: its rung, its way, and the ground if it has taken it. */
  describe(): string {
    const rung = RUNG_WORDS[this.ship[7] ?? 0] ?? '';
    return `${rung} ${this.way().toFixed(1)} m/s${this.pose.aground ? ', aground' : ''}`;
  }

  /** Whether its sails are set: the helm's top rung. */
  get sailsSet(): boolean {
    return this.ship[7] === SAILS_RUNG;
  }
}
