import type { Dress } from './dressing.ts';
import type { Doing, Fight } from './playerMoves.ts';
import { type FighterView, type Shape, actionProgress, directionOf } from '../rules/fighters.ts';

/** How long a dodge, a parry's deflect and a flinch last, and a death's fall, in ticks, as the combat crate times
 *  them. */
export const FIGHT_TICKS = { dodge: 26, parry: 18, flinch: 15, death: 48, drawFull: 60 } as const;
/** A stagger reels: its figure's hurt frames play forth and back over this many ticks while it lasts. */
const REEL_TICKS = 24;

/** How far through its hurt frames a struck figure is with `left` ticks of it to go: a flinch plays them once, a
 *  stagger reels through them forth and back; a Charge's holds it still. */
export function struckProgress(kind: 'flinch' | 'staggered', left: number, charged = false): number {
  if (charged) return 0;
  if (kind === 'flinch') return Math.min(1, Math.max(0, 1 - left / FIGHT_TICKS.flinch));
  const phase = (((-left % REEL_TICKS) + REEL_TICKS) % REEL_TICKS) / REEL_TICKS;
  return Math.min(0.999, 1 - Math.abs(phase * 2 - 1));
}
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
      return { kind: 'struck', progress: struckProgress('staggered', action.left, action.cause === 'charged') };
    case 'flinch':
      return { kind: 'struck', progress: struckProgress('flinch', action.left) };
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
          direction: directionOf(action.stroke),
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
    grip: dress.outfit.grip ?? null,
    blow,
    cast: null,
    act: null,
    fight: fightOf(view),
  };
}
