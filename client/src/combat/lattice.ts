// The Lattice's foes as the game draws them from the forge's renders (tools/lattice/): each type's own body and the
// moves it plays in place of a man's, the layers of its own the game shows or takes away as a move goes, and the plain
// figure it is drawn as until its pictures are published.
import type { Doing, Shown } from '../player/playerMoves.ts';
import { type Dress, plainDress } from '../player/dressing.ts';
import type { Action } from '../rules/fighters.ts';

/** The crystal a foe grows: grey graded red, or the purple of its shadows taken over. */
export type Strain = 'red' | 'purple';

/** A Lattice type as drawn: its body in the forge's renders, its crystal and how many times a man's size it stands. */
export interface LatticeKind {
  readonly body: string;
  readonly strain: Strain;
  readonly scale: number;
}

/** Each Lattice type by its number (the rules' roster), as tools/lattice/ draws it. */
export const LATTICE: Readonly<Record<number, LatticeKind>> = {
  39: { body: 'husk', strain: 'red', scale: 1 },
  40: { body: 'flicker', strain: 'purple', scale: 1.12 },
  41: { body: 'idol', strain: 'purple', scale: 1 },
  42: { body: 'ravager', strain: 'red', scale: 1 },
  43: { body: 'bulwark', strain: 'red', scale: 1.2 },
  44: { body: 'heart', strain: 'red', scale: 3 },
};

/** The Lattice kind whose forge body is `body`, if any. */
export const latticeOfBody = (body: string): LatticeKind | null =>
  Object.values(LATTICE).find((kind) => kind.body === body) ?? null;

/** How long each frame of a looping move lasts: its idle's, and its walk's. */
const IDLE_FRAME_S = 1 / 10;
const WALK_FRAME_S = 1 / 14;
/** The share of an attack's frames that are its wind-up, held while the rules hold a telegraphed blow. */
export const TELL_SHARE = 0.35;

/** What a foe of a kind does with each kind of blow: struck high (an overhead), across (a side cut), straight (a
 *  thrust), or loosed (a shot), and while it draws one. */
interface Moves {
  readonly idle: string;
  readonly walk: string | null;
  readonly hurt: string;
  readonly stagger: string;
  readonly arrive?: string;
  readonly draw?: string;
  readonly overhead: string;
  readonly side: string;
  readonly otherSide?: string;
  readonly thrust: string;
  readonly shot: string;
}

const MOVES: Readonly<Record<string, Moves>> = {
  husk: {
    idle: 'husk_idle',
    walk: 'husk_walk',
    hurt: 'husk_hurt',
    stagger: 'husk_stagger',
    overhead: 'husk_gore',
    side: 'husk_gore',
    thrust: 'husk_lunge',
    shot: 'husk_lunge',
  },
  flicker: {
    idle: 'flicker_idle',
    walk: null,
    hurt: 'flicker_hurt',
    stagger: 'flicker_stagger',
    arrive: 'flicker_arrive',
    overhead: 'flicker_overhead',
    side: 'flicker_slash_left',
    otherSide: 'flicker_slash_right',
    thrust: 'flicker_slash_right',
    shot: 'flicker_overhead',
  },
  idol: {
    idle: 'idol_idle',
    walk: null,
    hurt: 'idol_hurt',
    stagger: 'idol_stagger',
    arrive: 'idol_arrive',
    draw: 'idol_charge',
    overhead: 'idol_fire',
    side: 'idol_fire',
    thrust: 'idol_fire',
    shot: 'idol_fire',
  },
  ravager: {
    idle: 'ravager_idle',
    walk: 'ravager_walk',
    hurt: 'ravager_hurt',
    stagger: 'ravager_stagger',
    draw: 'ravager_hurl',
    overhead: 'ravager_maul',
    side: 'ravager_maul',
    thrust: 'ravager_maul',
    shot: 'ravager_hurl',
  },
  bulwark: {
    idle: 'bulwark_idle',
    walk: 'bulwark_walk',
    hurt: 'bulwark_hurt',
    stagger: 'bulwark_stagger',
    overhead: 'bulwark_discharge',
    side: 'bulwark_discharge',
    thrust: 'bulwark_discharge',
    shot: 'bulwark_discharge',
  },
  heart: {
    idle: 'heart_idle',
    walk: 'heart_walk',
    hurt: 'heart_hurt',
    stagger: 'heart_stagger',
    overhead: 'heart_slam',
    side: 'heart_sweep',
    thrust: 'heart_stomp',
    shot: 'heart_tear',
  },
};
/** The Bulwark once it has changed: its shield gone, the maul that formed in its hand swung and slammed down. */
const CHANGED: Moves = {
  ...(MOVES['bulwark'] as Moves),
  overhead: 'bulwark_slam',
  side: 'bulwark_sweep',
  thrust: 'bulwark_slam',
  shot: 'bulwark_slam',
};
/** The Bulwark's change, played once as it comes: the shield dropped and the maul lifted. */
export const BULWARK_CHANGE = 'bulwark_change';
/** How long the change plays (seconds): its eight frames. */
export const CHANGE_S = 8 * IDLE_FRAME_S;

/** Every move a Lattice body plays, to warm ahead of need. */
export function latticeAnims(body: string): string[] {
  const own = MOVES[body];
  if (!own) return [];
  const all = body === 'bulwark' ? [own, CHANGED, { change: BULWARK_CHANGE }] : [own];
  return [...new Set(all.flatMap((moves) => Object.values(moves).filter((anim): anim is string => !!anim)))];
}

/** Whether a Bulwark has changed: in its second phase or later, or brought to half its health. */
export const bulwarkChanged = (phase: number, health: number, healthMax: number): boolean =>
  phase >= 2 || (healthMax > 0 && health <= healthMax / 2);

/** The kind of blow a man's stroke or a blow's direction is: high, across, straight, or a shot. */
function blowKind(direction: string | null, stroke = ''): 'overhead' | 'side' | 'thrust' | 'shot' {
  if (direction === null || /bow|shot|cast|throw|fire|crossbow|pistolet|thunderlock/.test(stroke)) return 'shot';
  if (direction === 'up' || /thrust|stab|lunge/.test(stroke)) return 'thrust';
  if (direction === 'down' || /chop|over|slam/.test(stroke)) return 'overhead';
  return 'side';
}

/**
 * The move a Lattice foe of `body` plays for what it is doing (`doing`), in place of the man's `shown`, each of its
 * moves `frames(anim)` long; `changed` for a Bulwark that has changed, and `changing` how far through its change it
 * is (null when it is not). Its blows by their kind: the Husk lunges and gores, the Flicker slashes left and right in
 * turn and brings both blades down, the Idol charges and fires its beam, the Ravager hurls its shards and mauls, the
 * Bulwark discharges its shield and, changed, sweeps and slams its maul; the Flicker and the Idol never walk, they
 * blink, landing in their arrival. Dying it is held struck while the wave takes it. Null for a body not the Lattice's.
 */
export function latticeMove(
  body: string,
  doing: Doing,
  shown: Shown,
  frames: (anim: string) => number,
  changed = false,
  changing: number | null = null,
): Shown | null {
  const own = body === 'bulwark' && changed ? CHANGED : MOVES[body];
  if (!own) return null;
  const frameOf = (anim: string, progress: number): Shown => ({
    anim,
    frame: Math.max(0, Math.min(frames(anim) - 1, Math.floor(progress * frames(anim)))),
    frameSeconds: 0,
  });
  const loop = (anim: string, frameSeconds: number): Shown => ({ anim, frame: null, frameSeconds });
  if (changing !== null && body === 'bulwark' && doing.fight?.kind !== 'dead') return frameOf(BULWARK_CHANGE, changing);
  const attack = (kind: ReturnType<typeof blowKind>, second = false) =>
    kind === 'side' && second && own.otherSide ? own.otherSide : own[kind];
  const fight = doing.fight;
  if (fight) {
    switch (fight.kind) {
      case 'dead':
        return frameOf(own.hurt, 1);
      case 'down':
        return frameOf(own.stagger, fight.progress);
      case 'struck':
        return frameOf(own.hurt, fight.progress);
      case 'dodge':
        // A blink: out through its landing's frames backwards, then in through them.
        if (own.arrive)
          return frameOf(own.arrive, fight.progress < 0.5 ? 1 - fight.progress * 2 : fight.progress * 2 - 1);
        return loop(own.walk ?? own.idle, WALK_FRAME_S);
      case 'windup':
        return frameOf(
          attack(blowKind(doing.blow ? doing.blow.direction : 'right', fight.stroke)),
          fight.progress * TELL_SHARE,
        );
      case 'overreach':
        return frameOf(attack(blowKind(doing.blow ? doing.blow.direction : 'right', fight.stroke)), 1);
      case 'draw':
        return frameOf(own.draw ?? own.shot, fight.progress * (own.draw ? 1 : TELL_SHARE));
      default:
        return loop(own.idle, IDLE_FRAME_S);
    }
  }
  if (doing.blow && !doing.blow.reload)
    return frameOf(attack(blowKind(doing.blow.direction), doing.blow.second), doing.blow.progress);
  if (doing.cast !== null) return frameOf(own.shot, doing.cast);
  if (doing.moving && own.walk)
    return loop(own.walk, shown.frame === null && shown.frameSeconds > 0 ? shown.frameSeconds : WALK_FRAME_S);
  return loop(own.idle, IDLE_FRAME_S);
}

/** How long each frame of a telegraphed blow lasts once its tell is over (seconds): its walk's, so it strikes fast. */
const STRIKE_FRAME_S = WALK_FRAME_S;

/** A Lattice foe's telegraphed blow as last drawn: its move, and the page second the rules ended its tell (null while
 *  they hold it). */
export interface HeldBlow {
  readonly anim: string;
  readonly struck: number | null;
}

/**
 * What a Lattice foe shows at `clock` with its telegraphed blow `held`, `move` the move `latticeMove` gives for the
 * rules' `action` now, each move `frames(anim)` long; and the blow to keep for the next frame. The rules hold the blow
 * in its tell, then at once set the foe at rest as it lands or overreached as it misses, but the move's strike and
 * landing are its frames after the tell: so those play on at STRIKE_FRAME_S a frame, an overreach then held on the
 * last. A feint or an aimed shot strikes nothing; anything else the rules set, or the Bulwark's change, shows as
 * `move` does.
 */
export function blowPlayedOn(
  held: HeldBlow | null,
  action: Action,
  move: Shown,
  frames: (anim: string) => number,
  clock: number,
): { readonly shown: Shown; readonly held: HeldBlow | null } {
  if (move.anim === BULWARK_CHANGE) return { shown: move, held: null };
  if (action.kind === 'telegraph')
    return {
      shown: move,
      held: action.feintAt === null && action.shape !== 'aimed' ? { anim: move.anim, struck: null } : null,
    };
  if (!held || (action.kind !== 'idle' && action.kind !== 'overreach')) return { shown: move, held: null };
  const struck = held.struck ?? clock;
  const last = frames(held.anim) - 1;
  const frame = Math.floor(TELL_SHARE * frames(held.anim)) + 1 + Math.floor((clock - struck) / STRIKE_FRAME_S);
  if (frame > last && action.kind === 'idle') return { shown: move, held: null };
  return {
    shown: { anim: held.anim, frame: Math.max(0, Math.min(frame, last)), frameSeconds: 0 },
    held: { ...held, struck },
  };
}

/** The frame of the Ravager's hurl its first shard leaves on; the frame of the Heart's tear it grips its torn one,
 *  and the last it holds it (tools/lattice/ravager_moves.py, heart_moves.py). */
export const HURL_FIRST_THROW = 4;
const TEAR_HELD = [3, 8] as const;

/**
 * The layers of its own a Lattice foe of `body` does not show in frame `frame` of `anim`: the Ravager's shards from its
 * first throw to the end of its hurl, the Bulwark's maul until it changes and its shield from its change on, the
 * Heart's torn one but from its grip to its fling.
 */
export function latticeHidden(body: string, anim: string, frame: number, changed: boolean): readonly string[] {
  if (body === 'ravager')
    return anim === 'ravager_hurl' && frame >= HURL_FIRST_THROW ? ['lattice_ravager_ammunition'] : [];
  if (body === 'bulwark')
    return changed || anim === BULWARK_CHANGE ? ['lattice_bulwark_shield'] : ['lattice_bulwark_maul'];
  if (body === 'heart')
    return anim === 'heart_tear' && frame >= TEAR_HELD[0] && frame <= TEAR_HELD[1] ? [] : ['lattice_heart_torn'];
  return [];
}

/** The dresses a Lattice foe of `body` is drawn in, each by the layers it hides, with the moves it is drawn in on any
 *  of their `frames`: as it stands now (`changed` or not) and once changed, for a foe that changes. */
export function latticeDresses(
  body: string,
  changed: boolean,
  frames: (anim: string) => number,
): { readonly hidden: readonly string[]; readonly anims: string[] }[] {
  const dresses = new Map<string, { readonly hidden: readonly string[]; readonly anims: string[] }>();
  for (const anim of latticeAnims(body))
    for (const now of new Set([changed, true]))
      for (let frame = 0; frame < Math.max(1, frames(anim)); frame++) {
        const hidden = latticeHidden(body, anim, frame, now);
        const dress = dresses.get(hidden.join(' ')) ?? { hidden, anims: [] };
        dresses.set(hidden.join(' '), dress);
        if (!dress.anims.includes(anim)) dress.anims.push(anim);
      }
  return [...dresses.values()];
}

/** Whether a Lattice body blinks where another would hop: the Flicker and the Idol. */
export const latticeBlinks = (body: string): boolean => !!MOVES[body]?.arrive;

/** How far a blinking foe has dissolved, `progress` through its hop: gone at its middle, whole at either end. */
export const blinkShare = (progress: number): number => Math.max(0, Math.min(1, 1 - Math.abs(progress * 2 - 1)));

/** `dress` without `hidden`. */
export function withoutLayers(dress: Dress, hidden: readonly string[]): Dress {
  if (hidden.length === 0) return dress;
  return {
    ...dress,
    outfit: { ...dress.outfit, garments: dress.outfit.garments.filter((layer) => !hidden.includes(layer)) },
  };
}

/** The plain figure a Lattice foe is drawn as while its pictures are not published: a man in a townsman's grey and
 *  brown, his skin the palest, empty-handed. */
export const LATTICE_PLAIN: Dress = {
  ...plainDress('human', 0),
  outfit: {
    ...plainDress('human', 0).outfit,
    dyes: { shirt_long_v: 'Grey', breeches: 'DarkBrown', boots: 'DarkBrown' },
    right: null,
    drawn: false,
  },
};
