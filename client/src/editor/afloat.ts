import type { LandView, Pose, ShipFloats } from '../rules/landRules.ts';
import { RUNG_WORDS } from '../ships/helmKeys.ts';
import type { Waterline } from '../ships/shipMesh.ts';
import type { ShipPlace } from '../ships/shipView.ts';
import { type Stir, WAKE_WAY, wakeStirs } from '../ships/swellPose.ts';
import type { HullMask } from '../water/hullMask.ts';
import type { Orbit } from './orbit.ts';

/** Her deck and a little over, metres above her waterline: where the camera looks at her. */
const LOOK_AT_M = 4.5;
/** The helm's rung with her sails set (crates/sailing/src/ship.rs). */
export const SAILS_RUNG = 2;
/** How far she runs between stirrings of the water at her bow and quarters, metres. */
const WAKE_STEP_M = 0.5;

/** The Sloop as the World Editor shows her, whoever steps her: her numbers and pose as last given, and the run that
 *  owes the water her wake. */
export class Afloat {
  protected ship: ShipFloats;
  protected pose: Pose;
  private travelled = 0;
  private stirrings = 0;

  constructor(ship: ShipFloats, pose: Pose) {
    this.ship = ship;
    this.pose = pose;
  }

  /** Takes her next numbers and pose, her run since the last stirring her wake. */
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

  /** Her numbers, as last given. */
  floats(): ShipFloats {
    return this.ship;
  }

  /** Her bow and quarters stir the water, once a frame at most, when she has run half a metre since: deeper the faster
   *  she runs. */
  wake(view: LandView, waterline: Waterline): readonly Stir[] {
    const owed = this.stirrings > 0;
    this.stirrings = 0;
    if (!owed) return [];
    return wakeStirs(this.place(view, 1), waterline.lengthM / 2, waterline.beamM / 2, this.way());
  }

  /** Her footprint on the water, for the water's surface. */
  hull(view: LandView, waterline: Waterline): HullMask {
    const { x, y, heading } = this.place(view, 1);
    return { x, y, heading, halfLength: waterline.lengthM / 2, halfBeam: waterline.beamM / 2, way: this.way() };
  }

  /** Her way, m/s. */
  way(): number {
    return Math.hypot(this.ship[3] ?? 0, this.ship[4] ?? 0);
  }

  /** The camera's orbit turned on her: its target at her middle in the window, a little over her deck. */
  orbit(around: Orbit, view: LandView): Orbit {
    return { ...around, targetX: (this.ship[0] ?? 0) - view.leftM, targetY: (this.ship[1] ?? 0) - view.topM };
  }

  /** Where the camera looks at her, metres above still water. */
  lookAtM(): number {
    return this.pose.heave + LOOK_AT_M;
  }

  /** Where she is drawn in the window, her height scaled as the land is drawn. */
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

  /** What the panel says of her: her rung, her way, and the ground if she has taken it. */
  describe(): string {
    const rung = RUNG_WORDS[this.ship[7] ?? 0] ?? '';
    return `${rung} ${this.way().toFixed(1)} m/s${this.pose.aground ? ', aground' : ''}`;
  }

  /** Whether her sails are set: the helm's top rung. */
  get sailsSet(): boolean {
    return this.ship[7] === SAILS_RUNG;
  }
}
