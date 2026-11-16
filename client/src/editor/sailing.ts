import type { Helm, LandView, Pose, ShipFloats } from '../rules/landRules.ts';
import { helmOf, isRungKey, RUNG_WORDS } from '../ships/helmKeys.ts';
import type { ShipPlace } from '../ships/shipView.ts';
import type { Sailed } from './landClient.ts';
import type { Orbit } from './orbit.ts';

/** The rules' tick, seconds (crates/sailing TICK_SECONDS). */
export const TICK_SECONDS = 1 / 60;
/** The most ticks a frame steps: the scene's own longest frame, so a hidden tab does not sail on for minutes. */
export const MOST_TICKS_A_FRAME = 6;
/** Her deck and a little over, metres above her waterline: where the camera looks at her. */
const LOOK_AT_M = 1.5;

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
    const sailed = await source.sail(id, new Float64Array([x, y, heading, 0, 0, 0, 0, 0]), STILL, time, 0);
    if (!sailed) return 'Open this landmass to sail on it.';
    if (sailed.pose.aground) return 'The Sloop needs water deeper than her draught: put her to sea off the coast.';
    return new Sailing(source, id, sailed);
  }

  /** A key pressed (not held down): a rung key waits for the next step. */
  press(key: string): void {
    if (isRungKey(key)) this.presses.push(key);
  }

  /** Owes her `seconds` more and, unless a step is with the rules, sends the whole ticks owed (six at most), the last
   *  ending at `time`, with the helm the keys held and the next press ask. */
  advance(seconds: number, held: ReadonlySet<string>, time: number, fail: (error: unknown) => void): void {
    this.owed = Math.min(this.owed + seconds, MOST_TICKS_A_FRAME * TICK_SECONDS);
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
        this.ship = sailed.ship;
        this.pose = sailed.pose;
      })
      .catch((error: unknown) => {
        this.pending = false;
        fail(error);
      });
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
