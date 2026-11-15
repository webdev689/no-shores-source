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
  /** The blow being struck or the shot fired: its direction (null for a shot), whether it is the second stroke of the
   *  swing, its progress 0..1, and whether a shot's weapon is reloading. */
  readonly blow: {
    readonly direction: Direction | null;
    readonly second: boolean;
    readonly progress: number;
    readonly reload?: boolean;
  } | null;
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

/** Whether the forge draws a held layer (null: the body alone) in a move. */
export type Draws = (anim: string, held: string | null) => boolean;

interface Kit {
  readonly idle: string;
  readonly walk: string;
  readonly attack: string;
  /** A gun's reload after its shot. */
  readonly reload?: string;
  /** A gun's or a crossbow's own run, held at port arms. */
  readonly run?: string;
}
const GUARD: Kit = { idle: 'guard', walk: 'march', attack: 'slash' };
const PAIR: Kit = { idle: 'twinguard', walk: 'twinmarch', attack: 'twinslash' };

/** The moves the right hand's weapon plays on its own: at rest, walking, and its own attack. */
function ownKit(right: string | null, left: string | null): Kit {
  const kind = right?.split('_')[0] ?? '';
  if (kind === 'bow') return { idle: 'idle_bow', walk: 'walk_bow', attack: 'bow' };
  if (kind === 'crossbow') return { idle: 'idle_bow', walk: 'walk_bow', attack: 'bow', run: 'xbowrun' };
  if (kind === 'staff') return { idle: 'idle_staff', walk: 'walk_staff', attack: 'attack_staff' };
  if (kind === 'thunderlock')
    return { idle: 'gunready', walk: 'gunwalk', attack: 'gunshot', reload: 'gunreload', run: 'gunrun' };
  if (kind === 'pistolet')
    return left?.startsWith('pistolet')
      ? { idle: 'braceready', walk: 'bracewalk', attack: 'braceshot', run: 'bracerun' }
      : { idle: 'pistolready', walk: 'pistolwalk', attack: 'pistolshot', reload: 'pistolreload', run: 'pistolrun' };
  if (!right) return { idle: 'idle', walk: 'walk', attack: 'thrust' };
  const swingsAxe = kind === 'axe' || kind === 'flail' || kind === 'warhammer';
  return { idle: 'idle', walk: 'walk', attack: swingsAxe ? 'attack_axe' : 'attack_sword' };
}

/** The moves both hands play: a shield or torch in the left guards and slashes, a blade in each hand fights as a pair,
 *  but only where the forge draws both hands' things in those moves; else the right hand's weapon plays its own and
 *  the left's is worn. */
function kitOf(right: string | null, left: string | null, draws: Draws): Kit {
  const both = (kit: Kit) => !!left && draws(kit.attack, left) && (!right || draws(kit.attack, right));
  if ((left?.startsWith('shield_') || left === 'torch_l') && both(GUARD)) return GUARD;
  if (left?.endsWith('_l') && !left.startsWith('pistolet') && both(PAIR)) return PAIR;
  return ownKit(right, left);
}

/** The moves a figure with these hands is likeliest to show next, to compose ahead of need: its rest, walk and
 *  attack, a gun's reload, the strokes of a weapon held alone, running, jumping and crouching. */
export function likelyMoves(right: string | null, left: string | null, draws: Draws): string[] {
  const kit = kitOf(right, left, draws);
  const strokes = right && !left ? ['thrust', 'chop', 'swing2h'] : [];
  const own = [
    kit.idle,
    kit.walk,
    kit.attack,
    ...(kit.reload ? [kit.reload] : []),
    ...(kit.run ? [kit.run] : []),
    ...strokes,
  ];
  return [...new Set([...own, 'idle', 'walk', 'run', 'jump', 'crouch_idle'])];
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
 * next blow 3-5), up a thrust, down a chop, left or right a two-handed swing where the weapon draws them; a shot, its
 * weapon's own move, then its reload where drawn; crouching; running; else the weapon's own walk and rest. `draws`
 * says whether the forge draws a held thing in a move.
 */
export function shownMove(doing: Doing, frames: (anim: string) => number, draws: Draws): Shown {
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
  const kit = kitOf(doing.drawn ? doing.right : null, doing.drawn ? doing.left : null, draws);
  const { blow } = doing;
  if (blow?.reload && kit.reload && draws(kit.reload, doing.right)) return byProgress(kit.reload, blow.progress);
  if (blow && !blow.reload) {
    const stroke = blow.direction && STROKE_OF[blow.direction];
    // The owner's strokes for a weapon held alone: an off hand's blade, shield or torch is drawn in none of them.
    const anim = stroke && doing.right && !doing.left && draws(stroke, doing.right) ? stroke : kit.attack;
    // A shot is one stroke of its move; a brace fires right, then left.
    const strokes = frames(anim) >= 6 && (blow.direction !== null || anim === 'braceshot') ? 2 : 1;
    const span = frames(anim) / strokes;
    const first = blow.second && strokes === 2 ? span : 0;
    return { anim, frame: first + Math.min(span - 1, Math.floor(blow.progress * span)), frameSeconds: 0 };
  }
  if (doing.crouched) return doing.moving ? loop('crouch_walk', WALK_FRAME * 2) : loop('crouch_idle', WALK_FRAME);
  if (doing.running && doing.moving) {
    if (kit.run && draws(kit.run, doing.right)) return loop(kit.run, WALK_FRAME / 2);
    if (draws('run', doing.drawn ? doing.right : null)) return loop('run', WALK_FRAME / 2);
  }
  const rest = doing.moving ? kit.walk : kit.idle;
  return loop(draws(rest, doing.drawn ? doing.right : null) ? rest : doing.moving ? 'walk' : 'idle', WALK_FRAME);
}
