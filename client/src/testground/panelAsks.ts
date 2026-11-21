import { GATHER_S } from '../game/footGear.ts';
import { ASKS, type GearAsk } from '../network/gearMessages.ts';

/** The most ticks the room in the page runs on in one frame to answer the panels' asks while the fight waits: a
 *  second, time for the four asks it holds at once, answered a fifth of a second apart, and the gear it sends after. */
export const ANSWER_TICKS_MOST = 60;
/** A gather's ticks, sixty a second, and a tenth of a second over for the room to tell it done: answered as it begins,
 *  a gather is done only after them. */
export const GATHER_TICKS_MOST = GATHER_S * 60 + 6;

/** The player's fight, as the panels ask through it. */
interface Asking {
  askGear(ask: GearAsk): void;
  readonly asking: boolean;
}

/**
 * The panels' asks of the player's gear. Alone, the room in the page waits while the pointer is free, and it answers a
 * player's asks only five times a second, holding four and letting the rest go, and sends their gear as often; so an
 * ask carried by a single tick waits for play to resume, and the asks after it are lost. While the fight waits, the
 * page runs the room on, the player standing still, until it has answered every ask made, so each shows at once; and
 * through a gather's two seconds, so it is done.
 */
export class PanelAsks {
  private made = 0;
  private gathering = false;

  /** Asks of the gear through the fight, once there is one. */
  ask(fight: Asking | null, ask: GearAsk): void {
    if (!fight) return;
    fight.askGear(ask);
    this.made += 1;
    this.gathering ||= ask.kind === ASKS.gather;
  }

  /** Runs `tick` (the player standing still, carrying the next ask, and the room ticked once) until the room's count
   *  of asks answered, as `answered` reads it from its last word, reaches the asks made, for a second at most; and
   *  through a gather asked. */
  carry(fight: Asking, answered: () => number, tick: () => void): void {
    const gather = this.gathering ? GATHER_TICKS_MOST : 0;
    this.gathering = false;
    const most = Math.max(ANSWER_TICKS_MOST, gather);
    for (let ticks = 0; ticks < most && (ticks < gather || fight.asking || answered() < this.made); ticks += 1) tick();
    // An ask the room let go is never answered, so it holds the room on no longer.
    this.made = Math.min(this.made, answered());
  }
}
