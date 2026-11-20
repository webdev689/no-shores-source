import type { GearAsk } from '../network/gearMessages.ts';

/** The most ticks the room in the page runs on in one frame to answer the panels' asks while the fight waits: a
 *  second, time for the four asks it holds at once, answered a fifth of a second apart, and the gear it sends after. */
export const ANSWER_TICKS_MOST = 60;

/** The player's fight, as the panels ask through it. */
interface Asking {
  askGear(ask: GearAsk): void;
  readonly asking: boolean;
}

/**
 * The panels' asks of the player's gear. Alone, the room in the page waits while the pointer is free, and it answers a
 * player's asks only five times a second, holding four and letting the rest go, and sends their gear as often; so an
 * ask carried by a single tick waits for play to resume, and the asks after it are lost. While the fight waits, the
 * page runs the room on, the player standing still, until it has answered every ask made, so each shows at once.
 */
export class PanelAsks {
  private made = 0;

  /** Asks of the gear through the fight, once there is one. */
  ask(fight: Asking | null, ask: GearAsk): void {
    if (!fight) return;
    fight.askGear(ask);
    this.made += 1;
  }

  /** Runs `tick` (the player standing still, carrying the next ask, and the room ticked once) until the room's count
   *  of asks answered, as `answered` reads it from its last word, reaches the asks made, for a second at most. */
  carry(fight: Asking, answered: () => number, tick: () => void): void {
    for (let ticks = 0; ticks < ANSWER_TICKS_MOST && (fight.asking || answered() < this.made); ticks += 1) tick();
    // An ask the room let go is never answered, so it holds the room on no longer.
    this.made = Math.min(this.made, answered());
  }
}
