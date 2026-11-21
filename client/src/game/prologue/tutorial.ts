// The prologue's teaching on the wreck. The player wakes without their sword and shield, finds them
// on the deck and equips them from the Character page; finds their feet (move, look round, run, jump), then readies
// themselves (swing, guard, drink a healing charge); then meets a Tithe boarder one on one, whose first blow the fight
// freezes on until they parry and whose next until they dodge. Each step is ticked once it is done, read from what
// their body and their fight did, and steps done early stay done. The wreck's waves wait until the boarder falls.
import { RUNNING } from '../../player/others.ts';
import type { FighterView } from '../../rules/fighters.ts';
import type { Quest, Step } from '../tasks.ts';

/** The quest the prologue's tasks stand under. */
export const QUEST = 'Prologue';

/** How far the player walks, metres, and how far they turn the view, radians, before each counts as learned. */
const MOVED_M = 2;
const LOOKED_RAD = 1;
/** How long a task stays up once all of it is met, seconds, so its last step is seen ticked. */
const MET_HOLD_S = 1.5;
/** Once both the parry and the dodge are made, a short reminder of both, for this long, seconds. */
export const REMINDER = 'F parries a blow as it lands; V dodges it';
const REMIND_S = 6;

/** Where the player's sword and shield are: on the deck, in their pack, or worn. */
export type Arms = 'lying' | 'carried' | 'worn';
/** The boarder met one on one: not yet come, standing, or fallen. */
export type Boarder = 'none' | 'standing' | 'fallen';

/** What the player did this frame, as the teaching reads it: the frame's length, where they stand and look, their
 *  pace across the deck and whether they rise in a jump, what their fight is doing, where their arms are, whether the
 *  menu is open, whether they drank, parried or dodged, the boarder, the hostile foes alive, and the boss fight. */
export interface Done {
  readonly seconds: number;
  readonly x: number;
  readonly y: number;
  readonly yaw: number;
  readonly speed: number;
  readonly rising: boolean;
  readonly action: string | undefined;
  readonly arms: Arms;
  readonly menu: boolean;
  readonly healed: boolean;
  readonly parried: boolean;
  readonly dodged: boolean;
  readonly boarder: Boarder;
  readonly foes: number;
  readonly boss: boolean;
}

/** The teaching's stages in order; the boss fight's task stands over any of them. */
export const STAGES = ['find', 'equip', 'feet', 'ready', 'duel', 'fight'] as const;
export type Stage = (typeof STAGES)[number];

/** Every step taught, each with its words and keys, as foot's keys name them (hints.ts). */
const STEPS = {
  take: { text: 'Take them up' },
  open: { text: 'Open your Character page', keys: ['I'] },
  equip: { text: 'Equip them from the Melee slot' },
  close: { text: 'Close it', keys: ['Esc'] },
  move: { text: 'Move', keys: ['W', 'A', 'S', 'D'] },
  look: { text: 'Look round', keys: ['Mouse'] },
  run: { text: 'Run', keys: ['Shift'] },
  jump: { text: 'Jump', keys: ['Space'] },
  swing: { text: 'Swing', keys: ['Right button'] },
  guard: { text: 'Guard', keys: ['Left button', 'F'] },
  drink: { text: 'Drink a healing charge', keys: ['3'] },
  parry: { text: 'Parry a blow', keys: ['F'] },
  dodge: { text: 'Dodge a blow', keys: ['V'] },
  fell: { text: 'Bring the boarder down' },
} as const satisfies Record<string, Step>;
type Learned = keyof typeof STEPS;

/** Each stage's task and its steps. */
const TASKS: Readonly<Record<Exclude<Stage, 'fight'>, { readonly task: string; readonly steps: readonly Learned[] }>> =
  {
    find: { task: 'Find your sword and shield', steps: ['take'] },
    equip: { task: 'Equip your sword and shield', steps: ['open', 'equip', 'close'] },
    feet: { task: 'Find your feet', steps: ['move', 'look', 'run', 'jump'] },
    ready: { task: 'Ready yourself', steps: ['swing', 'guard', 'drink'] },
    duel: { task: 'Face the Tithe boarder', steps: ['parry', 'dodge', 'fell'] },
  };
const GUARDS = new Set(['guard', 'parry']);

export class Tutorial {
  private from: readonly [number, number] | null = null;
  private lastYaw: number | null = null;
  private turned = 0;
  private readonly learned = new Set<Learned>();
  private metFor = 0;
  private reached = 0;
  private remindFor = 0;

  /** The stage the teaching stands at. */
  get stage(): Stage {
    return STAGES[this.reached] ?? 'fight';
  }

  /** What the fight freezes on the boarder's blows to teach: a parry, then a dodge; none once both are learned. */
  get lesson(): 'parry' | 'dodge' | null {
    if (this.stage !== 'duel') return null;
    return !this.learned.has('parry') ? 'parry' : !this.learned.has('dodge') ? 'dodge' : null;
  }

  /** The reminder to show now, for a while once both lessons are learned, whichever came last; else none. */
  get reminder(): string | null {
    return this.remindFor > 0 ? REMINDER : null;
  }

  /** Whether a boarder should stand now: as the duel begins, and again should one fall before both lessons are
   *  learned. */
  wantsBoarder(boarder: Boarder): boolean {
    return this.stage === 'duel' && boarder !== 'standing' && this.lesson !== null;
  }

  /** Whether the wreck's waves wait: until the duel is won. */
  get holding(): boolean {
    return this.reached < STAGES.indexOf('fight');
  }

  /** The tasks as they stand after `done`. */
  frame(done: Done): Quest {
    const lesson = this.lesson;
    this.learn(done);
    this.remindFor = lesson !== null && this.lesson === null ? REMIND_S : Math.max(0, this.remindFor - done.seconds);
    if (done.boss) return { name: QUEST, task: 'Face Captain Brannoc Thule', steps: [] };
    const stage = this.stage;
    if (stage === 'fight') {
      const steps: Step[] = done.foes > 0 ? [{ text: 'Foes standing', count: done.foes }] : [];
      return { name: QUEST, task: 'Fight your way through the wreck', steps };
    }
    const { task, steps } = TASKS[stage];
    const met = steps.every((step) => this.learned.has(step));
    this.metFor = met ? this.metFor + done.seconds : 0;
    const shown = { name: QUEST, task, steps: steps.map((step) => ({ ...STEPS[step], done: this.learned.has(step) })) };
    if (this.metFor >= MET_HOLD_S) [this.reached, this.metFor] = [this.reached + 1, 0];
    return shown;
  }

  /** Ticks off whatever `done` shows learned. Lying dead the player is raised at a checkpoint: their walk and their
   *  turn are counted again from where they rise. */
  private learn(done: Done): void {
    const dead = done.action === 'dead';
    this.from = dead ? null : (this.from ?? [done.x, done.y]);
    if (this.lastYaw !== null && !dead)
      this.turned += Math.abs(Math.atan2(Math.sin(done.yaw - this.lastYaw), Math.cos(done.yaw - this.lastYaw)));
    this.lastYaw = dead ? null : done.yaw;
    const now: Record<Learned, boolean> = {
      take: done.arms !== 'lying',
      open: done.menu && done.arms !== 'lying',
      equip: done.arms === 'worn',
      close: done.arms === 'worn' && !done.menu,
      move: !!this.from && Math.hypot(done.x - this.from[0], done.y - this.from[1]) >= MOVED_M,
      look: this.turned >= LOOKED_RAD,
      run: done.speed > RUNNING && done.action !== 'dodge',
      jump: done.rising && done.action !== 'dodge',
      swing: done.action === 'attack',
      guard: GUARDS.has(done.action ?? ''),
      drink: done.healed,
      parry: done.parried && this.stage === 'duel',
      dodge: done.dodged && this.stage === 'duel',
      fell: done.boarder === 'fallen' && this.lesson === null,
    };
    for (const [step, met] of Object.entries(now) as [Learned, boolean][]) if (met) this.learned.add(step);
  }
}

/** How many ticks at most before a blow lands the fight freezes on it to teach a parry (inside the window a press of
 *  the guard opens, crates/combat/src/tuning.rs PARRY_WINDOW) and a dodge (inside its safe span). */
export const PARRY_AT = 8;
export const DODGE_AT = 10;
/** With fewer ticks than this left a press could not reach the room in time, and the blow passes unfrozen. */
const LEAST_TICKS = 2;

/** How many ticks until a blow `view` winds up at the player lands: a swing's, or a telegraphed blow's that is no
 *  feint; null for none. */
export function ticksToLand(view: FighterView, player: number): number | null {
  if (view.target !== player) return null;
  const { action } = view;
  if (action.kind === 'attack') return action.strike - action.elapsed;
  if (action.kind === 'telegraph' && action.feintAt === null) return action.windup - action.elapsed;
  return null;
}

/** What the player pressed this frame, as the frozen fight hears it: whether the pointer is the game's, and whether
 *  the guard or the dodge was pressed. */
export interface Answer {
  readonly locked: boolean;
  readonly guard: boolean;
  readonly dodge: boolean;
}

/** What the fight freezes for: the player's number and their fighter as last seen, the lesson, and whether a press
 *  of the guard could open a parry now. */
export interface Teaching {
  readonly player: number;
  readonly own: FighterView | null;
  readonly lesson: 'parry' | 'dodge' | null;
  readonly parryOpen: boolean;
}

/** How far to either side of where the player aims a blow can come from and still be parried: a blade's guard
 *  (crates/combat/src/tuning.rs GUARD_ARC), the narrower of a blade's and a shield's. */
const FACING_RAD = (60 * Math.PI) / 180;
/** What the player may be doing as the fight freezes, for a press then to answer it at once. */
const ANSWERABLE = new Set(['idle', 'guard']);

/** Whether a press now would meet `foe`'s blow for `lesson`: the player standing on their feet, alive, doing nothing
 *  a press must wait out; for a dodge with stamina for it, and for a parry aimed at the blow, as the rules judge a
 *  guard (crates/combat/src/judge.rs), whichever way the body stands. */
export function answerable(teaching: Teaching, foe: FighterView): boolean {
  const { own, lesson } = teaching;
  if (!own || !ANSWERABLE.has(own.action.kind) || own.mode !== 'ground' || own.health <= 0) return false;
  if (lesson === 'dodge') return own.stamina > 0;
  const toward = Math.atan2(foe.x - own.x, -(foe.y - own.y));
  return Math.abs(Math.atan2(Math.sin(toward - own.aim), Math.cos(toward - own.aim))) <= FACING_RAD;
}

/** The fight frozen on a blow until the player answers it: each blow at most once, so the answer plays on. */
export class Freeze {
  private answered = false;

  /** Whether the fight stands frozen this frame on `view`'s blow (`holds`) until `answer`, read only then, gives the
   *  lesson's press with the pointer the game's: then the blow plays on, the press the fight's own. */
  frame(view: FighterView | null, teaching: Teaching, answer: () => Answer): boolean {
    if (!this.holds(view, teaching)) return false;
    const { locked, guard, dodge } = answer();
    if (!locked || !(teaching.lesson === 'parry' ? guard : dodge)) return true;
    this.answered = true;
    return false;
  }

  /** Whether the fight stands frozen on `view`'s blow for the lesson: near enough to land, the player able to answer
   *  it (`answerable`), and for a parry a blow one can meet (no iron blow nor shot) while a press of the guard can
   *  open a window. A blow that cannot be answered passes, and the lesson waits for the next. */
  holds(view: FighterView | null, teaching: Teaching): boolean {
    const { player, lesson, parryOpen } = teaching;
    const left = view ? ticksToLand(view, player) : null;
    if (left === null || left <= 0 || !view) {
      this.answered = false;
      return false;
    }
    if (this.answered || !lesson || left < LEAST_TICKS || !answerable(teaching, view)) return false;
    const { action } = view;
    if (lesson === 'dodge') return left <= DODGE_AT;
    const unparried = action.kind === 'telegraph' && (action.iron || action.shape === 'aimed');
    return parryOpen && !unparried && left <= PARRY_AT;
  }
}
