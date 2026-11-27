/** What the first person holds, by the forge's weapon files: each kind swings and is drawn its own way. */
export type WeaponKind = 'staff' | 'dagger' | 'sword' | 'mace' | 'flail' | 'warhammer' | 'axe' | 'bow' | 'fists';

/** The six ways a blow comes, as the forge's records 1 to 6 draw them. */
export type Direction = 'down' | 'downLeft' | 'left' | 'right' | 'downRight' | 'up';
export const DIRECTIONS: readonly Direction[] = ['down', 'downLeft', 'left', 'right', 'downRight', 'up'];
/** The record each direction's strike is drawn from; record 0 is the weapon at rest. */
export const RECORD_OF: Readonly<Record<Direction, number>> = {
  down: 1,
  downLeft: 2,
  left: 3,
  right: 4,
  downRight: 5,
  up: 6,
};

/** The attack button this frame: held now, pressed since the last frame, let go since the last frame; and, with a bow,
 *  a gun or a crossbow, whether it is held up to aim. */
export interface AttackInput {
  readonly attackHeld: boolean;
  readonly attackPressed: boolean;
  readonly attackReleased: boolean;
  readonly aimHeld?: boolean;
}

/** What a frame of the machine set off: a blow that lands now, and an arrow loosed now. */
export interface MachineEvents {
  readonly blow: { readonly direction: Direction } | null;
  readonly loose: boolean;
}

/** DFO's swing law at an average Speed of 50, a weapon of no particular weight: the seconds a strike frame lasts. */
const SWING_BASE_FRAME = (3 * (115 - 50)) / 980;
const SWING_FRAME_MIN = 0.09;
const SWING_FRAME_MAX = 0.4;
const TWO_HANDED = 1.06;
/** At the owner's word every swing takes three quarters of the law's time, as the combat crate's `SWING_PACE`. */
const SWING_PACE = 0.75;
/** How quickly each kind comes round apart from its weight, a sword the measure. */
const HANDLING: Readonly<Record<WeaponKind, number>> = {
  sword: 1,
  staff: 0.97,
  dagger: 0.9,
  mace: 1.03,
  flail: 1.05,
  warhammer: 1.06,
  axe: 1.05,
  bow: 1,
  fists: 0.9,
};
/** The kinds that take both hands, as Daggerfall's staves, warhammers, axes and bows do. */
const BOTH_HANDS: ReadonlySet<WeaponKind> = new Set(['staff', 'warhammer', 'axe', 'bow']);
export const takesBothHands = (kind: WeaponKind): boolean => BOTH_HANDS.has(kind);

/** The seconds one strike frame of `kind` lasts. */
export function swingFrameSeconds(kind: WeaponKind): number {
  const frame = SWING_BASE_FRAME * HANDLING[kind] * (BOTH_HANDS.has(kind) ? TWO_HANDED : 1);
  return Math.min(SWING_FRAME_MAX, Math.max(SWING_FRAME_MIN, frame)) * SWING_PACE;
}

const STRIKE_FRAMES = 5;
/** The strike frame a blow lands on. */
export const HIT_FRAME = 2;
/** How fast a strike's frames run, faster than DFO's: the frames before the blow in the last three quarters of the
 *  time up to it, the first held before; the blow's frame as it lands; the rest over a little over half that time
 *  after it. The blow still lands when the fight's rules land it. The figure seen from outside runs at this pace
 *  too. */
export const STRIKE_PACE = { windup: 0.75, recover: 0.55 } as const;
/** A blow or an end due within this many seconds of now comes now: whole ticks summed as seconds are never exact. */
const DUE = 1e-6;

/** The step a strike `length` steps long shows `time` seconds in, at `tick` seconds a step by DFO's swing law, landing
 *  on HIT_FRAME at STRIKE_PACE and never before step `from`; null once its follow-through is over, at rest while the
 *  swing runs out. */
export function pacedStep(time: number, tick: number, length: number, from = 0): number | null {
  const lands = HIT_FRAME * tick;
  if (time < lands - DUE) {
    const start = lands * (1 - STRIKE_PACE.windup);
    const share = Math.max(0, (time - start) / (lands - start));
    return Math.max(from, Math.min(HIT_FRAME - 1, Math.floor(share * HIT_FRAME)));
  }
  const after = HIT_FRAME + Math.floor(((time - lands) / (lands * STRIKE_PACE.recover)) * (length - HIT_FRAME));
  return after < length ? after : null;
}
/** Bare hands' strike to the left goes up and comes back down, a frame a step. */
export const UNARMED_LEFT = [0, 1, 2, 3, 4, 2, 1, 0] as const;
/** A bow steps on a fixed clock: the draw to its held frame, the release through to the end. */
export const BOW_TICK = 0.0625;
export const BOW_HELD_FRAME = 3;
export const BOW_LOOSE_FRAME = 5;
const BOW_FRAMES = 7;
/** How far through a bow's shot, as `progress` counts it, its arrow leaves: on its loose frame. */
export const BOW_LOOSED = 0.5 + (0.5 * (BOW_LOOSE_FRAME - BOW_HELD_FRAME)) / (BOW_FRAMES - BOW_HELD_FRAME);
/** A bow reloads in what is left of a five-frame swing once the draw and the loose have played. */
export const BOW_RELOAD = Math.max(0, STRIKE_FRAMES * swingFrameSeconds('bow') - (4 + BOW_LOOSE_FRAME) * BOW_TICK);

type Phase = 'idle' | 'strike' | 'draw' | 'release';

/** A fight's own timing of a strike, seconds: when its rules land its blow and end it after it begins, and how far into
 *  it they already are. */
export interface Pace {
  readonly strike: number;
  readonly end: number;
  readonly at?: number;
}

/**
 * The first person's weapon through a swing: which record and frame it shows, and when a blow lands or an arrow
 * leaves. A press swings once; holding the button swings again as each blow ends, a new direction each time. A bow
 * not aimed looses a quick shot at once on a pull, and again as it reloads while held; aimed, it draws and holds the
 * arrow drawn until a pull looses it, or lowers it unloosed when the aim is let go.
 */
export class WeaponMachine {
  readonly kind: WeaponKind;
  record = 0;
  frame = 0;
  private phase: Phase = 'idle';
  private direction: Direction = 'down';
  private clock = 0;
  /** The strike under way: seconds into it, how long each of its steps lasts, and how long it lasts. */
  private time = 0;
  private tick: number;
  private ends: number;
  /** The step a strike is drawn from: a pair's flurry is thrown from a hand already raised. */
  private from = 0;
  private reload = 0;
  private readonly random: () => number;

  constructor(kind: WeaponKind, random: () => number = Math.random) {
    this.kind = kind;
    this.random = random;
    this.tick = swingFrameSeconds(kind);
    this.ends = STRIKE_FRAMES * this.tick;
  }

  /** Whether a swing or a shot is under way. */
  get busy(): boolean {
    return this.phase !== 'idle';
  }

  /** The strike under way, or null at rest and for a bow. */
  get striking(): Direction | null {
    return this.phase === 'strike' ? this.direction : null;
  }

  /** Whether a strike's blow has landed and only its follow-through is left. */
  get followingThrough(): boolean {
    return this.phase === 'strike' && this.time >= (HIT_FRAME + 1) * this.tick - DUE;
  }

  /** How far through the swing or the shot under way, 0..1, or null at rest: the figure seen from outside plays its
   *  own move at the same pace. A bow's draw is its first half and its loose the second. */
  get progress(): number | null {
    if (this.phase === 'strike') return Math.min(1, this.time / this.ends);
    if (this.phase === 'draw') return (Math.min(BOW_HELD_FRAME, this.frame) / BOW_HELD_FRAME) * 0.5;
    if (this.phase === 'release') return 0.5 + (0.5 * (this.frame - BOW_HELD_FRAME)) / (BOW_FRAMES - BOW_HELD_FRAME);
    return null;
  }

  /** Ends a swing or a draw under way at once, with no blow and no arrow, back at rest: the fight's rules ended it. */
  cancel(): void {
    this.phase = 'idle';
    this.record = 0;
    this.frame = 0;
    this.clock = 0;
  }

  /** Ends a bow's reload at once: the fight's rules have loaded it. */
  load(): void {
    this.reload = 0;
  }

  /** How far through a strike its blow lands: on the hit frame, of five frames or of bare hands' left strike's eight,
   *  or as a fight's rules land it. */
  get lands(): number {
    return (HIT_FRAME * this.tick) / this.ends;
  }

  /** Holds the weapon at rest in a pose a fight asks for, one of its own strokes' frames, or lets it back to rest. */
  pose(shown: { readonly record: number; readonly frame: number } | null): void {
    if (this.phase !== 'idle' || this.kind === 'bow') return;
    this.record = shown?.record ?? 0;
    this.frame = shown?.frame ?? 0;
  }

  /** Moves the machine on by `seconds` with this frame's button. A strike begun now starts on the frame `opening`
   *  answers: a pair's flurry is thrown from a hand already raised. A press while a strike's blow has already landed
   *  starts a new strike: the fight's rules, timed in whole ticks, may begin the next swing a little sooner. A strike
   *  begun with a fight's `pace` keeps it: its blow lands and it ends as the rules have it, whatever its weapon. */
  update(
    seconds: number,
    input: AttackInput,
    opening: () => number = () => 0,
    pace: Pace | null = null,
  ): MachineEvents {
    this.reload = Math.max(0, this.reload - seconds);
    return this.kind === 'bow' ? this.shoot(seconds, input) : this.swing(seconds, input, opening, pace);
  }

  private swing(seconds: number, input: AttackInput, opening: () => number, pace: Pace | null): MachineEvents {
    let blow: MachineEvents['blow'] = null;
    if (this.phase === 'strike') {
      const lands = HIT_FRAME * this.tick;
      const before = this.time;
      this.time += seconds;
      if (before < lands - DUE && this.time >= lands - DUE) blow = { direction: this.direction };
      if (this.time >= this.ends - DUE) this.cancel();
    }
    const again = this.followingThrough && input.attackPressed;
    if (again || (this.phase === 'idle' && (input.attackPressed || input.attackHeld)))
      this.beginStrike(opening(), pace);
    if (this.phase === 'strike') this.show();
    return { blow, loose: false };
  }

  private beginStrike(fromStep: number, pace: Pace | null): void {
    this.direction = DIRECTIONS[Math.floor(this.random() * DIRECTIONS.length)] ?? 'down';
    this.phase = 'strike';
    this.from = Math.max(0, Math.min(HIT_FRAME - 1, fromStep));
    if (pace && pace.strike > 0 && pace.end > pace.strike) {
      // A fight's rules time it: a flurry is drawn from its raised hand but lands when they land it.
      [this.tick, this.ends, this.time] = [pace.strike / HIT_FRAME, pace.end, pace.at ?? 0];
      return;
    }
    // On DFO's clock alone a flurry, thrown from a hand already raised, lands a step sooner.
    this.tick = swingFrameSeconds(this.kind);
    this.ends = (this.sequence?.length ?? STRIKE_FRAMES) * this.tick;
    this.time = this.from * this.tick;
  }

  /** The strike's frame as it is shown: its steps at STRIKE_PACE, on DFO's clock or the fight's, and at rest once it
   *  has followed through. */
  private show(): void {
    const sequence = this.sequence;
    const step = pacedStep(this.time, this.tick, sequence?.length ?? STRIKE_FRAMES, this.from);
    this.record = step === null ? 0 : RECORD_OF[this.direction];
    this.frame = step === null ? 0 : (sequence?.[step] ?? step);
  }

  /** Bare hands' strike to the left steps through its own list of frames; every other strike counts up. */
  private get sequence(): readonly number[] | null {
    return this.kind === 'fists' && this.direction === 'left' ? UNARMED_LEFT : null;
  }

  private shoot(seconds: number, input: AttackInput): MachineEvents {
    let loose = false;
    const aiming = input.aimHeld ?? false;
    const ready = this.phase === 'idle' && this.reload <= 0;
    // A draw or a shot begun this frame starts from its own first frame; the time before the press is not its own.
    let begins = false;
    if (this.phase === 'draw' && !aiming) this.cancel();
    else if (this.phase === 'draw' && input.attackPressed) loose = this.loosed();
    else if (ready && aiming) {
      [this.phase, this.frame, this.clock, begins] = ['draw', 0, 0, true];
    } else if (ready && (input.attackPressed || input.attackHeld)) {
      loose = this.loosed();
      begins = true;
    }
    if (this.phase === 'idle') return { blow: null, loose };
    this.clock += begins ? 0 : seconds;
    while (this.phase !== 'idle' && this.clock >= BOW_TICK) {
      this.clock -= BOW_TICK;
      if (this.phase === 'draw') {
        this.frame = Math.min(BOW_HELD_FRAME, this.frame + 1);
        continue;
      }
      this.frame += 1;
      if (this.frame >= BOW_FRAMES) {
        this.phase = 'idle';
        this.frame = 0;
        this.reload = BOW_RELOAD;
      }
    }
    return { blow: null, loose };
  }

  /** The arrow leaves at once: the bow jumps to its loose frame and plays the rest of its release. */
  private loosed(): boolean {
    [this.phase, this.frame, this.clock] = ['release', BOW_LOOSE_FRAME, 0];
    return true;
  }
}
