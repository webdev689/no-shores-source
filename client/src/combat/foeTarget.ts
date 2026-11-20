// Whom the player is fighting, after DFO's Enhanced HUD: the foe their blow last reached, the one their soft lock takes,
// or one winding up a telegraphed blow at them. The target plate shows it for a while after the last exchange and then
// fades, so a foe left behind stops being furniture at the top of the screen; it goes at once when the foe dies. The
// foes fought, either way, keep their plates over their heads whatever the player looks at for as long as the target
// plate would stand, fading as it fades, so a fight's plates go a few seconds after it moves on, as Destiny's do.
import type { FightEvent } from '../network/messages.ts';
import type { FighterView } from '../rules/fighters.ts';
import { EVENT } from './cues.ts';

/** How long the target stands after the last exchange with it, and the last stretch of that over which it fades, in
 *  seconds. */
export const TARGET_SECONDS = 6;
export const TARGET_FADE_SECONDS = 1.5;
/** A foe winding up at the player takes the target unless the player struck another this recently, in seconds. */
export const THREAT_YIELD_SECONDS = 2;

/** A foe as the target reads it: its number and how it stands. */
export interface TargetFoe {
  readonly id: number;
  readonly view: FighterView;
}

/** One frame of the fight as the target reads it: the player's number, what the soft lock holds, every foe, and the
 *  room's events since the last frame. */
export interface TargetFrame {
  readonly player: number;
  readonly lock: number | null;
  readonly foes: readonly TargetFoe[];
  readonly events: readonly FightEvent[];
}

const living = (foe: TargetFoe | undefined): foe is TargetFoe => !!foe && foe.view.action.kind !== 'dead';
/** The events of a blow given and taken, whatever it came to; not a foe standing up at an ask, nor a feint. */
const BLOWS: ReadonlySet<number> = new Set([
  EVENT.hit,
  EVENT.blocked,
  EVENT.parried,
  EVENT.guardBroken,
  EVENT.dodged,
  EVENT.perfect,
  EVENT.staggered,
  EVENT.killed,
]);
const windingUpAt = (foe: TargetFoe, player: number) =>
  foe.view.action.kind === 'telegraph' && foe.view.target === player;

/** The target, kept from frame to frame. */
export class FoeTarget {
  private shown: number | null = null;
  private left = 0;
  private sinceStruck = Infinity;
  private lock: number | null = null;
  private readonly windingUp = new Set<number>();
  /** Seconds since each foe last traded a blow with the player. */
  private readonly fought = new Map<number, number>();

  /** Steps the target `seconds` on through `frame`; answers the foe shown and how much of it shows, 1 down to 0 as it
   *  fades, or null for none. */
  step(frame: TargetFrame, seconds: number): { readonly id: number; readonly share: number } | null {
    const foes = new Map(frame.foes.map((foe) => [foe.id, foe]));
    this.sinceStruck += seconds;
    this.left -= seconds;
    for (const [id, since] of this.fought) {
      if (since + seconds >= TARGET_SECONDS || !foes.has(id)) this.fought.delete(id);
      else this.fought.set(id, since + seconds);
    }
    const reached: number[] = [];
    for (const event of frame.events.filter((each) => BLOWS.has(each.kind))) {
      const [striker, defender] = [event.striker, event.defender];
      if (striker === frame.player && foes.has(defender)) this.fought.set(defender, 0);
      if (defender === frame.player && foes.has(striker)) this.fought.set(striker, 0);
      if (striker === frame.player && living(foes.get(defender))) reached.push(defender);
    }
    // A stroke that strikes several keeps to the lock's foe among them, else the first it struck: the rules strike the
    // lock's foe first, then the nearest.
    const kept = reached.find((id) => id === frame.lock) ?? reached[0];
    if (kept !== undefined) {
      this.take(kept);
      this.sinceStruck = 0;
    }
    if (frame.lock !== this.lock && living(foes.get(frame.lock ?? NaN))) this.take(frame.lock ?? 0);
    this.lock = frame.lock;
    for (const foe of frame.foes) {
      const begins = windingUpAt(foe, frame.player) && !this.windingUp.has(foe.id);
      if (windingUpAt(foe, frame.player)) this.windingUp.add(foe.id);
      else this.windingUp.delete(foe.id);
      const another = this.shown !== null && this.shown !== foe.id && living(foes.get(this.shown));
      if (begins && living(foe) && !(another && this.sinceStruck < THREAT_YIELD_SECONDS)) this.take(foe.id);
    }
    if (this.shown === null || this.left <= 0 || !living(foes.get(this.shown))) {
      this.shown = null;
      return null;
    }
    return { id: this.shown, share: Math.min(1, this.left / TARGET_FADE_SECONDS) };
  }

  /** How much the fight holds `id`'s plate, 1 down to 0: as the target plate would stand from the last blow it traded
   *  with the player, struck or struck by. Being the target alone holds none: a foe winding up at the player, or one
   *  the soft lock let go, shows by the cone like any other. */
  foughtShare(id: number): number {
    const since = this.fought.get(id);
    return since === undefined ? 0 : Math.max(0, Math.min(1, (TARGET_SECONDS - since) / TARGET_FADE_SECONDS));
  }

  private take(id: number): void {
    this.shown = id;
    this.left = TARGET_SECONDS;
  }
}
