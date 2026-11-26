// Casting from the keyboard: the Anima on R, the Tenets on Q and G, each cast only once its road has earned it, the
// room's word says it is ready and the player may act; Dusk Daggers aimed while its key is held, a ring on the ground
// where it will whirl, and cast as the key is let go. The room decides: a cast it refuses costs nothing, and the bar
// shows its word.
import arts from '../../../content/arts/arts.json' with { type: 'json' };
import type { GlowElement } from '../elementGlow.ts';
import { ALL_EARNED, type ArtState, type CastAsk, SPELLS, earnedOf, spellNumber } from '../network/artMessages.ts';
import type { InputFrame } from '../player/input.ts';
import type { FighterView } from '../rules/fighters.ts';
import type { AbilityState } from './abilityBar.ts';
import { runeRing } from './spellLines.ts';
import { Laid } from './spellPixels.ts';

type Point = readonly [number, number, number];

/** The keys' actions, in their abilities' order: the Anima, then each Tenet. */
export const ABILITY_ACTIONS = ['anima', 'tenetOne', 'tenetTwo'] as const;
/** Dusk Daggers' ability: Shadow's first Tenet. */
export const DAGGERS = 1;
/** After a cast is sent, none is sent again until the room's word shows it spent (its ability's share under full) or
 *  another Art worn; past this long (seconds) the keys open again all the same, as a cast the room let fall sends no
 *  word. */
export const CAST_LOCKOUT_MOST_S = 2;
/** What a fighter is doing that no cast starts from, as the room has it: staggered (a Charge with it), down,
 *  drinking, dead. */
export const UNABLE: ReadonlySet<string> = new Set(['staggered', 'down', 'drink', 'dead']);
/** The spell a Lodestone's grounding is asked with: the room grounds it for its bearer whatever Art's key is cast
 *  (crates/room/src/arts.rs `ask_cast`), so any will do. */
export const GROUND_SPELL = 1;

/** Dusk Daggers aimed: the middle of the ring where they will whirl, its radius, and its Art's element. */
export interface AimRing {
  readonly at: Point;
  readonly radius: number;
  readonly element: GlowElement;
}

const artOf = (id: number) => arts.arts.find((art) => art.id === id);
const glowing = (element: number | undefined): element is GlowElement =>
  element === 1 || element === 2 || element === 3;

/** Whether a fragment, by its key, is set in the worn Art's Core. */
export function coreHolds(state: ArtState, key: string): boolean {
  const art = artOf(state.art);
  const place = art?.core.findIndex((fragment) => fragment.key === key) ?? -1;
  return place >= 0 && (state.cores[state.art - 1] ?? []).includes(place);
}

/** The Arts as the bar shows them at room tick `tick`: the room's word `taken` at `takenAt`, each share run on by its
 *  recharge since, as the room charges it, with what the worn Art's road has earned; null before the room's first
 *  word. */
export function abilitiesAt(taken: ArtState | null | undefined, takenAt: number, tick: number): AbilityState | null {
  const art = taken && artOf(taken.art);
  // None worn (the prologue's player has none): no bar to show.
  if (!taken || !art) return null;
  // Seconds as the room counts its recharge: fewer under a run's Trickle.
  const seconds = Math.max(0, tick - takenAt) / 60 / (taken.recharge ?? 1);
  const runOn = (share: number, rechargeS: number | undefined) =>
    rechargeS ? Math.min(1, share + seconds / rechargeS) : share;
  const [first, second] = art.tenets;
  return {
    art: taken.art,
    animaShare: runOn(taken.anima, art.anima.rechargeS),
    tenets: [runOn(taken.tenets[0], first?.rechargeS), runOn(taken.tenets[1], second?.rechargeS)],
    // A horde running lends the worn Art whole: every ability on the bar and the keys.
    earned: taken.lent ? ALL_EARNED : earnedOf(taken, taken.art),
    recharge: taken.recharge ?? 1,
  };
}

/** Where Dusk Daggers aimed from `from` at `mark` are asked to whirl: the mark as it is, or with none, straight
 *  along the look at their reach. The room draws it in and lays it on the ground. */
export function daggersAsked(from: Point, yaw: number, mark: Point | null, reach: number): Point {
  return mark ?? [from[0] + Math.sin(yaw) * reach, from[1] - Math.cos(yaw) * reach, from[2]];
}

/** Where Dusk Daggers asked at `asked` from `from` whirl, as the room lays them: drawn in across the ground to
 *  `reach`, on the ground's height there (`floorAt`). */
export function daggersAim(from: Point, asked: Point, reach: number, floorAt: (x: number, y: number) => number): Point {
  const far = Math.hypot(asked[0] - from[0], asked[1] - from[1]);
  const share = far <= reach ? 1 : reach / far;
  const [x, y] = [from[0] + (asked[0] - from[0]) * share, from[1] + (asked[1] - from[1]) * share];
  return [x, y, floorAt(x, y)];
}

const AIMED = new Laid();

/** Dusk Daggers' ring on the ground, as the marks' vertices (`marksMesh`'s `more`): the rune ring it will whirl over,
 *  in its element. The answer is kept and laid over by the next call. */
export function aimRingMesh(ring: AimRing): number[] {
  AIMED.clear();
  runeRing(AIMED, ring.at, ring.radius, ring.element);
  return AIMED.laid();
}

/** What a frame of casting asks: the cast to send (none for none), and Dusk Daggers' ring while it is aimed; a
 *  grounding of the Lodestone (`grounds`) is no spell, and plays none. */
export interface CastFrame {
  readonly cast: CastAsk | null;
  readonly ring: AimRing | null;
  readonly grounds?: boolean;
}

/** The casting keys, frame by frame: a press casts its ability once the room's word has it ready; Dusk Daggers' key
 *  held aims its ring, and let go casts it there. */
export class CastKeys {
  /** The last cast sent: the Art it was cast in, its ability, and the seconds since. */
  private sent: { readonly art: number; readonly ability: number; seconds: number } | null = null;
  private aiming = false;

  /** Forgets the last cast sent and any aim: the player joined a room afresh. */
  reset(): void {
    [this.sent, this.aiming] = [null, false];
  }

  /** One frame, `seconds` long: the keys taken only while `hands` (the pointer held, the player on foot and free);
   *  `state` the room's word on the Arts, `abilities` as the bar shows them now; the ring laid on `markOf`'s point (the
   *  crosshair's) from where `own` stands, looking along `yaw`, on the ground `floorAt` gives. While the player bears
   *  the Lodestone (`bearer`), any Art's key asks to ground it once it is charged, and nothing else. */
  frame(
    controls: InputFrame,
    seconds: number,
    {
      hands,
      state,
      abilities,
      own,
      yaw,
      markOf,
      floorAt,
      bearer = null,
    }: {
      hands: boolean;
      state: ArtState | null | undefined;
      abilities: AbilityState | null;
      own: FighterView | null;
      yaw: number;
      markOf: () => Point | null;
      floorAt: (x: number, y: number) => number;
      bearer?: { readonly charged: boolean } | null;
    },
  ): CastFrame {
    this.waited(state, abilities, seconds);
    if (bearer) {
      this.aiming = false;
      const able = hands && !!own && !UNABLE.has(own.action.kind);
      const pressed = ABILITY_ACTIONS.some((action) => controls.pressed(action));
      const cast = able && pressed && bearer.charged ? { spell: GROUND_SPELL, aim: null } : null;
      return { cast, ring: null, grounds: true };
    }
    const art = state && artOf(state.art);
    const element = art?.element;
    const unable = !hands || !state || !art || !abilities || !own || UNABLE.has(own.action.kind);
    if (unable || !glowing(element)) {
      this.aiming = false;
      return { cast: null, ring: null };
    }
    const aimed = { state, own, yaw, mark: markOf(), element, floorAt };
    if (this.aiming) return this.aim(controls, aimed);
    const shares = [abilities.animaShare, ...abilities.tenets];
    // An ability its road has not earned is neither sent nor aimed: the room would refuse it.
    const earned = (index: number) => ((abilities.earned ?? 0b111) & (1 << index)) !== 0;
    const ability = ABILITY_ACTIONS.findIndex(
      (action, index) => controls.pressed(action) && (shares[index] ?? 0) >= 1 && earned(index),
    );
    if (ability < 0 || this.sent) return { cast: null, ring: null };
    const spell = spellNumber(art.id, ability);
    if (spell === SPELLS.duskDaggers) {
      this.aiming = true;
      return this.aim(controls, aimed);
    }
    this.sent = { art: art.id, ability, seconds: 0 };
    return { cast: { spell, aim: null }, ring: null };
  }

  /** Whether a cast is under way: sent and not yet answered, or Dusk Daggers aimed. A drink waits for it. */
  get waiting(): boolean {
    return this.sent !== null || this.aiming;
  }

  /** Runs the wait after a cast on by `seconds`, and ends it once the room's word shows the cast spent (its ability's
   *  share in `abilities` under full) or another Art worn, or the longest wait is over. Any other word the room sends
   *  meanwhile (a gear change, a kill's charge) leaves it waiting. */
  private waited(state: ArtState | null | undefined, abilities: AbilityState | null, seconds: number): void {
    if (!this.sent) return;
    this.sent.seconds += seconds;
    const shares = abilities ? [abilities.animaShare, ...abilities.tenets] : [];
    const spent = (shares[this.sent.ability] ?? 1) < 1;
    const changed = !!state && state.art !== this.sent.art;
    if (spent || changed || this.sent.seconds >= CAST_LOCKOUT_MOST_S) this.sent = null;
  }

  /** Dusk Daggers aimed from where `own` stands: the mark asked as it is while the key is held, the ring drawn where
   *  the room will lay it; let go, cast there. */
  private aim(
    controls: InputFrame,
    {
      state,
      own,
      yaw,
      mark,
      element,
      floorAt,
    }: {
      state: ArtState;
      own: FighterView;
      yaw: number;
      mark: Point | null;
      element: GlowElement;
      floorAt: (x: number, y: number) => number;
    },
  ): CastFrame {
    const def: { readonly key: string; readonly reach?: number; readonly radius?: number } | undefined = artOf(
      state.art,
    )?.tenets[DAGGERS - 1];
    const reach = def?.reach ?? 0;
    const radius = (def?.radius ?? 0) + this.blades(state);
    const from: Point = [own.x, own.y, own.z];
    const asked = daggersAsked(from, yaw, mark, reach);
    if (controls.held(ABILITY_ACTIONS[DAGGERS])) {
      const ring = { at: daggersAim(from, asked, reach, floorAt), radius, element };
      return { cast: { spell: 0, aim: asked }, ring };
    }
    this.aiming = false;
    this.sent = { art: state.art, ability: DAGGERS, seconds: 0 };
    return { cast: { spell: SPELLS.duskDaggers, aim: asked }, ring: null };
  }

  /** How much further the ring reaches with Blades in the Core (metres). */
  private blades(state: ArtState): number {
    const blades: { readonly key: string; readonly moreRadius?: number } | undefined = artOf(state.art)?.core.find(
      (fragment) => fragment.key === 'blades',
    );
    return coreHolds(state, 'blades') ? (blades?.moreRadius ?? 0) : 0;
  }
}
