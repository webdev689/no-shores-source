// The player's own hits as the page foresees them: each foe its prediction of their swing hits, told as the room
// would tell it on the tick the blow lands, and the room's word on that hit marked felt when it comes, so the hit's
// flash, sound and hold play once, as it lands (`feltNow`).
import type { FightEvent } from '../network/messages.ts';
import type { ForeseenHit } from '../rules/combatRules.ts';
import { EVENT, HOW } from './cues.ts';

/** How long past the room tick a hit was foreseen at its room's word is waited for, in ticks. */
const WAIT = 60;
/** The most foreseen hits kept for a frame to take: a hidden tab draws none to take them. */
const KEPT_MOST = 256;

export class Foresight {
  private foreseen: FightEvent[] = [];
  private awaited: { readonly defender: number; readonly stroke: number; readonly tick: number }[] = [];

  /** Keeps `hits` of `player`'s swing, foreseen on a tick expected at room tick `tick`; whether any were. */
  foresee(hits: readonly ForeseenHit[], player: number, tick: number): boolean {
    for (const { defender, damage, stroke, crit } of hits) {
      const [kind, how, amount] = [EVENT.hit, HOW.swing, damage];
      this.foreseen.push({ tick: BigInt(tick), kind, how, striker: player, defender, amount, stroke, crit });
      this.awaited.push({ defender, stroke, tick });
    }
    this.foreseen = this.foreseen.slice(-KEPT_MOST);
    return hits.length > 0;
  }

  /** The room's `event`, marked felt if it is its word on a hit of `player`'s foreseen. */
  felt(event: FightEvent, player: number): FightEvent {
    if (event.kind !== EVENT.hit || event.striker !== player) return event;
    const kept = this.awaited.findIndex((each) => each.defender === event.defender && each.stroke === event.stroke);
    if (kept < 0) return event;
    this.awaited.splice(kept, 1);
    return { ...event, felt: true };
  }

  /** Lets go of each hit whose room's word has not come by room tick `now`: the room judged it otherwise. */
  expire(now: number): void {
    this.awaited = this.awaited.filter((each) => each.tick + WAIT >= now);
  }

  /** The hits foreseen since last taken, handed over once: what the room will tell of them, but for their damage,
   *  which is the blow's before the gear's power. */
  take(): FightEvent[] {
    const foreseen = this.foreseen;
    this.foreseen = [];
    return foreseen;
  }
}
