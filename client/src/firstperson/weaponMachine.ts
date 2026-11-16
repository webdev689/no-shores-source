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

/** The attack button this frame: held now, pressed since the last frame, let go since the last frame. */
export interface AttackInput {
  readonly attackHeld: boolean;
  readonly attackPressed: boolean;
  readonly attackReleased: boolean;
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
  return Math.min(SWING_FRAME_MAX, Math.max(SWING_FRAME_MIN, frame));
}

const STRIKE_FRAMES = 5;
/** The strike frame a blow lands on. */
export const HIT_FRAME = 2;
/** Bare hands' strike to the left goes up and comes back down, a frame a step. */
export const UNARMED_LEFT = [0, 1, 2, 3, 4, 2, 1, 0] as const;
/** A bow steps on a fixed clock: the draw to its held frame, the release through to the end. */
export const BOW_TICK = 0.0625;
export const BOW_HELD_FRAME = 3;
export const BOW_LOOSE_FRAME = 5;
const BOW_FRAMES = 7;
/** A bow reloads in what is left of a five-frame swing once the draw and the loose have played. */
export const BOW_RELOAD = Math.max(0, STRIKE_FRAMES * swingFrameSeconds('bow') - (4 + BOW_LOOSE_FRAME) * BOW_TICK);

type Phase = 'idle' | 'strike' | 'draw' | 'release';

/**
 * The first person's weapon through a swing: which record and frame it shows, and when a blow lands or an arrow
 * leaves. A press swings once; holding the button swings again as each blow ends, a new direction each time. A bow
 * draws while the button is held and looses when it is let go.
 */
export class WeaponMachine {
  readonly kind: WeaponKind;
  record = 0;
  frame = 0;
  private phase: Phase = 'idle';
  private direction: Direction = 'down';
  private clock = 0;
  private step = 0;
  private reload = 0;
  private readonly random: () => number;

  constructor(kind: WeaponKind, random: () => number = Math.random) {
    this.kind = kind;
    this.random = random;
  }

  /** Whether a swing or a shot is under way. */
  get busy(): boolean {
    return this.phase !== 'idle';
  }

  /** The strike under way, or null at rest and for a bow. */
  get striking(): Direction | null {
    return this.phase === 'strike' ? this.direction : null;
  }

  /** How far through the swing or the shot under way, 0..1, or null at rest: the figure seen from outside plays its
   *  own move at the same pace. A bow's draw is its first half and its loose the second. */
  get progress(): number | null {
    if (this.phase === 'strike') {
      const length = this.kind === 'fists' && this.direction === 'left' ? UNARMED_LEFT.length : STRIKE_FRAMES;
      return Math.min(1, (this.step + this.clock / swingFrameSeconds(this.kind)) / length);
    }
    if (this.phase === 'draw') return (Math.min(BOW_HELD_FRAME, this.frame) / BOW_HELD_FRAME) * 0.5;
    if (this.phase === 'release') return 0.5 + (0.5 * (this.frame - BOW_HELD_FRAME)) / (BOW_FRAMES - BOW_HELD_FRAME);
    return null;
  }

  /** Holds the weapon at rest in a pose a fight asks for, one of its own strokes' frames, or lets it back to rest. */
  pose(shown: { readonly record: number; readonly frame: number } | null): void {
    if (this.phase !== 'idle' || this.kind === 'bow') return;
    this.record = shown?.record ?? 0;
    this.frame = shown?.frame ?? 0;
  }

  /** Moves the machine on by `seconds` with this frame's button. A strike begun now starts on the frame `opening`
   *  answers: a pair's flurry is thrown from a hand already raised. */
  update(seconds: number, input: AttackInput, opening: () => number = () => 0): MachineEvents {
    this.reload = Math.max(0, this.reload - seconds);
    return this.kind === 'bow' ? this.shoot(seconds, input) : this.swing(seconds, input, opening);
  }

  private swing(seconds: number, input: AttackInput, opening: () => number): MachineEvents {
    let blow: MachineEvents['blow'] = null;
    if (this.phase === 'strike') {
      const tick = swingFrameSeconds(this.kind);
      this.clock += seconds;
      while (this.phase === 'strike' && this.clock >= tick) {
        this.clock -= tick;
        if (this.advanceStrike()) blow = { direction: this.direction };
      }
    }
    if (this.phase === 'idle' && (input.attackPressed || input.attackHeld)) this.beginStrike(opening());
    return { blow, loose: false };
  }

  private beginStrike(fromStep: number): void {
    this.direction = DIRECTIONS[Math.floor(this.random() * DIRECTIONS.length)] ?? 'down';
    this.phase = 'strike';
    this.record = RECORD_OF[this.direction];
    this.step = Math.max(0, Math.min(HIT_FRAME - 1, fromStep));
    this.frame = (this.sequence?.[this.step] ?? this.step) | 0;
    this.clock = 0;
  }

  /** Bare hands' strike to the left steps through its own list of frames; every other strike counts up. */
  private get sequence(): readonly number[] | null {
    return this.kind === 'fists' && this.direction === 'left' ? UNARMED_LEFT : null;
  }

  /** One frame on; true when the blow lands on it. Bare hands' strike to the left steps through its own list. */
  private advanceStrike(): boolean {
    this.step += 1;
    const sequence = this.sequence;
    const length = sequence?.length ?? STRIKE_FRAMES;
    if (this.step >= length) {
      this.phase = 'idle';
      this.record = 0;
      this.frame = 0;
      return false;
    }
    this.frame = sequence ? (sequence[this.step] ?? 0) : this.step;
    return this.step === HIT_FRAME;
  }

  private shoot(seconds: number, input: AttackInput): MachineEvents {
    let loose = false;
    // A draw begun this frame starts from its first frame; the time before the press is not its own.
    const begins = this.phase === 'idle' && this.reload <= 0 && (input.attackPressed || input.attackHeld);
    if (begins) {
      this.phase = 'draw';
      this.frame = 0;
      this.clock = 0;
    }
    if (this.phase === 'draw' && (input.attackReleased || !input.attackHeld)) this.phase = 'release';
    if (this.phase === 'idle') return { blow: null, loose };
    this.clock += begins ? 0 : seconds;
    while (this.phase !== 'idle' && this.clock >= BOW_TICK) {
      this.clock -= BOW_TICK;
      if (this.phase === 'draw') {
        this.frame = Math.min(BOW_HELD_FRAME, this.frame + 1);
        continue;
      }
      this.frame += 1;
      if (this.frame === BOW_LOOSE_FRAME) loose = true;
      if (this.frame >= BOW_FRAMES) {
        this.phase = 'idle';
        this.frame = 0;
        this.reload = BOW_RELOAD;
      }
    }
    return { blow: null, loose };
  }
}
