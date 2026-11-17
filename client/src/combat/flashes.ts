import type { FightEvent } from '../network/messages.ts';

/** How long a figure flashes when a blow harms it, seconds. */
export const FLASH_SECONDS = 0.1;

/** Which fighters flash, struck for harm, and how much of each one's flash is left. */
export class Flashes {
  private readonly left = new Map<number, number>();

  /** Runs each flash down by `seconds`, then starts one on every fighter the events harmed. */
  update(events: readonly FightEvent[], seconds: number): void {
    for (const [id, left] of this.left) {
      if (left > seconds) this.left.set(id, left - seconds);
      else this.left.delete(id);
    }
    for (const event of events) if (event.amount > 0) this.left.set(event.defender, FLASH_SECONDS);
  }

  /** How strongly a fighter flashes now: 1 as it is struck, 0 once its flash is over. */
  shareOf(id: number): number {
    return (this.left.get(id) ?? 0) / FLASH_SECONDS;
  }
}
