import type { Mode } from './motor.ts';

/** A swing's direction, as the first-person weapon draws it. */
export type Direction = 'down' | 'downLeft' | 'left' | 'right' | 'downRight' | 'up';

/** What the player's body is doing, as the move it shows is chosen from. */
export interface Doing {
  readonly mode: Mode;
  readonly moving: boolean;
  readonly running: boolean;
  readonly crouched: boolean;
  readonly mounted: boolean;
  readonly speed: number;
  readonly vz: number;
  /** A mantle's or vault's progress 0..1. */
  readonly over: number;
  readonly drawn: boolean;
  readonly right: string | null;
  readonly left: string | null;
  /** The blow being struck: its direction, whether it is the second stroke of the swing, and its progress 0..1. */
  readonly blow: { readonly direction: Direction; readonly second: boolean; readonly progress: number } | null;
  /** A cast's progress 0..1, or null. */
  readonly cast: number | null;
  /** A move chosen by hand in the panel, and its progress 0..1. */
  readonly act: { readonly anim: string; readonly progress: number } | null;
}

/** A move to show: its animation, and either a fixed frame or how long each frame lasts as it loops. */
export interface Shown {
  readonly anim: string;
  readonly frame: number | null;
  readonly frameSeconds: number;
}

/** How long a walking frame lasts; a run's is half, a crouch's double, a ride's a quarter of a run's. */
const WALK_FRAME = 0.25;

/** The moves a weapon in hand plays: at rest, walking, and its own attack. */
function kitOf(right: string | null, left: string | null): { idle: string; walk: string; attack: string } {
  const kind = right?.split('_')[0] ?? '';
  if (kind === 'bow' || kind === 'crossbow') return { idle: 'idle_bow', walk: 'walk_bow', attack: 'bow' };
  if (kind === 'staff') return { idle: 'idle_staff', walk: 'walk_staff', attack: 'attack_staff' };
  if (kind === 'thunderlock') return { idle: 'gunready', walk: 'gunwalk', attack: 'gunshot' };
  if (kind === 'pistolet')
    return left?.startsWith('pistolet')
      ? { idle: 'braceready', walk: 'bracewalk', attack: 'braceshot' }
      : { idle: 'pistolready', walk: 'pistolwalk', attack: 'pistolshot' };
  if (left?.startsWith('shield_') || left === 'torch_l') return { idle: 'guard', walk: 'march', attack: 'slash' };
  if (left && right) return { idle: 'twinguard', walk: 'twinmarch', attack: 'twinslash' };
  if (!right) return { idle: 'idle', walk: 'walk', attack: 'thrust' };
  const swingsAxe = kind === 'axe' || kind === 'flail' || kind === 'warhammer';
  return { idle: 'idle', walk: 'walk', attack: swingsAxe ? 'attack_axe' : 'attack_sword' };
}

/** The forge's own strokes the owner gave the player, by the swing's direction. */
const STROKE_OF: Readonly<Partial<Record<Direction, string>>> = {
  up: 'thrust',
  down: 'chop',
  left: 'swing2h',
  right: 'swing2h',
};

/**
 * The move the player's figure shows, by DFO's law: a move chosen by hand first; then on a ledge or a wall the
 * mantle, vault, hang, shimmy or climb (frame by progress, or looping once a second); in the air the jump, its frame
 * by rising or falling; mounted, the horse's walk or gallop; a cast; a blow, one stroke of the swing (frames 0-2, the
 * next blow 3-5), up a thrust, down a chop, left or right a two-handed swing where the weapon draws them; crouching;
 * running; else the weapon's own walk and rest. `draws(anim)` says whether every layer worn is drawn in a move.
 */
export function shownMove(doing: Doing, frames: (anim: string) => number, draws: (anim: string) => boolean): Shown {
  const byProgress = (anim: string, progress: number): Shown => ({
    anim,
    frame: Math.min(frames(anim) - 1, Math.floor(progress * frames(anim))),
    frameSeconds: 0,
  });
  const loop = (anim: string, frameSeconds: number): Shown => ({ anim, frame: null, frameSeconds });
  if (doing.act) return byProgress(doing.act.anim, doing.act.progress);
  if (doing.mode === 'mantle' || doing.mode === 'vault') return byProgress(doing.mode, doing.over);
  if (doing.mode === 'hang') return doing.moving ? loop('shimmy', 1 / frames('shimmy')) : byProgress('hang', 0);
  if (doing.mode === 'climb')
    return doing.moving ? loop('climb', 1 / frames('climb')) : { anim: 'climb', frame: 0, frameSeconds: 0 };
  if (doing.mode === 'air')
    return { anim: 'jump', frame: doing.vz > 1.5 ? 0 : doing.vz < -1.5 ? 2 : 1, frameSeconds: 0 };
  if (doing.mounted) {
    if (!doing.moving) return loop('horseidle', WALK_FRAME);
    return doing.speed > 10 ? loop('horsegallop', WALK_FRAME / 4) : loop('horsewalk', WALK_FRAME / 2);
  }
  if (doing.cast !== null) return byProgress('cast', doing.cast);
  const kit = kitOf(doing.drawn ? doing.right : null, doing.drawn ? doing.left : null);
  if (doing.blow) {
    const stroke = STROKE_OF[doing.blow.direction];
    const anim = stroke && doing.right && draws(stroke) ? stroke : kit.attack;
    const strokes = frames(anim) >= 6 ? 2 : 1;
    const span = frames(anim) / strokes;
    const first = doing.blow.second && strokes === 2 ? span : 0;
    return { anim, frame: first + Math.min(span - 1, Math.floor(doing.blow.progress * span)), frameSeconds: 0 };
  }
  if (doing.crouched) return doing.moving ? loop('crouch_walk', WALK_FRAME * 2) : loop('crouch_idle', WALK_FRAME);
  if (doing.running && doing.moving && draws('run')) return loop('run', WALK_FRAME / 2);
  const rest = doing.moving ? kit.walk : kit.idle;
  return loop(draws(rest) ? rest : doing.moving ? 'walk' : 'idle', WALK_FRAME);
}
