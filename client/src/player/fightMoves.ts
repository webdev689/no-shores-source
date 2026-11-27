import type { Dress } from './dressing.ts';
import { RUNNING } from './others.ts';
import type { Doing, Fight } from './playerMoves.ts';
import { type Action, type FighterView, type Shape, actionProgress, directionOf } from '../rules/fighters.ts';

/** How long a dodge, a parry's deflect and a flinch last, a death's fall, a bow's full draw and a drink, in ticks, as
 *  the combat crate times them. */
export const FIGHT_TICKS = { dodge: 26, parry: 18, flinch: 15, death: 48, drawFull: 60, drink: 60 } as const;
/** A stagger reels: its figure's hurt frames play forth and back over this many ticks while it lasts. */
const REEL_TICKS = 24;

/** The way a dodging figure faces: the way its hop goes, so its roll is drawn going that way, though the rules keep the
 *  fighter facing its soft lock's target; null for any other action. */
export function dodgeFacing(action: Action): number | null {
  return action.kind === 'dodge' ? Math.atan2(action.toward[0], -action.toward[1]) : null;
}

/** How far through its hurt frames a struck figure is with `left` ticks of it to go: a flinch plays them once, a
 *  stagger reels through them forth and back; a Charge's holds it still. */
export function struckProgress(kind: 'flinch' | 'staggered', left: number, charged = false): number {
  if (charged) return 0;
  if (kind === 'flinch') return Math.min(1, Math.max(0, 1 - left / FIGHT_TICKS.flinch));
  const phase = (((-left % REEL_TICKS) + REEL_TICKS) % REEL_TICKS) / REEL_TICKS;
  return Math.min(0.999, 1 - Math.abs(phase * 2 - 1));
}
/** The forge's stroke each telegraphed blow is struck with; an aimed shot is a ranged weapon's own draw. */
const TELEGRAPH_STROKE: Readonly<Record<Exclude<Shape, 'aimed'>, string>> = {
  lunge: 'thrust',
  sweep: 'swing2h',
  slam: 'chop',
  ring: 'swing2h',
  charge: 'thrust',
  leap: 'chop',
};
/** A foe's pace, a share of a player's, as the foes crate's `FOE_PACE`: it runs faster than its share of `RUNNING`. */
const FOE_PACE = 0.75;
/** The movement rules' going over a lip: it takes (0.25 + 0.22 × rise) × 1.05 seconds; a mantle rises to the lip over
 *  the first 1 / 1.6 of that, and a vault's arc tops the lip by 0.2 m halfway. */
const OVER = { seconds: 0.25, perMetre: 0.22, pace: 1.05, rising: 1.6, clears: 0.2 } as const;
const overSeconds = (rise: number) => (OVER.seconds + OVER.perMetre * Math.max(0, rise)) * OVER.pace;

/**
 * How far through a mantle or a vault a body is, 0 to 1, as its glances show it: `seconds` since it began, `risen`
 * metres over where it began, its highest so far `highest`. A mantle's time and height give its progress exactly
 * while it rises, and its time over its whole rise once at the lip: the smaller of the two is the true one. A vault's
 * is its time over the rise its arc's top shows, a little ahead until its top.
 */
export function overProgress(mode: 'mantle' | 'vault', seconds: number, risen: number, highest: number): number {
  if (!(seconds > 0)) return 0;
  if (mode === 'vault') return Math.min(1, seconds / overSeconds(highest - OVER.clears));
  const rising = (OVER.rising * seconds - OVER.pace * OVER.perMetre * risen) / (OVER.rising * OVER.pace * OVER.seconds);
  return Math.max(0, Math.min(1, rising, seconds / overSeconds(risen)));
}

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
      // An aimed shot is drawn and held as the weapon is aimed, its wind-up the draw.
      if (action.shape === 'aimed') return { kind: 'draw', progress: actionProgress(action, FIGHT_TICKS) };
      return { kind: 'windup', stroke: TELEGRAPH_STROKE[action.shape], progress: actionProgress(action, FIGHT_TICKS) };
    case 'overreach':
      return { kind: 'overreach', stroke: 'chop', progress: 1 };
    case 'draw':
      return { kind: 'draw', progress: Math.min(1, action.elapsed / FIGHT_TICKS.drawFull) };
    case 'drink':
      return { kind: 'drink', progress: Math.min(1, action.elapsed / FIGHT_TICKS.drink) };
    default:
      return null;
  }
}

/** What a foe's figure is doing, from the room's glance at it now and at its snapshot before, `seconds` earlier (a
 *  snapshot may come after several ticks). */
export function foeDoing(view: FighterView, before: FighterView | null, dress: Dress, seconds: number): Doing {
  const speed = before ? Math.hypot(view.x - before.x, view.y - before.y) / seconds : 0;
  // On a wall a foe moves up or down it, not across the ground.
  const climbing = view.mode === 'climb' && !!before && Math.abs(view.z - before.z) / seconds > 0.2;
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
    moving: speed > 0.2 || climbing,
    running: speed > (view.side === 'players' ? RUNNING : RUNNING * FOE_PACE),
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
