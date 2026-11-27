import type { Helm, ShipFloats } from '../rules/landRules.ts';
import { helmOf, isRungKey } from '../ships/helmKeys.ts';
import { SLOOP_HULL } from '../ships/hulls.ts';
import type { Sailed } from '../terrain/landClient.ts';
import { Afloat } from './afloat.ts';

/** The rules' tick, seconds (crates/sailing TICK_SECONDS). */
export const TICK_SECONDS = 1 / 60;
/** The most ticks one step asks, the rules' own cap: a second's. Time spent waiting on the rules (behind a close-up
 *  being made) is caught up in the next step, up to this; the scene caps a frame at a tenth of a second. */
export const MOST_TICKS = 60;
/** Where a ship is sailed: the land's rules, over the open landmass, as its `hull` (the Sloop unless given); null when
 *  another landmass is open. */
export interface SailSource {
  sail(id: string, ship: ShipFloats, helm: Helm, time: number, ticks: number, hull?: number): Promise<Sailed | null>;
}

const STILL: Helm = { steer: 0, climb: 0 };
export { SAILS_RUNG } from './afloat.ts';

/** The ship under the owner's hand in the World Editor: its hull, its numbers as the rules last answered them, the
 *  ticks the page owes it, and the rung presses waiting for a step. One step is with the rules at a time. */
export class Sailing extends Afloat {
  readonly hullKind: number;
  private readonly source: SailSource;
  private readonly id: string;
  private owed = 0;
  private pending = false;
  /** The step with the rules, answered or not. */
  private inFlight: Promise<void> = Promise.resolve();
  private readonly presses: string[] = [];

  private constructor(source: SailSource, id: string, sailed: Sailed, hull: number) {
    super(sailed.ship, sailed.pose);
    this.source = source;
    this.id = id;
    this.hullKind = hull;
  }

  /** Puts a ship of `hull` to sea at world (x, y), heading as the camera looks, or says why it cannot be. The rules
   *  decide. */
  static async putToSea(
    source: SailSource,
    id: string,
    x: number,
    y: number,
    heading: number,
    time: number,
    hull = SLOOP_HULL,
  ): Promise<Sailing | string> {
    const turn = 2 * Math.PI;
    const within = ((heading % turn) + turn) % turn;
    const sailed = await source.sail(id, new Float64Array([x, y, within, 0, 0, 0, 0, 0]), STILL, time, 0, hull);
    if (!sailed) return 'Open this landmass to sail on it.';
    if (sailed.pose.aground) return 'The ship needs water deeper than its draught: put it to sea off the coast.';
    return new Sailing(source, id, sailed, hull);
  }

  /** A key pressed (not held down): a rung key waits for the next step. */
  press(key: string): void {
    if (isRungKey(key)) this.presses.push(key);
  }

  /** Owes it `seconds` more and, unless a step is with the rules, sends the whole ticks owed (a second's at most), the
   *  last ending at `time`, with the helm the keys held and the next press ask. */
  advance(seconds: number, held: ReadonlySet<string>, time: number, fail: (error: unknown) => void): void {
    this.owed = Math.min(this.owed + seconds, MOST_TICKS * TICK_SECONDS);
    if (this.pending) return;
    // A hair over, so six ticks' worth of float seconds is six ticks.
    const ticks = Math.floor(this.owed / TICK_SECONDS + 1e-6);
    if (ticks === 0) return;
    this.owed = Math.max(0, this.owed - ticks * TICK_SECONDS);
    this.pending = true;
    const helm = helmOf(held, this.presses.shift());
    this.inFlight = this.source
      .sail(this.id, this.ship, helm, time - ticks * TICK_SECONDS, ticks, this.hullKind)
      .then((sailed) => {
        this.pending = false;
        if (!sailed) return;
        this.moveTo(sailed.ship, sailed.pose);
      })
      .catch((error: unknown) => {
        this.pending = false;
        fail(error);
      });
  }

  /** Settles once no step is with the rules: a fight begins from its numbers as they are then. */
  whenStill(): Promise<void> {
    return this.inFlight;
  }

  /** Takes its numbers and pose as a fight's answer left them, its run since then stirring its wake. */
  adopt(sailed: Sailed): void {
    this.moveTo(sailed.ship, sailed.pose);
  }

  /** The next rung press, for a fight's helm. */
  takePress(): string | undefined {
    return this.presses.shift();
  }
}
