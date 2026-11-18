import type { Dress } from './dressing.ts';
import type { InputFrame } from './input.ts';
import type { Direction, Doing, Fight } from './playerMoves.ts';
import { type Action, type FighterView, type Shape, actionProgress } from '../rules/fighters.ts';

/** The combat crate's strokes 1 to 6 as the first person's directions. */
export const STROKE_DIRECTIONS: readonly Direction[] = ['down', 'downLeft', 'left', 'right', 'downRight', 'up'];
/** How long a dodge and a parry's deflect last, and a death's fall, in ticks, as the combat crate times them. */
export const FIGHT_TICKS = { dodge: 26, parry: 18, death: 48, drawFull: 60 } as const;
/** The forge's stroke each telegraphed blow is struck with. */
const TELEGRAPH_STROKE: Readonly<Record<Shape, string>> = {
  lunge: 'thrust',
  sweep: 'swing2h',
  slam: 'chop',
  ring: 'swing2h',
  charge: 'thrust',
  leap: 'chop',
  aimed: 'bow',
};
/** Faster than this on foot, a figure runs. */
const RUNNING = 5.5;

/** What the fight holds a fighter's figure to, or null when it holds it to nothing. */
export function fightOf(view: FighterView): Fight | null {
  const { action } = view;
  switch (action.kind) {
    case 'dead':
      return { kind: 'dead', progress: Math.min(1, action.elapsed / FIGHT_TICKS.death) };
    case 'down':
      return { kind: 'down', progress: 0 };
    case 'staggered':
    case 'flinch':
      return { kind: 'struck', progress: 0 };
    case 'dodge':
      return { kind: 'dodge', progress: actionProgress(action, FIGHT_TICKS) };
    case 'parry':
      return { kind: 'parry', progress: actionProgress(action, FIGHT_TICKS) };
    case 'guard':
      return { kind: 'guard', progress: 0 };
    case 'telegraph':
      return { kind: 'windup', stroke: TELEGRAPH_STROKE[action.shape], progress: actionProgress(action, FIGHT_TICKS) };
    case 'overreach':
      return { kind: 'overreach', stroke: 'chop', progress: 1 };
    case 'draw':
      return { kind: 'draw', progress: Math.min(1, action.elapsed / FIGHT_TICKS.drawFull) };
    default:
      return null;
  }
}

/** What a foe's figure is doing, from the room's glance at it now and at its snapshot before, `seconds` earlier (a
 *  snapshot may come after several ticks). */
export function foeDoing(view: FighterView, before: FighterView | null, dress: Dress, seconds: number): Doing {
  const speed = before ? Math.hypot(view.x - before.x, view.y - before.y) / seconds : 0;
  const { action } = view;
  const blow =
    action.kind === 'attack'
      ? {
          direction: STROKE_DIRECTIONS[action.stroke - 1] ?? 'down',
          second: action.leftHand || action.stroke % 2 === 0,
          progress: Math.min(1, action.elapsed / Math.max(1, action.end)),
          lands: action.strike / Math.max(1, action.end),
        }
      : null;
  return {
    mode: view.mode,
    moving: speed > 0.2,
    running: speed > RUNNING,
    crouched: view.crouched,
    mounted: false,
    speed,
    vz: before ? (view.z - before.z) / seconds : 0,
    over: 0,
    drawn: dress.outfit.drawn,
    right: dress.outfit.right,
    left: dress.outfit.left,
    blow,
    cast: null,
    act: null,
    fight: fightOf(view),
  };
}

/** The weapons that shoot: their button draws or fires, as the fight's rules take a shot. */
export const SHOOTERS = /^(bow|crossbow|pistolet|thunderlock)(_|$)/;
/** What the fight holds the player to, when their weapon neither swings nor shoots. */
export const HELD: ReadonlySet<Action['kind']> = new Set([
  'flinch',
  'staggered',
  'down',
  'dead',
  'dodge',
  'guard',
  'parry',
  'telegraph',
  'overreach',
]);
/** The first person's guard, a weapon's own stroke frame held upright across the middle of the view, and a parry's
 *  deflect, the next stroke's middle frames played through. */
const GUARD_POSE = { record: 3, frame: 2 } as const;
const PARRY_RECORD = 4;

/** The pose the first person holds its weapon in for the fight's action: a guard's, a parry's deflect, or none. */
export function guardPose(action: Action): { readonly record: number; readonly frame: number } | null {
  if (action.kind === 'guard') return GUARD_POSE;
  if (action.kind !== 'parry') return null;
  return { record: PARRY_RECORD, frame: 1 + Math.min(2, Math.floor((action.elapsed / FIGHT_TICKS.parry) * 3)) };
}

/** How the player's hands stand for the fight this frame: the weapon out, on foot, the hands free (`armed`); a bow,
 *  a crossbow or a gun in the right hand (`shooter`), armed (`ranged`) and held up to aim (`aiming`); and whether the
 *  guard may rise (never behind a ranged weapon). */
export interface FightHands {
  readonly armed: boolean;
  readonly shooter: boolean;
  readonly ranged: boolean;
  readonly aiming: boolean;
  readonly guards: boolean;
}

/** The fight's hands for a frame, from the controls, the player before the frame steps them (their body's mode and
 *  whether they ride), and whether their weapon was drawn and what their right hand holds. */
export function fightHands(
  controls: InputFrame,
  player: { readonly body: { readonly mode: string }; readonly mounted: boolean },
  drawn: boolean,
  right: string | null,
): FightHands {
  const free = player.body.mode === 'ground' || player.body.mode === 'air';
  const armed = controls.locked && drawn && free && !player.mounted;
  const shooter = SHOOTERS.test(right ?? '');
  const ranged = armed && shooter;
  const aiming = ranged && controls.held('swing');
  const guards = controls.locked && free && !player.mounted && !ranged;
  return { armed, shooter, ranged, aiming, guards };
}

/** The fight's buttons for a frame's ticks, as the combat layer's fight takes them: a swing or a shot only with the
 *  weapon already out, on foot, the hands free; a guard on foot; a dodge whenever pressed (the rules refuse one in the
 *  air or the saddle). With a ranged weapon the swing's button aims, laying the shot on `mark`, and the guard's fires.
 *  Each press counts even let go within the frame. */
export function fightButtons(
  controls: InputFrame,
  hands: FightHands,
  pitch: number,
  mark: readonly [number, number, number] | null,
) {
  const { armed, shooter, ranged, aiming, guards } = hands;
  const swings = armed && !shooter;
  return {
    swing: swings && controls.held('swing'),
    shoot: ranged && controls.held('guard'),
    guard: guards && controls.held('guard'),
    dodge: controls.locked && controls.pressed('dodge'),
    pitch: -pitch,
    aim: aiming,
    mark,
    swingPressed: swings && controls.pressed('swing'),
    shootPressed: ranged && controls.pressed('guard'),
    guardPressed: guards && controls.pressed('guard'),
  };
}
