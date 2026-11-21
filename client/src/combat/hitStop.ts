// A hit-stop: as a blow lands, its striker and the one it meets hold still for a few hundredths of a second, so the
// blow is felt to land; then their drawing catches up, a little fast, to where the fight's rules have them. Only the
// drawing is held: the rules' clock never stops.
import type { FightEvent } from '../network/messages.ts';
import type { FighterView } from '../rules/fighters.ts';
import { EVENT, HOW, landsAsSpell } from './cues.ts';

/** How long each meeting holds both still (seconds): a blow that harms, a kill, a guard broken, a stagger, a parry
 *  and a block; and a crit landing. A kill holds longest, so it lands hardest. */
const HOLD: Readonly<Record<number, number | undefined>> = {
  [EVENT.hit]: 0.075,
  [EVENT.killed]: 0.16,
  [EVENT.guardBroken]: 0.11,
  [EVENT.staggered]: 0.09,
  [EVENT.parried]: 0.08,
  [EVENT.blocked]: 0.05,
};
const CRIT_HOLD = 0.11;
/** After a hold, the drawing runs this share faster than the rules until it has caught up; however many blows land, it
 *  is never more than this far behind (seconds). */
const CATCH_UP = 0.6;
const MOST_BEHIND_S = 0.2;
/** The one struck shudders across the view: this far either way (metres) at first, this many times a second, dying
 *  with the hold. */
const SHUDDER = { metres: 0.035, rate: 45 } as const;

interface Held {
  /** Seconds of the hold still to come, of its whole, and of drawing behind the rules. */
  left: number;
  whole: number;
  lag: number;
  /** The lag's change this frame. */
  change: number;
  /** Whether it was the one struck, which shudders. */
  struck: boolean;
}

/** The fighters held still by blows landing, and how far behind the rules each one's drawing is. */
export class HitStops {
  private readonly held = new Map<number, Held>();
  private clock = 0;

  /** Holds each blow's striker and the one it met, `length` times as long as made (0 holds none). A blow that harms
   *  nothing holds nothing, and nor does a shot or a spell: the feel is the blows'. */
  struck(events: readonly FightEvent[], length = 1): void {
    for (const event of events) {
      const crit = event.kind === EVENT.hit && event.crit ? CRIT_HOLD : 0;
      const hold = Math.max(HOLD[event.kind] ?? 0, crit) * length;
      const notABlow = event.how === HOW.shot || landsAsSpell(event);
      if (hold <= 0 || notABlow || (event.kind === EVENT.hit && event.amount <= 0)) continue;
      for (const [id, struck] of [
        [event.striker, false],
        [event.defender, true],
      ] as const) {
        const held = this.held.get(id) ?? { left: 0, whole: 0, lag: 0, change: 0, struck };
        // A new hold says afresh whether it was the one struck: a striker just struck does not shudder at its own blow.
        if (held.left <= 0) held.struck = struck;
        if (hold > held.left) Object.assign(held, { left: hold, whole: hold });
        held.struck ||= struck;
        this.held.set(id, held);
      }
    }
  }

  /** Runs every hold on by `seconds`: a held drawing falls behind, then catches up. */
  update(seconds: number): void {
    this.clock += seconds;
    for (const [id, held] of this.held) {
      const before = held.lag;
      const holding = Math.min(held.left, seconds);
      held.left -= holding;
      held.lag = Math.min(MOST_BEHIND_S, Math.max(0, held.lag + holding - (seconds - holding) * CATCH_UP));
      held.change = held.lag - before;
      if (held.left <= 0 && held.lag <= 0 && held.change === 0) this.held.delete(id);
    }
  }

  /** Lets a fighter's drawing go at once to where the rules have it: its hold and its lag both gone. */
  release(id: number): void {
    this.held.delete(id);
  }

  /** How far behind the rules a fighter's drawing is, seconds. */
  lagOf(id: number): number {
    return this.held.get(id)?.lag ?? 0;
  }

  /** The seconds a fighter's own drawing moves on this frame, of `seconds` the frame took: none while held, more while
   *  it catches up. */
  shownSeconds(id: number, seconds: number): number {
    return Math.max(0, seconds - (this.held.get(id)?.change ?? 0));
  }

  /** How far the one struck is shuddered across the view now, metres either way; 0 for any other. */
  shudderOf(id: number): number {
    const held = this.held.get(id);
    if (!held?.struck || held.left <= 0 || held.whole <= 0) return 0;
    return SHUDDER.metres * (held.left / held.whole) * Math.sin(this.clock * SHUDDER.rate * 2 * Math.PI);
  }
}

/** A fighter's view as its drawing shows it `ticks` behind the rules: its action's clock that much earlier. */
export function heldBack(view: FighterView, ticks: number): FighterView {
  if (ticks <= 0) return view;
  const { action } = view;
  if ('elapsed' in action) return { ...view, action: { ...action, elapsed: Math.max(0, action.elapsed - ticks) } };
  if ('left' in action) return { ...view, action: { ...action, left: action.left + ticks } };
  return view;
}
