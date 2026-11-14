/** The weapons that fire on a trigger rather than swing: DFO's two guns and the crossbow. */
export type ShooterKind = 'thunderlock' | 'pistolet' | 'crossbow';

/** How a shooter handles in first person: its frames a second, its reload in seconds, the frame its shot leaves on and
 *  the frames of its cycle; the kick in design pixels up; how far it sits sunk below the screen's foot, the kick's
 *  height for a gun so the kick never lifts its cut into sight; and how far it dips while it reloads, a share of its
 *  own height. */
export interface ShooterFeel {
  readonly fps: number;
  readonly reload: number;
  readonly hitFrame: number;
  readonly frames: number;
  readonly kick: number;
  readonly sunk: number;
  readonly dip: number;
}

/** DFO's numbers, as its gun and pistol labs settled them. A crossbow's frames draw its own reload, so it never dips. */
export const SHOOTER_FEEL: Readonly<Record<ShooterKind, ShooterFeel>> = {
  thunderlock: { fps: 14, reload: 1.7, hitFrame: 1, frames: 7, kick: 5, sunk: 5, dip: 0.55 },
  pistolet: { fps: 12, reload: 1.4, hitFrame: 1, frames: 6, kick: 3, sunk: 3, dip: 0.7 },
  crossbow: { fps: 7, reload: 0.6, hitFrame: 1, frames: 7, kick: 1.5, sunk: 0, dip: 0 },
};
/** A gun beside a blade reloads this many times as long: the hand that would load it holds the blade. */
export const ONE_HANDED_RELOAD = 2;

type ShotState = 'idle' | 'firing' | 'cooling';

/** What a step of a shooter set off: the shot leaving, or the weapon loaded again. */
export type ShotEvent = 'hit' | 'ready' | null;

/**
 * A shooter through its cycle: idle and loaded, then firing through its frames at its own rate (the shot leaving on
 * its hit frame), then cooling while it reloads. A shot under way cannot be replaced. Each frame's edge is read on its
 * later side, so frames summed a hair short of a whole still step on.
 */
export class ShotMachine {
  readonly feel: ShooterFeel;
  readonly reload: number;
  frame = 0;
  shots = 0;
  private state: ShotState = 'idle';
  private clock = 0;
  private landed = false;

  constructor(feel: ShooterFeel, reloadScale = 1) {
    this.feel = feel;
    this.reload = feel.reload * reloadScale;
  }

  /** Loaded and at rest: a pull fires it. */
  get loaded(): boolean {
    return this.state === 'idle';
  }

  /** Its shot's frames are playing. */
  get firing(): boolean {
    return this.state === 'firing';
  }

  private get fireSeconds(): number {
    return this.feel.frames / this.feel.fps;
  }

  /** How far through its shot's frames, 0..1, or null outside them. */
  get progress(): number | null {
    return this.state === 'firing' ? Math.min(1, this.clock / this.fireSeconds) : null;
  }

  /** How far through the reload, 0..1, or null outside it. */
  get reloading(): number | null {
    return this.state === 'cooling' ? Math.min(1, this.clock / Math.max(this.reload, 1e-6)) : null;
  }

  /** Pulls the trigger: true when it fires, false while a shot or a reload is under way. */
  fire(): boolean {
    if (this.state !== 'idle') return false;
    this.state = 'firing';
    this.frame = 0;
    this.clock = 0;
    this.landed = false;
    this.shots += 1;
    return true;
  }

  /** Moves the cycle on by `seconds`: answers 'hit' as the shot leaves and 'ready' as the reload ends. */
  step(seconds: number): ShotEvent {
    const tick = Math.max(0, seconds);
    if (this.state === 'firing') {
      this.clock += tick;
      const reached = Math.floor(this.clock * this.feel.fps + 1e-9);
      this.frame = Math.min(reached, this.feel.frames - 1);
      let event: ShotEvent = null;
      if (!this.landed && this.frame >= this.feel.hitFrame) {
        this.landed = true;
        event = 'hit';
      }
      if (reached >= this.feel.frames) [this.state, this.clock, this.frame] = ['cooling', 0, 0];
      return event;
    }
    if (this.state === 'cooling') {
      this.clock += tick;
      if (this.clock >= this.reload) {
        this.state = 'idle';
        return 'ready';
      }
    }
    return null;
  }
}

/** The kick's spring: how stiff and how damped, and the longest step it is integrated over. */
const SPRING_STIFF = 400;
const SPRING_DAMP = 36;
const SPRING_STEP = 0.004;

/** A shot's kick as a spring: the barrel is up by the kick the frame the trigger breaks, and rides back down. A second
 *  shot into the recovery stacks on what is left. */
export class Recoil {
  private rise = 0;
  private speed = 0;

  punch(amount: number): void {
    this.rise += amount;
  }

  /** The rise in design pixels after `seconds`. */
  step(seconds: number): number {
    const tick = Math.max(0, seconds);
    const count = Math.max(1, Math.ceil(tick / SPRING_STEP));
    const each = tick / count;
    for (let index = 0; index < count; index++) {
      this.speed += (-SPRING_STIFF * this.rise - SPRING_DAMP * this.speed) * each;
      this.rise += this.speed * each;
    }
    return this.rise;
  }
}

const smooth = (from: number, to: number, value: number) => {
  const share = Math.max(0, Math.min(1, (value - from) / (to - from)));
  return share * share * (3 - 2 * share);
};

/** The reload's dip at a share of the reload: down over its first fifth, held, back up over its last quarter. */
export function reloadDip(share: number | null): number {
  if (share === null || !(share > 0) || !(share < 1)) return 0;
  return smooth(0, 0.2, share) * (1 - smooth(0.75, 1, share));
}

/** How quickly a gun comes into its carry at a run and out of it, a whole change a second times this, and how far it
 *  dips below the view as its hold changes. */
const CARRY_EASE = 5;
const CARRY_DIP = 70;
/** The carry's frames through one stride. */
export const CARRY_FRAMES = 6;

/** A gun carried at a run: its weight eases up while running with the gun loaded, and down otherwise. Past halfway the
 *  carry's frames show; the gun dips most at the swap, so no picture changes in sight. */
export class Carry {
  weight = 0;

  step(seconds: number, wanted: boolean): void {
    const change = Math.max(0, Math.min(0.1, seconds)) * CARRY_EASE;
    this.weight = Math.max(0, Math.min(1, this.weight + (wanted ? change : -change)));
  }

  get carried(): boolean {
    return this.weight >= 0.5;
  }

  /** The dip in design pixels. */
  get dip(): number {
    return CARRY_DIP * (1 - Math.abs(2 * this.weight - 1));
  }
}
