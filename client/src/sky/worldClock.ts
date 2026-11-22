/** A room's tick, seconds (crates/movement's TICK_SECONDS). */
export const ROOM_TICK_S = 1 / 60;
/** Real seconds a day of the game lasts, and the instant world time counts from (crates/sky/src/clock.rs). */
export const DAY_S = 3600;
export const EPOCH_UNIX_MS = 1_793_491_200_000;

/** World time, seconds, at a moment given in milliseconds since 1970. */
export function worldSeconds(unixMs: number): number {
  return (unixMs - EPOCH_UNIX_MS) / 1000;
}

/** The hour of the day at a world time, 0 to 24. */
export function hourOf(worldS: number): number {
  const days = worldS / DAY_S;
  return (days - Math.floor(days)) * 24;
}

/**
 * The page's world clock: the wall's time, set right by each room's word. A room's tick has a world time its welcome
 * gives the start of, so a snapshot's tick says what world time it is in the room, and the page keeps the gap
 * between that and its own wall, eased so the sky never jumps. With no room it reads its own wall.
 */
export class WorldClock {
  private offset = 0;
  private told = false;
  private readonly now: () => number;

  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  /** World time now, seconds. */
  seconds(): number {
    return worldSeconds(this.now()) + this.offset;
  }

  /** A room's word that its world time is `worldS` now: the first word sets the clock, later ones nudge it. */
  heard(worldS: number): void {
    const gap = worldS - worldSeconds(this.now());
    if (!Number.isFinite(gap)) return;
    this.offset = this.told ? this.offset + (gap - this.offset) * 0.05 : gap;
    this.told = true;
  }
}

/** The page's one world clock, which the rooms' snapshots set right and the sky reads. */
export const WORLD_CLOCK = new WorldClock();

/** The moment now in milliseconds since 1970, as the rooms keep it: the wall's, set right by their word, so a page
 *  whose own clock is wrong still turns the day and the week with them. */
export function roomNow(): number {
  return EPOCH_UNIX_MS + WORLD_CLOCK.seconds() * 1000;
}
