import { inArea, type WaveFoe, type WreckLayout } from './wreckLayout.ts';

/** The most of the wreck's foes alive at once; a wave's others wait their turn. */
export const ALIVE_MOST = 6;
/** A body this far over the sea, metres, is below every deck: it fell in. */
export const IN_THE_SEA_M = 1.5;
/** How long a body lies in the sea before it is brought back to its checkpoint, seconds. */
export const BROUGHT_BACK_S = 1.2;
/** The boss fight ends once Thule is brought under this share of his health, or this long after it begins. */
export const BOSS_UNDER = 1 / 3;
export const BOSS_SECONDS = 150;

/** How the boss fight ended: the player fell, or the fight was stopped with Thule still standing. */
export type Outcome = 'felled' | 'overpowered';

/** What the level asks of its room after a frame: a checkpoint to keep, foes to stand, and the player brought back
 *  from the sea to where. */
export interface Asks {
  readonly checkpoint: readonly [number, number] | null;
  readonly stand: readonly WaveFoe[];
  readonly bringBack: readonly [number, number] | null;
}

/** Where the player is this frame, and what the level needs of the fight. */
export interface Seen {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Whether the player's fighter lies dead. */
  readonly dead: boolean;
  /** The wreck's foes alive now. */
  readonly alive: number;
  /** Thule's health and its most, once he stands. */
  readonly thule: { readonly health: number; readonly healthMax: number } | null;
}

/**
 * The wreck's progress along its path, with no room or drawing: the zones the player has reached, each one's
 * checkpoint kept and the next zone's wave stood ahead of them (so its foes are already fighting each other when the
 * player comes), no more than `ALIVE_MOST` alive at once; a fall into the sea brought back to the last checkpoint after
 * a moment; and the boss fight's end.
 */
export class WreckProgress {
  private readonly layout: WreckLayout;
  /** The furthest zone reached; -1 before the first. */
  zone = -1;
  /** Whether the player has entered the arena. */
  arena = false;
  private readonly waiting: WaveFoe[] = [];
  private stood = 0;
  private inSea = 0;
  private bossFor: number | null = null;
  outcome: Outcome | null = null;

  constructor(layout: WreckLayout) {
    this.layout = layout;
  }

  /** Whether the player has reached a zone. */
  reached(zone: number): boolean {
    return zone <= this.zone;
  }

  /** Whether the boss fight has begun. */
  get fighting(): boolean {
    return this.bossFor !== null;
  }

  /** The boss fight begins: its clock starts. */
  beginBoss(): void {
    this.bossFor ??= 0;
  }

  /** The waves stood up to and including `zone` (one ahead of the furthest reached). */
  private standUpTo(zone: number): void {
    const { zones } = this.layout;
    for (; this.stood <= Math.min(zone, zones.length - 1); this.stood++)
      this.waiting.push(...(zones[this.stood]?.wave ?? []));
  }

  /** One frame of `seconds`: the zones reached, the waves stood, the sea, and the boss fight's end. */
  frame(seen: Seen, seconds: number): Asks {
    const { zones, arena } = this.layout;
    let checkpoint: readonly [number, number] | null = null;
    // A body in the sea reaches no zone: its feet are not on the deck.
    const inSea = seen.z < IN_THE_SEA_M;
    zones.forEach((zone, index) => {
      if (index <= this.zone || inSea || !inArea(zone.area, seen.x, seen.y)) return;
      this.zone = index;
      checkpoint = zone.checkpoint;
    });
    if (this.zone >= arena.zone) this.arena = true;
    this.standUpTo(this.zone + 1);
    // The boss fight is one on one: a wave still waiting never comes.
    if (this.fighting) this.waiting.length = 0;
    const stand = this.waiting.splice(0, Math.max(0, ALIVE_MOST - seen.alive));
    this.inSea = inSea && !seen.dead ? this.inSea + seconds : 0;
    const last = zones[Math.max(0, this.zone)]?.checkpoint ?? null;
    // Once the boss fight begins, a player who climbs out over the closed way is brought back into the arena.
    const fled = this.fighting && !inSea && !inArea(zones[arena.zone]?.area ?? [0, 0, 0, 0], seen.x, seen.y);
    const back = this.inSea >= BROUGHT_BACK_S || fled ? last : null;
    if (back) this.inSea = 0;
    if (this.bossFor !== null && !this.outcome) {
      this.bossFor += seconds;
      const thule = seen.thule;
      if (seen.dead) this.outcome = 'felled';
      else if (this.bossFor >= BOSS_SECONDS || (thule && thule.health < thule.healthMax * BOSS_UNDER))
        this.outcome = 'overpowered';
    }
    return { checkpoint, stand, bringBack: back };
  }
}
