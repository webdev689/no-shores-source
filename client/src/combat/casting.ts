// Casting from the keyboard: the Anima on F, the Tenets on Q and C, each cast only once the room's word says it is
// ready and the player may act; Dusk Daggers aimed while its key is held, a ring on the ground where it will whirl,
// and cast as the key is let go. The room decides: a cast it refuses costs nothing, and the bar shows its word.
import arts from '../../../content/arts/arts.json' with { type: 'json' };
import { type GlowElement, glowRampAt } from '../elementGlow.ts';
import { type ArtState, type CastAsk, SPELLS, spellNumber } from '../network/artMessages.ts';
import type { InputFrame } from '../player/input.ts';
import type { FighterView } from '../rules/fighters.ts';
import type { AbilityState } from './abilityBar.ts';
import { MARK_FLOATS } from './marks.ts';

type Point = readonly [number, number, number];

/** The keys' actions, in their abilities' order: the Anima, then each Tenet. */
export const ABILITY_ACTIONS = ['anima', 'tenetOne', 'tenetTwo'] as const;
/** Dusk Daggers' ability: Shadow's first Tenet. */
export const DAGGERS = 1;
/** After a cast is sent, none is sent again for this long (seconds): the room's word on it comes back first. */
export const CAST_LOCKOUT_S = 0.6;
/** What a fighter is doing that no cast starts from, as the room has it: staggered (a Charge with it), down, dead. */
const UNABLE = new Set(['staggered', 'down', 'dead']);
/** The ring's edge's width (metres), its fill's and its edge's opacity, the steps it is drawn in, and how far over
 *  the ground it lies. */
const RING_EDGE_M = 0.1;
const RING_FILL = 0.16;
const RING_EDGE = 0.85;
const RING_STEPS = 48;
const RING_LIFT = 0.04;

/** Dusk Daggers aimed: the middle of the ring where they will whirl, its radius, and its Art's element. */
export interface AimRing {
  readonly at: Point;
  readonly radius: number;
  readonly element: GlowElement;
}

const artOf = (id: number) => arts.arts.find((art) => art.id === id);

/** Whether a fragment, by its key, is set in the worn Art's Core. */
export function coreHolds(state: ArtState, key: string): boolean {
  const art = artOf(state.art);
  const place = art?.core.findIndex((fragment) => fragment.key === key) ?? -1;
  return place >= 0 && (state.cores[state.art - 1] ?? []).includes(place);
}

/** The Arts as the bar shows them at room tick `tick`: the room's word `taken` at `takenAt`, each share run on by its
 *  recharge since, as the room charges it; null before the room's first word. */
export function abilitiesAt(taken: ArtState | null | undefined, takenAt: number, tick: number): AbilityState | null {
  if (!taken) return null;
  const art = artOf(taken.art);
  const seconds = Math.max(0, tick - takenAt) / 60;
  const runOn = (share: number, rechargeS: number | undefined) =>
    rechargeS ? Math.min(1, share + seconds / rechargeS) : share;
  const [first, second] = art?.tenets ?? [];
  return {
    art: taken.art,
    animaShare: runOn(taken.anima, art?.anima.rechargeS),
    tenets: [runOn(taken.tenets[0], first?.rechargeS), runOn(taken.tenets[1], second?.rechargeS)],
  };
}

/** Where Dusk Daggers aimed from `from` at `mark` whirl: the mark, drawn in across the ground to `reach`; with none,
 *  straight along the look at its reach. */
export function daggersAim(from: Point, yaw: number, mark: Point | null, reach: number): Point {
  const wanted: Point = mark ?? [from[0] + Math.sin(yaw) * reach, from[1] - Math.cos(yaw) * reach, from[2]];
  const far = Math.hypot(wanted[0] - from[0], wanted[1] - from[1]);
  if (far <= reach) return wanted;
  const share = reach / far;
  return [from[0] + (wanted[0] - from[0]) * share, from[1] + (wanted[1] - from[1]) * share, mark ? from[2] : wanted[2]];
}

/** Dusk Daggers' ring on the ground, as the marks' vertices (`marksMesh`'s `more`): a faint disc edged in its
 *  element. */
export function aimRingMesh(ring: AimRing): number[] {
  const out: number[] = [];
  const [x, y, z] = ring.at;
  const colour = glowRampAt(ring.element, 0.35);
  const point = (radius: number, step: number) => {
    const angle = (step / RING_STEPS) * Math.PI * 2;
    return [x + Math.cos(angle) * radius, y + Math.sin(angle) * radius, z + RING_LIFT];
  };
  const band = (inner: number, outer: number, opacity: number) => {
    for (let step = 0; step < RING_STEPS; step += 1) {
      const corners = [point(inner, step), point(outer, step), point(outer, step + 1), point(inner, step + 1)];
      for (const corner of [0, 1, 2, 0, 2, 3]) out.push(...(corners[corner] ?? []), ...colour, opacity);
    }
  };
  band(0, ring.radius - RING_EDGE_M, RING_FILL);
  band(ring.radius - RING_EDGE_M, ring.radius, RING_EDGE);
  return out.length % MARK_FLOATS === 0 ? out : [];
}

/** What a frame of casting asks: the cast to send (none for none), and Dusk Daggers' ring while it is aimed. */
export interface CastFrame {
  readonly cast: CastAsk | null;
  readonly ring: AimRing | null;
}

/** The casting keys, frame by frame: a press casts its ability once the room's word has it ready; Dusk Daggers' key
 *  held aims its ring, and let go casts it there. */
export class CastKeys {
  private lockout = 0;
  private aimed: Point | null = null;

  /** One frame, `seconds` long: the keys taken only while `hands` (the pointer held, the player on foot and free);
   *  `state` the room's word on the Arts, `abilities` as the bar shows them now; the ring laid on `markOf`'s point (the
   *  crosshair's) from where `own` stands, looking along `yaw`. */
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
    }: {
      hands: boolean;
      state: ArtState | null | undefined;
      abilities: AbilityState | null;
      own: FighterView | null;
      yaw: number;
      markOf: () => Point | null;
    },
  ): CastFrame {
    this.lockout = Math.max(0, this.lockout - seconds);
    const art = state && artOf(state.art);
    const element = art?.element;
    const glows = element === 1 || element === 2 || element === 3;
    if (!hands || !state || !art || !abilities || !own || !glows || UNABLE.has(own.action.kind)) {
      this.aimed = null;
      return { cast: null, ring: null };
    }
    if (this.aimed) return this.aim(controls, state, own, yaw, markOf(), element);
    const shares = [abilities.animaShare, ...abilities.tenets];
    const ability = ABILITY_ACTIONS.findIndex((action, index) => controls.pressed(action) && (shares[index] ?? 0) >= 1);
    if (ability < 0 || this.lockout > 0) return { cast: null, ring: null };
    const spell = spellNumber(art.id, ability);
    if (spell === SPELLS.duskDaggers) {
      this.aimed = [own.x, own.y, own.z];
      return this.aim(controls, state, own, yaw, markOf(), element);
    }
    this.lockout = CAST_LOCKOUT_S;
    return { cast: { spell, aim: null }, ring: null };
  }

  /** Dusk Daggers aimed: its ring where the mark is, drawn in to its reach, while its key is held; let go, cast
   *  there. */
  private aim(
    controls: InputFrame,
    state: ArtState,
    own: FighterView,
    yaw: number,
    mark: Point | null,
    element: GlowElement,
  ): CastFrame {
    const def: { readonly key: string; readonly reach?: number; readonly radius?: number } | undefined = artOf(
      state.art,
    )?.tenets[DAGGERS - 1];
    const reach = def?.reach ?? 0;
    const radius = (def?.radius ?? 0) + this.blades(state);
    const spot = daggersAim([own.x, own.y, own.z], yaw, mark, reach);
    if (controls.held(ABILITY_ACTIONS[DAGGERS])) {
      this.aimed = spot;
      return { cast: { spell: 0, aim: spot }, ring: { at: spot, radius, element } };
    }
    this.aimed = null;
    this.lockout = CAST_LOCKOUT_S;
    return { cast: { spell: SPELLS.duskDaggers, aim: spot }, ring: null };
  }

  /** How much further the ring reaches with Blades in the Core (metres). */
  private blades(state: ArtState): number {
    const blades: { readonly key: string; readonly moreRadius?: number } | undefined = artOf(state.art)?.core.find(
      (fragment) => fragment.key === 'blades',
    );
    return coreHolds(state, 'blades') ? (blades?.moreRadius ?? 0) : 0;
  }
}
