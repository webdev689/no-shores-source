import {
  FLURRY_FROM_FRAME,
  GUARD,
  type Hand,
  type HandsPlan,
  type Holding,
  fistGuard,
  guardStep,
  otherHand,
  strikeHandOf,
  strikePicture,
} from './handsLaw.ts';
import { CARRY_FRAMES, Carry, ONE_HANDED_RELOAD, Recoil, SHOOTER_FEEL, ShotMachine, reloadDip } from './shotMachine.ts';
import { type AttackInput, DIRECTIONS, type Direction, type Pace, RECORD_OF, WeaponMachine } from './weaponMachine.ts';

/** What the hands set off this frame: a blow landing and the hand that threw it, and a bolt, an arrow or a shot
 *  leaving, with the hand it left (`hand`, null when nothing left). */
export interface HandsEvents {
  readonly blow: { readonly direction: Direction; readonly hand: Hand } | null;
  readonly loose: boolean;
  readonly hand: Hand | null;
}

/** The blow or shot under way: its direction (null for a bow, a gun or a crossbow), how far through it and how far
 *  through it the blow lands, the hand that threw it, whether the two hands take turns, as a pair does, and whether a
 *  gun or crossbow is reloading after its shot (its progress then runs through the reload). */
export interface Swing {
  readonly direction: Direction | null;
  readonly progress: number;
  readonly lands: number;
  readonly hand: Hand;
  readonly paired: boolean;
  readonly reload: boolean;
}

/** One hand as it is drawn: what it holds, its record and frame, mirrored about the screen's middle or not, lowered by a
 *  share of its own height, moved in toward the middle and down in design pixels, and whether a crossbow is drawn from
 *  its pair's art. */
export interface HandView {
  readonly hand: Hand;
  readonly holding: Holding;
  readonly record: number;
  readonly frame: number;
  readonly flip: boolean;
  readonly lower: number;
  readonly dx: number;
  readonly dy: number;
  readonly pairArt: boolean;
}

/** One fighting hand: what it holds, the machine that swings or fires it, its kick and its guard. */
interface Arm {
  readonly hand: Hand;
  readonly holding: Holding;
  readonly melee: WeaponMachine | null;
  readonly shot: ShotMachine | null;
  readonly recoil: Recoil;
  guard: number;
  rise: number;
}

/** The records a weapon in the left hand alone draws mirrored: at rest (a flail's swing too), and the strikes down and
 *  up, which the forge drew alike for either hand. Every other strike keeps its own side. A bow is mirrored whole. */
const MIRRORED_RECORDS = new Set([0, 1, 6, 7]);
const aloneFlip = (hand: Hand, holding: Holding, record: number) =>
  hand === 'left' && (kindOf(holding) === 'bow' || MIRRORED_RECORDS.has(record));
/** A flail at rest wears its chain's swing, which the forge drew as record 7. */
export const SWAY_RECORD = 7;
export const SWAY_FRAMES = 9;
const BOW_FRAMES = 7;
const STRIKE_FRAMES = 5;
/** A pair's weapons stand this many design pixels further out, each toward its own side: two blades leaning in from
 *  the sides otherwise close on the middle. */
const PAIR_APART = 34;
const STILL: AttackInput = { attackHeld: false, attackPressed: false, attackReleased: false };
const PULL: AttackInput = { attackHeld: true, attackPressed: true, attackReleased: false };
const NOTHING: HandsEvents = { blow: null, loose: false, hand: null };
/** How far one step carries a runner; the carry's stride is two. */
const STEP_M = 2.5;

const busy = (arm: Arm) => !!arm.melee?.busy || !!arm.shot?.firing;
const ready = (arm: Arm) => (arm.melee ? !arm.melee.busy : !!arm.shot?.loaded);
const kindOf = (holding: Holding | null) =>
  holding?.kind === 'weapon' ? holding.wielded.kind : holding?.kind === 'shooter' ? holding.shooter.kind : '';

/**
 * The fighting hands: one weapon, or a pair taking turns by DFO's flurry law (the lead opens, the other hand answers a
 * blow begun within the flurry's window), or two guns or crossbows each fired as it is loaded. Holds each hand's
 * machine, kick and guard, and answers what each hand shows.
 */
export class Hands {
  private readonly random: () => number;
  private plan: HandsPlan | null = null;
  private arms: Arm[] = [];
  private key = '';
  private last: Hand | null = null;
  private lastEnd = -Infinity;
  private clock = 0;
  private stride = 0;
  private readonly carry = new Carry();

  constructor(random: () => number = Math.random) {
    this.random = random;
  }

  /** Whether a blow or a shot is under way in either hand. */
  get busy(): boolean {
    return this.arms.some((arm) => (arm.melee ? arm.melee.busy : !arm.shot?.loaded));
  }

  /** Whether the hands are empty fists, at rest. */
  get bareAtRest(): boolean {
    return this.arms.every((arm) => kindOf(arm.holding) === 'fists' && !busy(arm)) && !this.plan?.held;
  }

  get swing(): Swing | null {
    const arm = this.arms.find((each) => each.hand === this.last) ?? (this.arms.length === 1 ? this.arms[0] : null);
    const progress = arm?.melee?.progress ?? arm?.shot?.progress ?? arm?.shot?.reloading ?? null;
    if (!arm || progress === null) return null;
    const reload = !!arm.shot && !arm.shot.firing;
    const lands = arm.melee?.lands ?? 1;
    return {
      direction: arm.melee?.striking ?? null,
      progress,
      lands,
      hand: arm.hand,
      paired: !!this.plan?.pair,
      reload,
    };
  }

  /** Holds every weapon at rest in a pose a fight asks for (a guard, a parry's deflect), or back at rest. */
  pose(shown: { readonly record: number; readonly frame: number } | null): void {
    for (const arm of this.arms) arm.melee?.pose(shown);
  }

  /** Ends every swing or draw under way at once, with no blow and no arrow: the fight's rules ended it. */
  cancel(): void {
    for (const arm of this.arms) {
      if (!arm.melee?.busy) continue;
      arm.melee.cancel();
      if (this.last === arm.hand) this.lastEnd = this.clock;
    }
  }

  /** Moves the hands on by `seconds` with this frame's button, holding as `plan` says (null: nothing in hand). A strike
   *  begun now keeps a fight's `pace`, as its rules time the swing. */
  update(
    seconds: number,
    input: AttackInput,
    plan: HandsPlan | null,
    motion: { running: boolean; stride: number },
    pace: Pace | null = null,
  ) {
    this.clock += seconds;
    this.stride = motion.stride;
    this.hold(plan);
    let events: HandsEvents = NOTHING;
    const note = (next: HandsEvents) => {
      if (next.hand) events = next;
    };
    if (this.arms.length === 1 && this.arms[0]) note(this.single(this.arms[0], seconds, input, pace));
    else if (this.plan?.volley) note(this.volley(seconds, input));
    else if (this.arms.length === 2) note(this.turns(seconds, input, pace));
    for (const arm of this.arms) {
      arm.rise = arm.recoil.step(seconds);
      const other = this.arms.find((each) => each !== arm);
      arm.guard = guardStep(arm.guard, !!other && busy(other) && !this.plan?.volley, seconds);
    }
    const guns = this.arms.length > 0 && this.arms.every((arm) => arm.shot && arm.holding.kind === 'shooter');
    const crossbows = this.arms.some((arm) => kindOf(arm.holding) === 'crossbow');
    // A pair of crossbows keeps its own frames at a run; one is carried as a gun is.
    const carries = guns && !(crossbows && this.plan?.pair);
    this.carry.step(seconds, carries && motion.running && this.arms.every((arm) => arm.shot?.loaded));
    return events;
  }

  private hold(plan: HandsPlan | null): void {
    const key = plan ? `${kindOf(plan.right)}|${kindOf(plan.left)}|${plan.pair}|${plan.volley}` : '';
    this.plan = plan;
    if (key === this.key) return;
    this.key = key;
    this.last = null;
    this.lastEnd = -Infinity;
    const hands: [Hand, Holding | null][] = plan
      ? [
          ['right', plan.right],
          ['left', plan.left],
        ]
      : [];
    this.arms = hands.flatMap(([hand, holding]) => (holding ? [this.armOf(hand, holding, plan)] : []));
  }

  private armOf(hand: Hand, holding: Holding, plan: HandsPlan | null): Arm {
    const besideBlade = !!plan?.pair && !plan.volley;
    const melee = holding.kind === 'weapon' ? new WeaponMachine(holding.wielded.kind, this.random) : null;
    const shot =
      holding.kind === 'shooter'
        ? new ShotMachine(SHOOTER_FEEL[holding.shooter.kind], besideBlade ? ONE_HANDED_RELOAD : 1)
        : null;
    return { hand, holding, melee, shot, recoil: new Recoil(), guard: 0, rise: 0 };
  }

  private fire(arm: Arm): boolean {
    if (!arm.shot?.fire()) return false;
    arm.recoil.punch(arm.shot.feel.kick);
    this.begun(arm.hand);
    return true;
  }

  private begun(hand: Hand): void {
    this.last = hand;
    const index = this.arms.findIndex((arm) => arm.hand === hand);
    const [arm] = index >= 0 ? this.arms.splice(index, 1) : [];
    if (arm) this.arms.push(arm);
  }

  /** Steps an arm with no button, noting when the last blow's frames end. */
  private advance(arm: Arm, seconds: number): HandsEvents {
    const was = busy(arm);
    const events = this.stepArm(arm, seconds, STILL);
    if (was && !busy(arm) && this.last === arm.hand) this.lastEnd = this.clock;
    return events;
  }

  private stepArm(
    arm: Arm,
    seconds: number,
    input: AttackInput,
    opening?: () => number,
    pace: Pace | null = null,
  ): HandsEvents {
    if (arm.melee) {
      const { blow, loose } = arm.melee.update(seconds, input, opening, pace);
      const hand = blow || loose ? arm.hand : null;
      return { blow: blow && { direction: blow.direction, hand: arm.hand }, loose, hand };
    }
    return arm.shot?.step(seconds) === 'hit' ? { blow: null, loose: true, hand: arm.hand } : NOTHING;
  }

  private single(arm: Arm, seconds: number, input: AttackInput, pace: Pace | null): HandsEvents {
    if (arm.melee) {
      const wasBusy = arm.melee.busy;
      const events = this.stepArm(arm, seconds, input, undefined, pace);
      if (!wasBusy && arm.melee.busy) this.last = arm.hand;
      return events;
    }
    const events = this.stepArm(arm, seconds, input);
    if (input.attackPressed || input.attackHeld) this.fire(arm);
    return events;
  }

  /** The seconds since the last blow's frames ended: none while they still play, the flurry's own case. */
  private get sinceLast(): number {
    const lastArm = this.arms.find((arm) => arm.hand === this.last);
    return lastArm && busy(lastArm) ? 0 : this.clock - this.lastEnd;
  }

  /** A pair takes turns: a blow or a shot at a time. A pull the law gives a gun still reloading falls to the blade. A
   *  press while a blow's follow-through still plays ends it and throws the next, as a lone weapon's strike starts
   *  again. */
  private turns(seconds: number, input: AttackInput, pace: Pace | null): HandsEvents {
    let events = NOTHING;
    for (const arm of [...this.arms]) {
      const next = this.advance(arm, seconds);
      if (next.hand) events = next;
    }
    const following = this.arms.find((arm) => arm.melee?.followingThrough);
    if (following && input.attackPressed && !this.arms.some((arm) => arm !== following && busy(arm))) {
      following.melee?.cancel();
      this.lastEnd = this.clock;
    }
    if (this.arms.some(busy) || !(input.attackPressed || input.attackHeld)) return events;
    const named = strikeHandOf(this.last, this.sinceLast);
    const namedArm = this.arms.find((arm) => arm.hand === named.hand);
    const arm =
      namedArm && ready(namedArm) ? namedArm : this.arms.find((each) => each.hand !== named.hand && ready(each));
    if (!arm) return events;
    const flurry = named.flurry && arm === namedArm;
    if (arm.shot) {
      this.fire(arm);
      return events;
    }
    this.begun(arm.hand);
    const opened = this.stepArm(arm, 0, PULL, () => (flurry ? FLURRY_FROM_FRAME : 0), pace);
    return opened.hand ? opened : events;
  }

  /** Two guns or crossbows each fire as they are loaded: a click pulls at once, the law naming the hand and the pull
   *  falling to the loaded one; held, it pulls again as each shot's frames end. */
  private volley(seconds: number, input: AttackInput): HandsEvents {
    let events = NOTHING;
    for (const arm of [...this.arms]) {
      const next = this.advance(arm, seconds);
      if (next.hand) events = next;
    }
    const pulls = input.attackPressed || (input.attackHeld && !this.arms.some(busy));
    if (!pulls) return events;
    const named = strikeHandOf(this.last, this.sinceLast).hand;
    const arm = [named, otherHand(named)]
      .map((hand) => this.arms.find((each) => each.hand === hand))
      .find((each) => each?.shot?.loaded);
    if (arm) this.fire(arm);
    return events;
  }

  /** Each hand as drawn this frame, the hand that struck last drawn over the other. */
  views(): HandView[] {
    const pair = !!this.plan?.pair;
    const bare = (arm: Arm) => kindOf(arm.holding) === 'fists';
    return this.arms.map((arm) => {
      const base = { hand: arm.hand, holding: arm.holding, lower: 0, dx: 0, dy: 0, pairArt: false };
      if (arm.shot) return { ...base, ...this.shotView(arm, pair) };
      const machine = arm.melee;
      const frame = machine?.frame ?? 0;
      if (!pair) {
        const record = machine?.record ?? 0;
        return { ...base, record, frame, flip: aloneFlip(arm.hand, arm.holding, record) };
      }
      const { record, mirror } = strikePicture(arm.hand, machine?.striking ?? null, bare(arm));
      if (!bare(arm)) return { ...base, record, frame, flip: mirror, lower: arm.guard * GUARD.lower, dx: -PAIR_APART };
      const resting = !machine?.busy;
      const tuck = fistGuard(arm.guard, arm.hand, this.clock, resting);
      return { ...base, record, frame, flip: mirror, dx: tuck.dx, dy: tuck.dy };
    });
  }

  private shotView(arm: Arm, pair: boolean): Omit<HandView, 'hand' | 'holding'> {
    const shot = arm.shot;
    const feel = shot?.feel;
    const carried = this.carry.carried && !!shot?.loaded;
    const turn = this.stride / (2 * STEP_M) - 0.25;
    const carryFrame = Math.min(CARRY_FRAMES - 1, Math.floor((((turn % 1) + 1) % 1) * CARRY_FRAMES));
    const dip = (feel?.dip ?? 0) * reloadDip(shot?.reloading ?? null);
    const guard = pair && !this.plan?.volley ? arm.guard * GUARD.lower : 0;
    return {
      record: carried ? 1 : 0,
      frame: carried ? carryFrame : (shot?.frame ?? 0),
      flip: arm.hand === 'left',
      lower: dip + guard,
      dx: 0,
      dy: this.carry.dip - arm.rise,
      pairArt: pair && kindOf(arm.holding) === 'crossbow',
    };
  }
}

/** Every picture a plan's fighting hands may show, to compose ahead of need: each record's frames as each hand draws
 *  them, a gun's carry, a flail's swing. */
export function everyView(plan: HandsPlan): HandView[] {
  const views: HandView[] = [];
  const add = (hand: Hand, holding: Holding, record: number, frames: number, flip: boolean, pairArt = false) => {
    for (let frame = 0; frame < frames; frame++)
      views.push({ hand, holding, record, frame, flip, lower: 0, dx: 0, dy: 0, pairArt });
  };
  const hands: [Hand, Holding | null][] = [
    ['right', plan.right],
    ['left', plan.left],
  ];
  for (const [hand, holding] of hands) {
    if (holding?.kind === 'shooter') {
      const { kind } = holding.shooter;
      add(hand, holding, 0, SHOOTER_FEEL[kind].frames, hand === 'left', plan.pair && kind === 'crossbow');
      if (kind !== 'crossbow' || !plan.pair) add(hand, holding, 1, CARRY_FRAMES, hand === 'left');
    }
    if (holding?.kind !== 'weapon') continue;
    if (holding.wielded.kind === 'bow') {
      add(hand, holding, 0, BOW_FRAMES, hand === 'left');
      continue;
    }
    for (const direction of [null, ...DIRECTIONS]) {
      const own = direction === null ? 0 : RECORD_OF[direction];
      const { record, mirror } = plan.pair
        ? strikePicture(hand, direction, holding.wielded.kind === 'fists')
        : { record: own, mirror: aloneFlip(hand, holding, own) };
      add(hand, holding, record, direction === null ? 1 : STRIKE_FRAMES, mirror);
    }
    if (holding.wielded.kind === 'flail')
      add(hand, holding, SWAY_RECORD, SWAY_FRAMES, plan.pair ? hand === 'left' : aloneFlip(hand, holding, SWAY_RECORD));
  }
  return views;
}
