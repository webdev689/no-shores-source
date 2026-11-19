import { type Area, inArea, type WaveFoe, type WreckLayout } from './wreckLayout.ts';

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

/** A foe of a wave to stand, and the zone whose wave it is. */
export interface Standing extends WaveFoe {
  readonly zone: number;
}

/** What the level asks of its room after a frame: a checkpoint to keep, foes to stand, the zones whose gates open,
 *  and the player brought back from the sea, or from beyond a closed way, to where. */
export interface Asks {
  readonly checkpoint: readonly [number, number] | null;
  readonly stand: readonly Standing[];
  readonly open: readonly number[];
  readonly bringBack: readonly [number, number] | null;
}

/** Where the player is this frame, and what the level needs of the fight. */
export interface Seen {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Whether the player's fighter lies dead. */
  readonly dead: boolean;
  /** The wreck's foes alive now, by the zone whose wave they came in. */
  readonly alive: readonly number[];
  /** Thule's health and its most, once he stands. */
  readonly thule: { readonly health: number; readonly healthMax: number } | null;
}

/**
 * The wreck's progress along its path, with no room or drawing: the zones the player has reached, each one's
 * checkpoint kept and the next zone's wave stood ahead of them (so its foes are already fighting each other when the
 * player comes), no more than `ALIVE_MOST` alive at once; the way on from each zone closed until its wave has fallen;
 * a fall into the sea, a climb over a closed way, or once the boss fight begins any step off the arena, brought back
 * to the last checkpoint; and the boss fight's end.
 */
export class WreckProgress {
  private readonly layout: WreckLayout;
  /** The furthest zone reached; -1 before the first. */
  zone = -1;
  /** Whether the player has entered the arena. */
  arena = false;
  private readonly waiting: Standing[] = [];
  /** Whether each zone's way on is still closed. */
  private readonly closed: boolean[];
  private stood = 0;
  private inSea = 0;
  private bossFor: number | null = null;
  outcome: Outcome | null = null;

  constructor(layout: WreckLayout) {
    this.layout = layout;
    this.closed = layout.zones.map((zone) => zone.gate !== null);
  }

  /** Whether the boss fight has begun. */
  get fighting(): boolean {
    return this.bossFor !== null;
  }

  /** The boss fight begins: its clock starts. */
  beginBoss(): void {
    this.bossFor ??= 0;
  }

  /** The furthest zone the player may stand in: the first whose way on is closed. */
  private get furthest(): number {
    const first = this.closed.indexOf(true);
    return first < 0 ? this.layout.zones.length - 1 : first;
  }

  /** Where the boss fight is fought: the arena's area from the heap that closes it, so a body backed against the heap
   *  is still in it, though one only enters the arena clear of where the heap will stand. */
  private get arenaBounds(): Area {
    const { zones, arena } = this.layout;
    const [minX, , maxX, maxY] = zones[arena.zone]?.area ?? [0, 0, 0, 0];
    return [minX, arena.gate.minY, maxX, maxY];
  }

  /** Whether the player may be in a zone: once the boss fight begins, only the arena. */
  private allowed(zone: number): boolean {
    return this.fighting ? zone === this.layout.arena.zone : zone <= this.furthest;
  }

  /** The waves stood up to and including `zone` (one ahead of the furthest reached). */
  private standUpTo(zone: number): void {
    const { zones } = this.layout;
    for (; this.stood <= Math.min(zone, zones.length - 1); this.stood++)
      this.waiting.push(...(zones[this.stood]?.wave ?? []).map((foe) => ({ ...foe, zone: this.stood })));
  }

  /** The zones whose ways open now: each wave stood whole in an earlier frame, none of it waiting or alive. */
  private opening(alive: readonly number[]): number[] {
    const open: number[] = [];
    this.closed.forEach((closed, zone) => {
      if (!closed || zone >= this.stood || (alive[zone] ?? 0) > 0) return;
      if (this.waiting.some((foe) => foe.zone === zone)) return;
      this.closed[zone] = false;
      open.push(zone);
    });
    return open;
  }

  /** One frame of `seconds`: the ways opened, the zones reached, the waves stood, the sea, and the boss fight's end. */
  frame(seen: Seen, seconds: number): Asks {
    const { zones, arena } = this.layout;
    const open = this.opening(seen.alive);
    let checkpoint: readonly [number, number] | null = null;
    // A body in the sea reaches no zone: its feet are not on the deck.
    const inSea = seen.z < IN_THE_SEA_M;
    zones.forEach((zone, index) => {
      if (index <= this.zone || inSea || !this.allowed(index) || !inArea(zone.area, seen.x, seen.y)) return;
      this.zone = index;
      checkpoint = zone.checkpoint;
    });
    if (this.zone >= arena.zone) this.arena = true;
    this.standUpTo(this.zone + 1);
    // The boss fight is one on one: a wave still waiting never comes.
    if (this.fighting) this.waiting.length = 0;
    const alive = seen.alive.reduce((sum, count) => sum + count, 0);
    const stand = this.waiting.splice(0, Math.max(0, ALIVE_MOST - alive));
    this.inSea = inSea && !seen.dead ? this.inSea + seconds : 0;
    const last = zones[Math.max(0, this.zone)]?.checkpoint ?? null;
    // A player who climbs over a closed way is brought back; so, once the boss fight begins, is one anywhere off the
    // arena (over its heap, or over her rails onto the channels), short of the sea, which brings them back itself.
    const astray =
      !inSea &&
      (this.fighting
        ? !inArea(this.arenaBounds, seen.x, seen.y)
        : zones.some((zone, index) => !this.allowed(index) && inArea(zone.area, seen.x, seen.y)));
    const back = this.inSea >= BROUGHT_BACK_S || astray ? last : null;
    if (back) this.inSea = 0;
    if (this.bossFor !== null && !this.outcome) {
      this.bossFor += seconds;
      const thule = seen.thule;
      if (seen.dead) this.outcome = 'felled';
      else if (this.bossFor >= BOSS_SECONDS || (thule && thule.health < thule.healthMax * BOSS_UNDER))
        this.outcome = 'overpowered';
    }
    return { checkpoint, stand, open, bringBack: back };
  }
}
