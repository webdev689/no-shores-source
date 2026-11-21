// The prologue's teaching on the wreck, as the owner asked. The player wakes without their sword and shield, finds them
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

  /** The stage the teaching stands at. */
  get stage(): Stage {
    return STAGES[this.reached] ?? 'fight';
  }

  /** What the fight freezes on the boarder's blows to teach: a parry, then a dodge; none once both are learned. */
  get lesson(): 'parry' | 'dodge' | null {
    if (this.stage !== 'duel') return null;
    return !this.learned.has('parry') ? 'parry' : !this.learned.has('dodge') ? 'dodge' : null;
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
    this.learn(done);
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
      open: done.menu && this.stage === 'equip',
      equip: done.arms === 'worn',
      close: done.arms === 'worn' && !done.menu,
      move: !!this.from && Math.hypot(done.x - this.from[0], done.y - this.from[1]) >= MOVED_M,
      look: this.turned >= LOOKED_RAD,
      run: done.speed > RUNNING && done.action !== 'dodge',
      jump: done.rising,
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

/** How many ticks before a blow lands the fight freezes on it to teach a parry (inside the guard's 12-tick window,
 *  crates/combat/src/tuning.rs PARRY_WINDOW) and a dodge (inside its safe span). */
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

/** The fight frozen on a blow until the player answers it: each blow at most once, so the answer plays on. */
export class Freeze {
  private answered = false;

  /** Whether the fight stands frozen on `view`'s blow for `lesson`: a blow a parry can meet (no iron blow nor shot,
   *  and only while `parryOpen`, a press of the guard able to open a window) or any for a dodge, near enough to land. */
  holds(view: FighterView | null, player: number, lesson: 'parry' | 'dodge' | null, parryOpen: boolean): boolean {
    const left = view ? ticksToLand(view, player) : null;
    if (left === null || left <= 0 || !view) {
      this.answered = false;
      return false;
    }
    if (this.answered || !lesson || left < LEAST_TICKS) return false;
    const { action } = view;
    if (lesson === 'dodge') return left <= DODGE_AT;
    const unparried = action.kind === 'telegraph' && (action.iron || action.shape === 'aimed');
    return parryOpen && !unparried && left <= PARRY_AT;
  }

  /** The player answered: the blow plays on, never frozen again. */
  answer(): void {
    this.answered = true;
  }
}
