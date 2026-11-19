import type { Mode } from '../rules/movementRules.ts';
import { STRIKE_PACE } from '../firstperson/weaponMachine.ts';
import type { StrokeDirection } from '../rules/fighters.ts';

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
  /** Both hands on the right's sword's hilt, a greatsword. */
  readonly grip?: 'hilt' | null;
  /** The blow being struck or the shot fired: its direction (null for a shot), whether it is the second stroke of the
   *  swing, its progress 0..1, how far through the swing its blow lands (DFO's swing law's by default), and whether a
   *  shot's weapon is reloading. */
  readonly blow: {
    readonly direction: Direction | null;
    readonly second: boolean;
    readonly progress: number;
    readonly lands?: number;
    readonly reload?: boolean;
  } | null;
  /** A cast's progress 0..1, or null. */
  readonly cast: number | null;
  /** A move chosen by hand in the panel, and its progress 0..1. */
  readonly act: { readonly anim: string; readonly progress: number } | null;
  /** What the fight holds the figure to, and how far through it, 0..1; null when nothing does. */
  readonly fight?: Fight | null;
}

/** What a fight holds a figure to: dead, knocked down, staggered or flinching, hopping aside, deflecting a blow,
 *  guarding, winding up a telegraphed blow (`stroke` the move it is struck with), overreached after one, or drawing a
 *  bow. */
export type Fight =
  | { readonly kind: 'dead' | 'down' | 'struck' | 'dodge' | 'parry' | 'guard' | 'draw'; readonly progress: number }
  | { readonly kind: 'windup' | 'overreach'; readonly stroke: string; readonly progress: number };

/** A move to show: its animation, and either a fixed frame or how long each frame lasts as it loops. */
export interface Shown {
  readonly anim: string;
  readonly frame: number | null;
  readonly frameSeconds: number;
}

/** The jump's frame in the air, by how fast the body rises: rising, at the top, falling. */
const jumpFrame = (rising: number) => (rising > 1.5 ? 0 : rising < -1.5 ? 2 : 1);

/** How long a walking frame lasts; a run's is half, a crouch's double, a ride's a quarter of a run's. */
const WALK_FRAME = 0.25;
/** Each gun's shot's frame where it is aimed, before it fires (the forge's gunplay.py): a long gun's and a pistol's
 *  second, a brace's first, the right pistol up. */
const AIMED_FRAME: Readonly<Record<string, number>> = { gunshot: 1, pistolshot: 1, braceshot: 0 };

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

/** The moves the right hand's weapon plays on its own: at rest, walking, and its own attack. A bow drawn in its own
 *  holds (the forge's bowhold.py) stands, walks and sprints in them, both hands on it; else it rests in the left fist. */
function ownKit(right: string | null, left: string | null, draws: Draws): Kit {
  const kind = right?.split('_')[0] ?? '';
  if (kind === 'bow')
    return draws('bowready', right)
      ? { idle: 'bowready', walk: 'bowwalk', attack: 'bow', run: 'bowrun' }
      : { idle: 'idle_bow', walk: 'walk_bow', attack: 'bow' };
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
  return ownKit(right, left, draws);
}

/** The moves a figure with these hands is likeliest to show next, to compose ahead of need: its rest and walk; its
 *  blows where every swing strikes one, else its attack and a weapon held alone's strokes; a gun's reload, running,
 *  the roll, jumping and crouching. */
export function likelyMoves(
  right: string | null,
  left: string | null,
  draws: Draws,
  grip: 'hilt' | null = null,
): string[] {
  const kit = kitOf(right, left, draws);
  const blows = (['down', 'left', 'up'] as const).map((way) => blowOf(way, right, left, draws, grip));
  const struck = blows.filter((blow): blow is string => blow !== null);
  const strokes = right && !left ? [kit.attack, 'thrust', 'chop', 'swing2h'] : [kit.attack];
  const own = [
    kit.idle,
    kit.walk,
    ...(struck.length === blows.length ? struck : strokes),
    ...(kit.reload ? [kit.reload] : []),
    ...(kit.run ? [kit.run] : []),
    'roll',
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

/** The owner's blows (the forge's blows.py): a stroke for each way a weapon is held, nine frames, the weapon landing on
 *  the fifth. */
const BLOW = { frames: 9, lands: 4 } as const;
/** How far through its wind-up's frames, 0 to 1, a strike is at `progress` through its swing, landing at `lands`: at
 *  the first person's pace. */
function woundUp(progress: number, lands: number): number {
  const start = lands * (1 - STRIKE_PACE.windup);
  return Math.max(0, (progress - start) / Math.max(lands - start, 1e-6));
}
/** The hold each weapon strikes in alone: one hand, or both on a haft. */
const HOLD_OF: Readonly<Record<string, string>> = {
  sword: '1h',
  dagger: '1h',
  mace: '1h',
  axe: 'haft',
  flail: 'haft',
  warhammer: 'haft',
};

/** The blow a swing in `direction` strikes with these hands, where the forge draws it with both: its stroke (down the
 *  overhead, up the thrust, any other the side cut) and its hold (a blade or mace in each hand as a pair, else the
 *  weapon's own). Null where none is drawn. */
/** One of the owner's blows by name: its stroke and its hold. */
const BLOW_NAME = /^(over|side|thrust)(1h|haft|hilt|pair)$/;

/** The way a blow's blade goes as the forge draws it, for the striker's right hand: the overhead down and the thrust
 *  out; the side cut to the right with one hand or a pair (its right blade), to the left with a hilt or a haft, whatever
 *  way the swing was asked. Null for any other move. */
export function blowWay(anim: string): StrokeDirection | null {
  const [, stroke, hold] = BLOW_NAME.exec(anim) ?? [];
  if (stroke === 'over') return 'down';
  if (stroke === 'thrust') return 'up';
  if (stroke === 'side') return hold === 'haft' || hold === 'hilt' ? 'left' : 'right';
  return null;
}

function blowOf(
  direction: Direction,
  right: string | null,
  left: string | null,
  draws: Draws,
  grip: 'hilt' | null = null,
): string | null {
  if (!right) return null;
  const stroke = direction === 'down' ? 'over' : direction === 'up' ? 'thrust' : 'side';
  const pair = !!left?.endsWith('_l') && !left.startsWith('pistolet');
  const hold = grip === 'hilt' ? 'hilt' : pair ? 'pair' : HOLD_OF[right.split('_')[0] ?? ''];
  const anim = hold ? `${stroke}${hold}` : null;
  return anim && draws(anim, right) && (!left || draws(anim, left)) ? anim : null;
}

/** A blow's frame `progress` through its swing, which lands `lands` through it: the frames before the landing one
 *  through the wind-up, the landing one as it lands, the rest over the follow-through, the last held. */
export function blowFrame(progress: number, lands: number): number {
  const now = Math.max(0, progress);
  if (lands > 0 && now < lands) return Math.min(BLOW.lands - 1, Math.floor(woundUp(now, lands) * BLOW.lands));
  const recover = lands * STRIKE_PACE.recover;
  if (!(recover > 0)) return BLOW.frames - 1;
  return Math.min(BLOW.frames - 1, BLOW.lands + Math.floor(((now - lands) / recover) * (BLOW.frames - BLOW.lands)));
}

/** How far through a swing its blow lands by DFO's swing law: as the third of five strike frames begins. */
export const BLOW_LANDS = 2 / 5;

/** The frame (whole part) of a stroke `span` frames long at `progress` through its swing: the frames run through the
 *  wind-up to land the last on the blow (`lands` through the swing), held through the follow-through, so the figure
 *  strikes fast and shows itself open while it recovers. */
export function strokeFrame(progress: number, lands = BLOW_LANDS, span = 3): number {
  if (span <= 1 || progress >= lands) return span - 1;
  return woundUp(progress, lands) * (span - 1);
}

/**
 * The move the player's figure shows, by DFO's law: a move chosen by hand first; then on a ledge or a wall the
 * mantle, vault, hang, shimmy or climb (frame by progress, or looping once a second); in the air the jump, its frame
 * by rising or falling; mounted, the horse's walk or gallop; a cast; a blow, the owner's blow for the swing's stroke
 * and the weapon's hold where drawn, else one stroke of the weapon's attack (frames 0-2, the next blow 3-5), up a
 * thrust, down a chop, left or right a two-handed swing where the weapon draws them; a shot, its weapon's own move,
 * then its reload where drawn; crouching; running; else the weapon's own walk and rest, a bow's in its own holds.
 * `draws` says whether the forge draws a held thing in a move.
 */
export function shownMove(doing: Doing, frames: (anim: string) => number, draws: Draws): Shown {
  const byProgress = (anim: string, progress: number): Shown => ({
    anim,
    frame: Math.min(frames(anim) - 1, Math.floor(progress * frames(anim))),
    frameSeconds: 0,
  });
  const loop = (anim: string, frameSeconds: number): Shown => ({ anim, frame: null, frameSeconds });
  // A dodge rolls where the forge draws the roll; else it holds the figure to its hop only in the air, and on the
  // ground, before and after, it stands or walks. Mounted, the horse shows.
  const rolls = draws('roll', null);
  const fight =
    doing.fight?.kind === 'dodge' && (doing.mounted || (doing.mode !== 'air' && !rolls)) ? null : doing.fight;
  if (fight) return fightMove(doing, fight, frames, draws, byProgress, loop);
  if (doing.act) return byProgress(doing.act.anim, doing.act.progress);
  if (doing.mode === 'mantle' || doing.mode === 'vault') return byProgress(doing.mode, doing.over);
  if (doing.mode === 'hang') return doing.moving ? loop('shimmy', 1 / frames('shimmy')) : byProgress('hang', 0);
  if (doing.mode === 'climb')
    return doing.moving ? loop('climb', 1 / frames('climb')) : { anim: 'climb', frame: 0, frameSeconds: 0 };
  if (doing.mode === 'air') return { anim: 'jump', frame: jumpFrame(doing.vz), frameSeconds: 0 };
  if (doing.mounted) {
    if (!doing.moving) return loop('horseidle', WALK_FRAME);
    return doing.speed > 10 ? loop('horsegallop', WALK_FRAME / 4) : loop('horsewalk', WALK_FRAME / 2);
  }
  if (doing.cast !== null) return byProgress('cast', doing.cast);
  const kit = kitOf(doing.drawn ? doing.right : null, doing.drawn ? doing.left : null, draws);
  const { blow } = doing;
  if (blow?.reload && kit.reload && draws(kit.reload, doing.right)) return byProgress(kit.reload, blow.progress);
  if (blow && !blow.reload) {
    const struck =
      blow.direction && doing.drawn && blowOf(blow.direction, doing.right, doing.left, draws, doing.grip ?? null);
    if (struck) return { anim: struck, frame: blowFrame(blow.progress, blow.lands ?? BLOW_LANDS), frameSeconds: 0 };
    const stroke = blow.direction && STROKE_OF[blow.direction];
    // The owner's strokes for a weapon held alone: an off hand's blade, shield or torch is drawn in none of them.
    const anim = stroke && doing.right && !doing.left && draws(stroke, doing.right) ? stroke : kit.attack;
    // A shot is one stroke of its move; a brace fires right, then left.
    const strokes = frames(anim) >= 6 && (blow.direction !== null || anim === 'braceshot') ? 2 : 1;
    const span = frames(anim) / strokes;
    const first = blow.second && strokes === 2 ? span : 0;
    const through = blow.direction === null ? blow.progress * span : strokeFrame(blow.progress, blow.lands, span);
    return { anim, frame: first + Math.min(span - 1, Math.floor(through)), frameSeconds: 0 };
  }
  if (doing.crouched) return doing.moving ? loop('crouch_walk', WALK_FRAME * 2) : loop('crouch_idle', WALK_FRAME);
  if (doing.running && doing.moving) {
    if (kit.run && draws(kit.run, doing.right)) return loop(kit.run, WALK_FRAME / 2);
    if (draws('run', doing.drawn ? doing.right : null)) return loop('run', WALK_FRAME / 2);
  }
  const rest = doing.moving ? kit.walk : kit.idle;
  return loop(draws(rest, doing.drawn ? doing.right : null) ? rest : doing.moving ? 'walk' : 'idle', WALK_FRAME);
}

/**
 * The move a fight holds a figure to, from the forge's own moves: the death, then lying fallen; fallen while knocked
 * down; hurt while staggered or flinching (its bow's or staff's own), played by how far through it is; the roll
 * through a dodge, or where the forge draws none, the jump's frames through the dodge's hop in the air by its rise
 * and fall, or the run where the forge does not draw what it holds in the jump; the parry through a deflect, a
 * shield's block; the guard held as the parry's first frame or a shield's block; a telegraphed blow's stroke raised
 * through its wind-up
 * and held at its end when it overreaches; and a ranged weapon aimed: the bow drawn, a gun held at its shot's aimed
 * frame (`AIMED_FRAME`), a crossbow raised as the first frame of its shot.
 */
function fightMove(
  doing: Doing,
  fight: Fight,
  frames: (anim: string) => number,
  draws: Draws,
  byProgress: (anim: string, progress: number) => Shown,
  loop: (anim: string, frameSeconds: number) => Shown,
): Shown {
  const right = doing.drawn ? doing.right : null;
  const left = doing.drawn ? doing.left : null;
  const holds = (anim: string) => draws(anim, right) && (!left || draws(anim, left));
  const own = (anim: string) => {
    const kind = right?.split('_')[0];
    const special = kind === 'bow' || kind === 'crossbow' ? `${anim}_bow` : kind === 'staff' ? `${anim}_staff` : null;
    return special && draws(special, right) ? special : anim;
  };
  const shield = !!left?.startsWith('shield_') && draws('block', left);
  const still = (anim: string, frame = 0): Shown => ({
    anim,
    frame: Math.min(frame, frames(anim) - 1),
    frameSeconds: 0,
  });
  switch (fight.kind) {
    case 'dead':
      return fight.progress >= 1 ? still('fallen') : byProgress('death', fight.progress);
    case 'down':
      return still('fallen');
    case 'struck':
      return byProgress(own('hurt'), fight.progress);
    case 'dodge':
      // The roll draws no weapon, held or worn: none is seen through it.
      if (draws('roll', null)) return byProgress('roll', fight.progress);
      if (!holds('jump')) return loop('run', WALK_FRAME / 2);
      return still('jump', jumpFrame(doing.vz));
    case 'parry':
      return shield ? still('block') : byProgress(own('parry'), fight.progress);
    case 'guard':
      if (shield) return still('block');
      return draws(own('parry'), right) ? still(own('parry')) : still('guard');
    case 'windup':
      return still(fight.stroke, fight.progress < 0.8 ? 0 : 1);
    case 'overreach':
      return still(fight.stroke, 2);
    case 'draw': {
      if (right?.startsWith('bow')) return byProgress('bow', fight.progress * 0.5);
      const shot = kitOf(right, left, draws).attack;
      return still(shot, AIMED_FRAME[shot] ?? 0);
    }
  }
}
