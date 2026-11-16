import { type Helm, headingFrame, type LandView, type Pose, type ShipFloats } from '../rules/landRules.ts';
import { helmOf, isRungKey, RUNG_WORDS } from '../ships/helmKeys.ts';
import type { Waterline } from '../ships/shipMesh.ts';
import type { ShipPlace } from '../ships/shipView.ts';
import type { HullMask } from '../water/hullMask.ts';
import type { Sailed } from './landClient.ts';
import type { Orbit } from './orbit.ts';

/** The rules' tick, seconds (crates/sailing TICK_SECONDS). */
export const TICK_SECONDS = 1 / 60;
/** The most ticks one step asks, the rules' own cap: a second's. Time spent waiting on the rules (behind a close-up
 *  being made) is caught up in the next step, up to this; the scene caps a frame at a tenth of a second. */
export const MOST_TICKS = 60;
/** Her deck and a little over, metres above her waterline: where the camera looks at her. */
const LOOK_AT_M = 1.5;
/** Come Sail Away's wake threshold (a quarter of its sailing speed), m/s, and how far she runs between stirrings of
 *  the water at her bow and quarters, metres. */
const WAKE_WAY = 0.5;
const WAKE_STEP_M = 0.5;

/** A push on the water's ripples: where (window metres), how wide and how deep. */
export interface Stir {
  readonly x: number;
  readonly y: number;
  readonly radiusM: number;
  readonly strength: number;
}

/** Where a ship is sailed: the land's rules, over the open landmass; null when another landmass is open. */
export interface SailSource {
  sail(id: string, ship: ShipFloats, helm: Helm, time: number, ticks: number): Promise<Sailed | null>;
}

const STILL: Helm = { steer: 0, crab: false, climb: 0 };

/** The Sloop under the owner's hand in the World Editor: her numbers as the rules last answered them, the ticks the
 *  page owes her, and the rung presses waiting for a step. One step is with the rules at a time. */
export class Sailing {
  private readonly source: SailSource;
  private readonly id: string;
  private ship: ShipFloats;
  private pose: Pose;
  private owed = 0;
  private pending = false;
  private readonly presses: string[] = [];
  private travelled = 0;
  private stirrings = 0;

  private constructor(source: SailSource, id: string, sailed: Sailed) {
    this.source = source;
    this.id = id;
    this.ship = sailed.ship;
    this.pose = sailed.pose;
  }

  /** Puts her to sea at world (x, y), heading as the camera looks, or says why she cannot be. The rules decide. */
  static async putToSea(
    source: SailSource,
    id: string,
    x: number,
    y: number,
    heading: number,
    time: number,
  ): Promise<Sailing | string> {
    const turn = 2 * Math.PI;
    const within = ((heading % turn) + turn) % turn;
    const sailed = await source.sail(id, new Float64Array([x, y, within, 0, 0, 0, 0, 0]), STILL, time, 0);
    if (!sailed) return 'Open this landmass to sail on it.';
    if (sailed.pose.aground) return 'The Sloop needs water deeper than her draught: put her to sea off the coast.';
    return new Sailing(source, id, sailed);
  }

  /** A key pressed (not held down): a rung key waits for the next step. */
  press(key: string): void {
    if (isRungKey(key)) this.presses.push(key);
  }

  /** Owes her `seconds` more and, unless a step is with the rules, sends the whole ticks owed (a second's at most), the last
   *  ending at `time`, with the helm the keys held and the next press ask. */
  advance(seconds: number, held: ReadonlySet<string>, time: number, fail: (error: unknown) => void): void {
    this.owed = Math.min(this.owed + seconds, MOST_TICKS * TICK_SECONDS);
    if (this.pending) return;
    // A hair over, so six ticks' worth of float seconds is six ticks.
    const ticks = Math.floor(this.owed / TICK_SECONDS + 1e-6);
    if (ticks === 0) return;
    this.owed = Math.max(0, this.owed - ticks * TICK_SECONDS);
    this.pending = true;
    const helm = helmOf(held, this.presses.shift());
    this.source
      .sail(this.id, this.ship, helm, time - ticks * TICK_SECONDS, ticks)
      .then((sailed) => {
        this.pending = false;
        if (!sailed) return;
        this.keepWake(sailed.ship);
        this.ship = sailed.ship;
        this.pose = sailed.pose;
      })
      .catch((error: unknown) => {
        this.pending = false;
        fail(error);
      });
  }

  /** Her numbers, for a fight to begin from. */
  floats(): ShipFloats {
    return this.ship;
  }

  /** Takes her numbers and pose as a fight's answer left them, her run since then stirring her wake. */
  adopt(sailed: Sailed): void {
    this.keepWake(sailed.ship);
    this.ship = sailed.ship;
    this.pose = sailed.pose;
  }

  /** The next rung press, for a fight's helm. */
  takePress(): string | undefined {
    return this.presses.shift();
  }

  /** Counts the stirrings her run since the last answer owes the water, once she makes a wake. */
  private keepWake(next: ShipFloats): void {
    if (Math.hypot(next[3] ?? 0, next[4] ?? 0) < WAKE_WAY) return;
    this.travelled += Math.hypot((next[0] ?? 0) - (this.ship[0] ?? 0), (next[1] ?? 0) - (this.ship[1] ?? 0));
    const whole = Math.floor(this.travelled / WAKE_STEP_M);
    this.stirrings += whole;
    this.travelled -= whole * WAKE_STEP_M;
  }

  /** Her bow and quarters stir the water, once a frame at most, when she has run half a metre since: deeper the faster
   *  she runs. */
  wake(view: LandView, waterline: Waterline): readonly Stir[] {
    const owed = this.stirrings > 0;
    this.stirrings = 0;
    if (!owed) return [];
    const { x, y, heading } = this.place(view, 1);
    const { forward, starboard } = headingFrame(heading);
    const [halfLength, halfBeam] = [waterline.lengthM / 2, waterline.beamM / 2];
    const strength = -0.02 * Math.min(this.way() / 2, 1.5);
    const stirAt = (along: number, across: number, radiusM: number, share: number): Stir => ({
      x: x + forward[0] * along + starboard[0] * across,
      y: y + forward[1] * along + starboard[1] * across,
      radiusM,
      strength: strength * share,
    });
    const once = [
      stirAt(halfLength, 0, 0.6, 1),
      stirAt(-0.7 * halfLength, -halfBeam, 0.4, 0.5),
      stirAt(-0.7 * halfLength, halfBeam, 0.4, 0.5),
    ];
    return once;
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
  place(view: LandView, exaggeration: number): ShipPlace {
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
}
