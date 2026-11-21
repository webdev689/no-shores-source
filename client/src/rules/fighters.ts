import { BODY_FLOATS, CONTROLS_FLOATS, type Mode } from './movementRules.ts';

/** The combat crate's strokes 1 to 6, as the way each swing goes. */
export const STROKE_DIRECTIONS = ['down', 'downLeft', 'left', 'right', 'downRight', 'up'] as const;
export type StrokeDirection = (typeof STROKE_DIRECTIONS)[number];
/** The way stroke `stroke` (1 to 6) goes; an overhead for any other. */
export const directionOf = (stroke: number): StrokeDirection => STROKE_DIRECTIONS[stroke - 1] ?? 'down';
/** A foe's telegraphed blow's shapes, by the combat crate's numbers 1 to 7. */
export const SHAPES = ['lunge', 'sweep', 'slam', 'ring', 'charge', 'leap', 'aimed'] as const;
export type Shape = (typeof SHAPES)[number];
const MODES: readonly Mode[] = ['ground', 'air', 'hang', 'climb', 'mantle', 'vault'];
const CAUSES = ['poise', 'parried', 'guardBroken', 'charged'] as const;
const SWINGS = ['plain', 'riposte', 'counter'] as const;

/** What a fighter is doing, as the combat crate's actions; every timer in ticks. */
export type Action =
  | { readonly kind: 'idle' }
  | {
      readonly kind: 'attack';
      readonly stroke: number;
      readonly elapsed: number;
      readonly strike: number;
      readonly end: number;
      readonly swing: (typeof SWINGS)[number];
      readonly leftHand: boolean;
    }
  | { readonly kind: 'guard'; readonly elapsed: number; readonly window: number }
  | { readonly kind: 'parry'; readonly elapsed: number }
  | { readonly kind: 'dodge'; readonly elapsed: number; readonly toward: readonly [number, number] }
  | { readonly kind: 'flinch'; readonly left: number }
  | { readonly kind: 'staggered'; readonly left: number; readonly cause: (typeof CAUSES)[number] }
  | { readonly kind: 'down'; readonly left: number }
  | {
      readonly kind: 'telegraph';
      readonly shape: Shape;
      readonly elapsed: number;
      readonly windup: number;
      readonly origin: readonly [number, number, number];
      readonly bearing: number;
      readonly ahead: number;
      readonly iron: boolean;
      readonly feintAt: number | null;
    }
  | { readonly kind: 'overreach'; readonly left: number }
  | { readonly kind: 'draw'; readonly elapsed: number }
  | { readonly kind: 'reload'; readonly left: number }
  | { readonly kind: 'drink'; readonly elapsed: number }
  | { readonly kind: 'dead'; readonly elapsed: number };

/** A fighter as a browser draws and marks it. */
export interface FighterView {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly facing: number;
  readonly mode: Mode;
  readonly crouched: boolean;
  readonly aim: number;
  readonly side: 'players' | 'foes';
  readonly arms: number;
  readonly health: number;
  readonly healthMax: number;
  readonly stamina: number;
  readonly poise: number;
  readonly poiseMax: number;
  readonly target: number | null;
  readonly action: Action;
  /** Its statuses, read from a whole fighter's numbers; a glance carries none. */
  readonly statuses?: Statuses;
  /** The shots its Ranged weapon has left, read from a whole fighter's numbers; null for none counted (a foe's). */
  readonly ammo?: number | null;
  /** The healing charges it holds and how far its meter has filled the next, 0 to 1, read from a whole fighter's
   *  numbers. */
  readonly charges?: number;
  readonly meter?: number;
}

/** The statuses, in the combat crate's order (crates/combat/src/status.rs). */
export const STATUSES = ['crit', 'expose', 'charge', 'haste', 'linked', 'veiled'] as const;
export type StatusName = (typeof STATUSES)[number];
/** The ticks each status has left (0 for none), and the ticks left of the immunity a Charge leaves after it. */
export type Statuses = Readonly<Record<StatusName, number>> & { readonly chargeImmune: number };

/** The combat crate's layouts: a fighter's numbers after its body's, a glance's, and an action's numbers. */
const COMBAT_AT = BODY_FLOATS;
const ACTION_NUMBERS = 10;
export const GLANCE_FLOATS = 17 + ACTION_NUMBERS;
/** A whole fighter: its body, the fight's numbers, its action's, the shots its Ranged weapon has left (+ 1, 0 for none
 *  counted), its drinks (the healing charges in the low two bits, the drink's press kept and held above them) and the
 *  meter toward the next charge, its statuses (each one's ticks, a Charge's immunity, each one's giver), then its
 *  gear's trim (combat's TRIM_FLOATS). */
export const TRIM_FLOATS = 29;
const AMMO_AT = BODY_FLOATS + 24 + ACTION_NUMBERS;
export const DRINKS_AT = AMMO_AT + 1;
const METER_AT = AMMO_AT + 2;
const STATUSES_AT = AMMO_AT + 3;
export const STATUS_FLOATS = 2 * STATUSES.length + 1;
export const FIGHTER_FLOATS = STATUSES_AT + STATUS_FLOATS + TRIM_FLOATS;
/** An intent: the controls, then the stroke held, guard, dodge, shoot, pitch, aim, the aim's mark (x, y, z) and a
 *  drink asked (`fighting.ts` writes them). */
export const INTENT_FLOATS = CONTROLS_FLOATS + 10;
/** A fighter as a snapshot carries it: all but its trim, which only its own player has, in their gear. */
export const UNTRIMMED_FLOATS = FIGHTER_FLOATS - TRIM_FLOATS;
/** The trim of a fighter whose gear trims nothing (combat's `Trim::PLAIN`): every factor 1, nothing given back. */
export const PLAIN_TRIM: readonly number[] = [...Array<number>(25).fill(1), 0, 0, 0, 0];

/** A whole fighter from a snapshot's, its trim put back. */
export function trimmed(untrimmed: ArrayLike<number>, trim: readonly number[] | null | undefined): Float64Array {
  const whole = new Float64Array(FIGHTER_FLOATS);
  whole.set(Array.from(untrimmed).slice(0, UNTRIMMED_FLOATS));
  whole.set(trim?.length === TRIM_FLOATS ? trim : PLAIN_TRIM, UNTRIMMED_FLOATS);
  return whole;
}

function actionOf(kind: number, numbers: ArrayLike<number>): Action {
  const valueAt = (index: number) => numbers[index] ?? 0;
  switch (kind) {
    case 1:
      return {
        kind: 'attack',
        stroke: valueAt(0),
        elapsed: valueAt(1),
        strike: valueAt(2),
        end: valueAt(3),
        swing: SWINGS[valueAt(4)] ?? 'plain',
        leftHand: valueAt(6) !== 0,
      };
    case 2:
      return { kind: 'guard', elapsed: valueAt(0), window: valueAt(1) };
    case 3:
      return { kind: 'parry', elapsed: valueAt(0) };
    case 4:
      return { kind: 'dodge', elapsed: valueAt(0), toward: [valueAt(1), valueAt(2)] };
    case 5:
      return { kind: 'flinch', left: valueAt(0) };
    case 6:
      return { kind: 'staggered', left: valueAt(0), cause: CAUSES[valueAt(1)] ?? 'poise' };
    case 7:
      return { kind: 'down', left: valueAt(0) };
    case 8: {
      const shape = SHAPES[valueAt(0) - 1];
      if (!shape) return { kind: 'idle' };
      return {
        kind: 'telegraph',
        shape,
        elapsed: valueAt(1),
        windup: valueAt(2),
        origin: [valueAt(3), valueAt(4), valueAt(5)],
        bearing: valueAt(6),
        ahead: valueAt(7),
        iron: valueAt(8) !== 0,
        feintAt: valueAt(9) === 0 ? null : valueAt(9) - 1,
      };
    }
    case 9:
      return { kind: 'overreach', left: valueAt(0) };
    case 10:
      return { kind: 'draw', elapsed: valueAt(0) };
    case 11:
      return { kind: 'reload', left: valueAt(0) };
    case 12:
      return { kind: 'dead', elapsed: valueAt(0) };
    case 13:
      return { kind: 'drink', elapsed: valueAt(0) };
    default:
      return { kind: 'idle' };
  }
}

/** A glance's numbers from a fighter's whole numbers, as the combat crate takes one. */
export function glanceFrom(fighter: ArrayLike<number>): Float64Array {
  const valueAt = (index: number) => fighter[index] ?? 0;
  const combat = (index: number) => valueAt(COMBAT_AT + index);
  const glance = new Float64Array(GLANCE_FLOATS);
  glance.set([
    valueAt(0),
    valueAt(1),
    valueAt(2),
    valueAt(6),
    valueAt(7),
    valueAt(8),
    combat(11),
    combat(0),
    combat(1),
    combat(2),
  ]);
  glance.set([combat(3), combat(4), combat(5), combat(7), combat(8), combat(12), combat(23)], 10);
  for (let index = 0; index < ACTION_NUMBERS; index += 1) glance[17 + index] = combat(24 + index);
  return glance;
}

/** What a glance's numbers say. */
export function glanceView(glance: ArrayLike<number>): FighterView {
  const valueAt = (index: number) => glance[index] ?? 0;
  return {
    x: valueAt(0),
    y: valueAt(1),
    z: valueAt(2),
    facing: valueAt(3),
    mode: MODES[valueAt(4)] ?? 'ground',
    crouched: valueAt(5) !== 0,
    aim: valueAt(6),
    side: valueAt(7) === 0 ? 'players' : 'foes',
    arms: valueAt(8),
    health: valueAt(10),
    healthMax: valueAt(11),
    stamina: valueAt(12),
    poise: valueAt(13),
    poiseMax: valueAt(14),
    target: valueAt(15) === 0 ? null : valueAt(15) - 1,
    action: actionOf(
      valueAt(16),
      Array.from({ length: ACTION_NUMBERS }, (unused, index) => valueAt(17 + index)),
    ),
  };
}

/** The statuses a fighter's whole numbers (or a snapshot's, without its trim) hold. */
export function statusesOf(fighter: ArrayLike<number>): Statuses {
  const ticks = (index: number) => fighter[STATUSES_AT + index] ?? 0;
  const held = Object.fromEntries(STATUSES.map((name, index) => [name, ticks(index)])) as Record<StatusName, number>;
  return { ...held, chargeImmune: ticks(STATUSES.length) };
}

/** The shots a fighter's whole numbers (or a snapshot's) say its Ranged weapon has left; null for none counted. */
export function ammoOf(fighter: ArrayLike<number>): number | null {
  const counted = fighter[AMMO_AT] ?? 0;
  return counted >= 1 ? counted - 1 : null;
}

/** The healing charges a fighter's whole numbers (or a snapshot's) say it holds, and how far its meter has filled the
 *  next, 0 to 1. */
export function chargesOf(fighter: ArrayLike<number>): { readonly charges: number; readonly meter: number } {
  const meter = fighter[METER_AT] ?? 0;
  return {
    charges: (fighter[DRINKS_AT] ?? 0) & 3,
    meter: Number.isFinite(meter) ? Math.min(1, Math.max(0, meter)) : 0,
  };
}

/** What a fighter's whole numbers say. */
export const fighterView = (fighter: ArrayLike<number>): FighterView => ({
  ...glanceView(glanceFrom(fighter)),
  statuses: statusesOf(fighter),
  ammo: ammoOf(fighter),
  ...chargesOf(fighter),
});

/** How far through its action a fighter is, 0 to 1, by the action's own clock; 0 for one with none. */
export function actionProgress(action: Action, ticks: { readonly dodge: number; readonly parry: number }): number {
  switch (action.kind) {
    case 'attack':
      return Math.min(1, action.elapsed / Math.max(1, action.end));
    case 'telegraph':
      return Math.min(1, action.elapsed / Math.max(1, action.windup));
    case 'dodge':
      return Math.min(1, action.elapsed / ticks.dodge);
    case 'parry':
      return Math.min(1, action.elapsed / ticks.parry);
    default:
      return 0;
  }
}
