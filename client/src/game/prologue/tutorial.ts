// The prologue's teaching on the wreck. The player wakes without their sword and shield, finds them
// on the deck and equips them from the Character page; finds their feet (move, look round, run, jump), then readies
// themselves (swing, guard, drink a healing charge); then meets a Tithe boarder one on one, whose first blow the fight
// freezes on until they parry and whose next until they dodge. The boarder drops a bow, which they take up, equip,
// draw, loose and put away; a wisp gives them the Storm, and the next fight teaches each of its abilities. Each step
// is ticked once it is done, read from what their body and their fight did, and steps done early stay done. The
// wreck's waves wait until the Storm is given.
import { EVENT } from '../../combat/cues.ts';
import type { FightEvent } from '../../network/messages.ts';
import type { BindId } from '../../player/binds.ts';
import { BINDS } from '../../player/input.ts';
import { RUNNING } from '../../player/others.ts';
import type { FighterView } from '../../rules/fighters.ts';
import { askedKey } from '../controls.ts';
import { keysOf } from '../hints.ts';
import type { Quest, Step } from '../tasks.ts';

/** The quest the prologue's tasks stand under. */
export const QUEST = 'Prologue';

/** How far the player walks, metres, and how far they turn the view, radians, before each counts as learned. */
const MOVED_M = 2;
const LOOKED_RAD = 1;
/** How long a task stays up once all of it is met, seconds, so its last step is seen ticked. */
const MET_HOLD_S = 1.5;
/** Once both the parry and the dodge are made, a short reminder of both, for this long, seconds, naming their keys
 *  as bound now on the keys or the pad. */
export const reminder = (): string => `${askedKey('guard')} parries a blow as it lands; ${askedKey('dodge')} dodges it`;
const REMIND_S = 6;
/** Once each of the Storm's abilities is first cast, how long the fight runs on before the next is asked, seconds
 *  counted while a foe stands to try it on: long enough for Quicken's Haste (6 s) to run out twice. Cast again, the
 *  next is asked once its moment has played out, this long after (Tempest's orbs live 4 s). */
export const STORM_PAUSE_S = 12;
export const AGAIN_PAUSE_S = 6;

/** Where the player's sword and shield are: on the deck, in their pack, or worn. */
export type Arms = 'lying' | 'carried' | 'worn';
/** The boarder met one on one: not yet come, standing, or fallen. */
export type Boarder = 'none' | 'standing' | 'fallen';
/** Where the boarder's bow is: not yet dropped, or as the arms are. */
export type Bow = 'none' | Arms;
/** The Storm's abilities as the teaching names them: its Second Tenet, its First, and its Anima. */
export type Spell = 'arcLash' | 'quicken' | 'tempest';
export const SPELLS: readonly Spell[] = ['arcLash', 'quicken', 'tempest'];

/** What the player did this frame, as the teaching reads it: the frame's length, where they stand and look, their
 *  pace across the deck and whether they rise in a jump, what their fight is doing, where their arms are, whether the
 *  menu is open, whether they drank, parried or dodged, the boarder, the hostile foes alive, the boss fight, where
 *  the bow is, whether it is drawn and an arrow left it, whether the Storm is given, and the spells cast. */
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
  readonly bow: Bow;
  readonly ranged: boolean;
  readonly loosed: boolean;
  readonly storm: boolean;
  readonly cast: readonly Spell[];
}

/** The teaching's stages in order; the boss fight's task stands over any of them. */
export const STAGES = ['find', 'equip', 'feet', 'ready', 'duel', 'bow', 'wisp', 'storm', 'fight'] as const;
export type Stage = (typeof STAGES)[number];

/** Every step taught, each with its words and what does it: the controls it names (as the key strip names them,
 *  `hints.ts`), every key of each shown, or the one key the frozen fight asks for. */
interface Taught {
  readonly text: string;
  readonly keys?: string;
  readonly asks?: BindId;
}
const STEPS = {
  take: { text: 'Take them up' },
  open: { text: 'Open your Character page', keys: 'character' },
  equip: { text: 'Equip them from the Melee slot' },
  close: { text: 'Close it', keys: 'Esc' },
  move: { text: 'Move', keys: 'forward / left / back / right' },
  look: { text: 'Look round', keys: 'Mouse|turnLeft / Mouse|turnRight / Mouse|lookUp / Mouse|lookDown' },
  run: { text: 'Run', keys: 'run' },
  jump: { text: 'Jump', keys: 'jump' },
  swing: { text: 'Swing', keys: 'swing' },
  guard: { text: 'Guard', keys: 'guard' },
  drink: { text: 'Drink a healing charge', keys: 'heal' },
  parry: { text: 'Parry a blow', asks: 'guard' },
  dodge: { text: 'Dodge a blow', asks: 'dodge' },
  fell: { text: 'Bring the boarder down' },
  takeBow: { text: 'Take up the bow' },
  equipBow: { text: 'Equip it', keys: 'character' },
  draw: { text: 'Switch to the bow', keys: 'ranged' },
  loose: { text: 'Loose an arrow', keys: 'guard|swing' },
  sheathe: { text: 'Back to your sword', keys: 'melee' },
  arcLash: { text: 'Cast Arc Lash', keys: 'tenetTwo' },
  quicken: { text: 'Cast Quicken', keys: 'tenetOne' },
  tempest: { text: 'Release Tempest', keys: 'anima' },
} as const satisfies Record<string, Taught>;
type Learned = keyof typeof STEPS;

/** Step `learned` as the tracker shows it, its keys as bound now on the keys or the pad played last. */
function stepOf(learned: Learned, done: boolean): Step {
  const { text, keys, asks }: Taught = STEPS[learned];
  const shown = asks ? [askedKey(asks, true)] : keys ? keysOf(keys, BINDS.device, BINDS.now, true) : [];
  return { text, ...(shown.length > 0 && { keys: shown.filter(Boolean) }), done };
}

/** Each stage's task and its steps. */
const TASKS: Readonly<
  Record<Exclude<Stage, 'wisp' | 'fight'>, { readonly task: string; readonly steps: readonly Learned[] }>
> = {
  find: { task: 'Find your sword and shield', steps: ['take'] },
  equip: { task: 'Equip your sword and shield', steps: ['open', 'equip', 'close'] },
  feet: { task: 'Find your feet', steps: ['move', 'look', 'run', 'jump'] },
  ready: { task: 'Ready yourself', steps: ['swing', 'guard', 'drink'] },
  duel: { task: 'Face the Tithe boarder', steps: ['parry', 'dodge', 'fell'] },
  bow: { task: 'Arm yourself with the bow', steps: ['takeBow', 'equipBow', 'draw', 'loose', 'sheathe'] },
  storm: { task: 'Call the Storm', steps: SPELLS },
};
const GUARDS = new Set(['guard', 'parry']);

export class Tutorial {
  private from: readonly [number, number] | null = null;
  private lastYaw: number | null = null;
  private turned = 0;
  private readonly learned = new Set<Learned>();
  private metFor = 0;
  private reached: number;
  private remindFor = 0;
  /** The Storm's ability last first cast and the fight's seconds left before the next is asked; none between. */
  private pause: { readonly spell: Spell; left: number } | null = null;
  /** Whether an ability was first cast since the room last charged the Storm again. */
  private charge = false;

  /** A teaching begun at `from`, every stage before it passed over: a page under development pictures one so. */
  constructor(from: Stage = 'find') {
    this.reached = STAGES.indexOf(from);
  }

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
    return this.remindFor > 0 ? reminder() : null;
  }

  /** The Storm's ability the next fight freezes on to teach, in turn; none once each is cast. */
  get spell(): Spell | null {
    if (this.stage !== 'storm' || this.pause) return null;
    return SPELLS.find((spell) => !this.learned.has(spell)) ?? null;
  }

  /** Whether the room should charge the Storm again now, once after each of its abilities is first cast, so the
   *  player can cast it again while the fight runs on; asked, it is answered once. */
  chargeAgain(): boolean {
    const charge = this.charge;
    this.charge = false;
    return charge;
  }

  /** Whether the boarder that fell drops the bow: it fell once both lessons were learned. */
  get bowDrops(): boolean {
    return this.learned.has('fell');
  }

  /** Whether the wisp comes now: once the bow is taught, until the Storm is given. */
  get wantsWisp(): boolean {
    return this.stage === 'wisp';
  }

  /** Whether a boarder should stand now: as the duel begins, and again should one fall before both lessons are
   *  learned. */
  wantsBoarder(boarder: Boarder): boolean {
    return this.stage === 'duel' && boarder !== 'standing' && this.lesson !== null;
  }

  /** Whether the wreck's waves wait: until the Storm is given. */
  get holding(): boolean {
    return this.reached < STAGES.indexOf('storm');
  }

  /** The tasks as they stand after `done`. */
  frame(done: Done): Quest {
    const lesson = this.lesson;
    this.paced(done);
    this.learn(done);
    this.remindFor = lesson !== null && this.lesson === null ? REMIND_S : Math.max(0, this.remindFor - done.seconds);
    if (done.boss) return { name: QUEST, task: 'Face Captain Brannoc Thule', steps: [] };
    const stage = this.stage;
    if (stage === 'wisp' && done.storm) this.reached += 1;
    if (stage === 'fight' || stage === 'wisp') {
      const steps: Step[] = done.foes > 0 ? [{ text: 'Foes standing', count: done.foes }] : [];
      return { name: QUEST, task: 'Fight your way through the wreck', steps };
    }
    const { task, steps } = TASKS[stage];
    const met = steps.every((step) => this.learned.has(step));
    this.metFor = met ? this.metFor + done.seconds : 0;
    const shown = { name: QUEST, task, steps: steps.map((step) => stepOf(step, this.learned.has(step))) };
    if (this.metFor >= MET_HOLD_S) [this.reached, this.metFor] = [this.reached + 1, 0];
    return shown;
  }

  /** The Storm's lesson paced: an ability first cast holds the next a while, which a second cast of it shortens, and
   *  which runs only while foes stand. */
  private paced(done: Done): void {
    if (this.pause && done.foes > 0) this.pause.left -= done.seconds;
    if (this.pause && done.cast.includes(this.pause.spell)) this.pause.left = Math.min(this.pause.left, AGAIN_PAUSE_S);
    if (this.pause && this.pause.left <= 0) this.pause = null;
    const first =
      this.stage === 'storm' && SPELLS.find((spell) => done.cast.includes(spell) && !this.learned.has(spell));
    if (!first) return;
    this.pause = { spell: first, left: STORM_PAUSE_S };
    this.charge = true;
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
      takeBow: done.bow === 'carried' || done.bow === 'worn',
      equipBow: done.bow === 'worn',
      draw: done.bow === 'worn' && done.ranged,
      loose: this.learned.has('draw') && done.loosed,
      sheathe: this.learned.has('loose') && !done.ranged,
      arcLash: done.cast.includes('arcLash'),
      quicken: done.cast.includes('quicken'),
      tempest: done.cast.includes('tempest'),
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

/** What the room says of a blow that found the player: it hit them, their guard took it or broke under it, or they
 *  parried it. */
const FOUND: ReadonlySet<number> = new Set([EVENT.hit, EVENT.blocked, EVENT.guardBroken, EVENT.parried]);
/** How long after a dodged blow lands the teaching waits for word of it finding the player, seconds: past the room's
 *  judging of it as the player saw it (crates/room/src/players.rs VIEW_LAG, 24 ticks) and the word's way back. */
const STRUCK_WAIT_S = 0.6;
/** A blow last seen this many ticks or fewer from landing, gone from view, is taken to have landed. */
const LANDING_TICKS = 6;

/** A dodge that got the player clear of a blow, however: the room's word that a blow passed through it (perfect or
 *  not), or the player seen dodging while the boarder's blow wound up at them and no word of it finding them once it
 *  landed, as when the hop carried them out of its reach, which the room tells nothing of. */
export class DodgeWatch {
  /** Whether the player was seen dodging as the blow now winding up at them came, and its ticks left as last seen. */
  private dodging = false;
  private left: number | null = null;
  /** Seconds since the dodged blow landed, while word of it finding the player is waited for; null while none is. */
  private landed: number | null = null;
  /** Whether word came of a blow finding the player since the one watched began. */
  private found = false;

  /** Whether a dodge got the player clear of a blow this frame: `view` the boarder as the room last showed it (null
   *  once it has fallen), `own` the player's fighter, `events` the room's words this frame. */
  frame(
    view: FighterView | null,
    own: FighterView | null,
    player: number,
    events: readonly FightEvent[],
    seconds: number,
  ): boolean {
    const onPlayer = events.filter((event) => event.defender === player);
    if (onPlayer.some((event) => event.kind === EVENT.dodged || event.kind === EVENT.perfect)) {
      [this.dodging, this.left, this.landed] = [false, null, null];
      return true;
    }
    const left = view ? ticksToLand(view, player) : null;
    const winding = left !== null && left > 0;
    if (winding && this.left === null && this.landed === null) this.found = false;
    if (onPlayer.some((event) => FOUND.has(event.kind))) this.found = true;
    // A blow seen about to land that has now landed (or that struck past its tick): not one cut short far off, nor
    // one whose boarder fell.
    const landing = !!view && !winding && this.left !== null && (left !== null || this.left <= LANDING_TICKS);
    if (landing && this.dodging) this.landed = 0;
    if (!view || landing) this.dodging = false;
    if (winding && own?.action.kind === 'dodge') this.dodging = true;
    this.left = winding ? left : null;
    if (this.landed === null) return false;
    this.landed += seconds;
    if (this.landed < STRUCK_WAIT_S) return false;
    this.landed = null;
    return !this.found;
  }
}
