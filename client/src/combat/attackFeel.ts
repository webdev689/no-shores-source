// The attack feel over a fight, the game's and the Test Ground's alike: the swings' arcs, the hit-stops, the camera's
// kick and the lunge, each at its default here and switched and set in the Test Ground's panel. Only the drawing moves:
// the fight's rules and their clock never do.
import { CameraKick, kicksOf, leanOf } from './cameraKick.ts';
import { EVENT } from './cues.ts';
import { HitStops, heldBack } from './hitStop.ts';
import { lungeOf } from './lunge.ts';
import { type Smear, type Swing, SwingArcs, type Vector, weaponTint } from './swingArcs.ts';
import type { Orbit } from '../editor/orbit.ts';
import type { GlowLook } from '../elementGlow.ts';
import type { FightEvent } from '../network/messages.ts';
import { blowWay } from '../player/playerMoves.ts';
import type { CombatRules } from '../rules/combatRules.ts';
import { type FighterView, STROKE_DIRECTIONS, directionOf } from '../rules/fighters.ts';

/** Each effect on or off, and its sliders: 1 each as made. The weapon's glow shows the gear's own element (`glowLook`
 *  0) or the element chosen in its place. The light is the light layer's: the brightest effects lighting what stands
 *  round them (`LightLayer`). */
export interface Feel {
  readonly arc: boolean;
  readonly arcBrightness: number;
  readonly arcTrail: number;
  readonly stop: boolean;
  readonly stopLength: number;
  readonly kick: boolean;
  readonly kickStrength: number;
  readonly lunge: boolean;
  readonly lungeDistance: number;
  readonly glow: boolean;
  readonly glowLook: number;
  readonly light: boolean;
}

/** The feel as made: what the game plays with, and the Test Ground's panel starts from. */
export const FEEL: Feel = {
  arc: true,
  arcBrightness: 1,
  arcTrail: 1,
  stop: true,
  stopLength: 1,
  kick: true,
  kickStrength: 1,
  lunge: true,
  lungeDistance: 1,
  glow: true,
  glowLook: 0,
  light: true,
};

/** How brightly a blow's arc flares as it meets something, by what came of it: a kill brightest, a block least. */
const ARC_FLARE: Readonly<Record<number, number | undefined>> = {
  [EVENT.hit]: 1,
  [EVENT.killed]: 1.5,
  [EVENT.guardBroken]: 1.2,
  [EVENT.staggered]: 1.1,
  [EVENT.parried]: 0.7,
  [EVENT.blocked]: 0.6,
};
/** Through the eyes, the player's own lunge carries the eye this share as far as it would carry their figure. */
const OWN_LUNGE_EYE = 0.5;
const STILL = { yaw: 0, pitch: 0, ahead: 0, aside: 0, up: 0 } as const;

/** A fighter whose blow may be struck: its number, its view as the rules have it, what its hands hold, and the
 *  element each hand's weapon glows in (none unless said). */
export interface Striker {
  readonly id: number;
  readonly view: FighterView | null;
  readonly right: string | null;
  readonly left: string | null;
  readonly looks?: readonly [GlowLook, GlowLook];
}

/** A fighter's figure as drawn this frame: where its feet are, its move, and whether it is drawn mirrored. */
export interface DrawnFigure {
  readonly feet: Vector;
  readonly anim: string;
  readonly flip: boolean;
}

/** A fight's attack feel, as made or as the Test Ground's panel sets it. */
export class AttackFeel {
  private feel: Feel = FEEL;
  private readonly arcs = new SwingArcs();
  private readonly stops = new HitStops();
  private readonly kick = new CameraKick();
  private readonly rules: CombatRules;
  private readonly tick: number;
  /** The player's own blow's clock last frame, to find the frame it lands in; and what they were doing, as their
   *  action's kind and clock, so their drawing goes back to the rules' clock as that changes. */
  private ownElapsed: number | null = null;
  private ownKind = '';
  private ownClock: number | null = null;
  /** Fighters whose drawing is not this page's to hold (other players, drawn from their own looks). */
  private unheld: ReadonlySet<number> = new Set();

  /** `rules` reach and width each stroke, and a tick is `tickSeconds`. */
  constructor(rules: CombatRules, tickSeconds: number) {
    this.rules = rules;
    this.tick = tickSeconds;
  }

  /** Plays with `feel` from the next frame. */
  set(feel: Feel): void {
    this.feel = feel;
  }

  /** Takes a frame of `seconds`: each blow landing holds its fighters still from the next frame (so its landing is what
   *  holds), flares its arc, and kicks the view of `player` (its fighter `own`) as it lands on or by them; their own
   *  blow leans the view as it lands, met or not. `unheld` are fighters whose drawing is not held. */
  frame(
    events: readonly FightEvent[],
    own: FighterView | null,
    player: number,
    seconds: number,
    unheld: ReadonlySet<number>,
  ): void {
    const { feel } = this;
    this.unheld = unheld;
    this.stops.update(seconds);
    // The player's hands keep their own clock: as what they do changes, or a new swing begins, it goes back to the
    // rules', so a held swing cut short never leaves the next one running ahead.
    const kind = own?.action.kind ?? '';
    const clock = own && 'elapsed' in own.action ? own.action.elapsed : null;
    const anew = clock !== null && this.ownClock !== null && clock < this.ownClock;
    if (kind !== this.ownKind || anew) this.stops.release(player);
    [this.ownKind, this.ownClock] = [kind, clock];
    this.stops.struck(events, feel.stop ? feel.stopLength : 0);
    for (const event of events) {
      const flare = event.kind === EVENT.hit && event.amount <= 0 ? 0 : (ARC_FLARE[event.kind] ?? 0);
      if (flare > 0) this.arcs.struck(event.striker, flare, this.lag(event.striker));
    }
    const attack = own?.action.kind === 'attack' ? own.action : null;
    if (feel.kick) {
      const { pushes, trauma } = kicksOf(events, player);
      for (const push of pushes) this.kick.push(push, feel.kickStrength);
      this.kick.shake(trauma, feel.kickStrength);
      if (attack && this.ownElapsed !== null && this.ownElapsed < attack.strike && attack.elapsed >= attack.strike)
        this.kick.push(leanOf(attack.stroke), feel.kickStrength);
    }
    this.ownElapsed = attack?.elapsed ?? null;
    this.kick.update(seconds);
  }

  /** How far behind the rules a fighter's drawing is held, seconds. */
  private lag(id: number): number {
    return this.unheld.has(id) ? 0 : this.stops.lagOf(id);
  }

  /** What each hand glows in, as the panel has it: the gear's `own` elements, the element chosen in their place, or
   *  nothing. */
  glow(own: readonly [GlowLook, GlowLook]): readonly [GlowLook, GlowLook] {
    const { glow, glowLook } = this.feel;
    const chosen = glowLook === 1 || glowLook === 2 || glowLook === 3 ? glowLook : 0;
    if (!glow) return [0, 0];
    return chosen ? [chosen, chosen] : own;
  }

  /** A fighter's view as its drawing shows it, held back while a blow landing holds it. */
  held(id: number, view: FighterView): FighterView {
    return heldBack(view, this.lag(id) / this.tick);
  }

  /** The seconds a fighter's own drawing moves on this frame of `seconds`. */
  shownSeconds(id: number, seconds: number): number {
    return this.stops.shownSeconds(id, seconds);
  }

  /** How far a fighter's figure is driven into its blow, as its drawing shows the blow. */
  private lunge(id: number, view: FighterView | null): { readonly ahead: number; readonly down: number } {
    const action = view && this.held(id, view).action;
    if (!this.feel.lunge || action?.kind !== 'attack') return { ahead: 0, down: 0 };
    const { tick } = this;
    return lungeOf(
      action.stroke,
      action.elapsed * tick,
      action.strike * tick,
      action.end * tick,
      this.feel.lungeDistance,
    );
  }

  /** `orbit` kicked as the fight's blows land, and through the eyes (`eyes`) carried with `player`'s own lunge. While
   *  a crosshair shows (`aiming`), the kick moves the view but never turns it, so the crosshair stays where shots land. */
  camera<Seen extends Orbit>(
    orbit: Seen,
    player: number,
    own: FighterView | null,
    eyes: boolean,
    aiming: boolean,
  ): Seen {
    const push = this.feel.kick ? this.kick.now : STILL;
    const lunge = eyes ? this.lunge(player, own).ahead * OWN_LUNGE_EYE : 0;
    const turn = aiming ? { yaw: 0, pitch: 0 } : {};
    return this.kick.kicked(orbit, { ...push, ...turn, ahead: push.ahead + lunge });
  }

  /** Where a fighter's figure is drawn off where it stands: driven along its aim into its blow, and shuddered across a
   *  view turned `yaw` while a blow it took holds it. */
  shift(id: number, view: FighterView | null, yaw: number): Vector {
    const lunge = this.lunge(id, view);
    const aim = view?.aim ?? 0;
    const shudder = this.stops.shudderOf(id);
    return [
      Math.sin(aim) * lunge.ahead + Math.cos(yaw) * shudder,
      -Math.cos(aim) * lunge.ahead + Math.sin(yaw) * shudder,
      -lunge.down,
    ];
  }

  /** The vertices of every blow's arc at `clock`, seen from `eye`: each striker's blow being struck begins or follows
   *  its arc, at its figure in `drawn`, going the way that figure is drawn swinging it: a blow the way the forge draws
   *  it, any other move the way the rules struck it. Through the eyes (`eyes`) none is drawn. */
  arcsMesh(
    clock: number,
    strikers: readonly Striker[],
    drawn: ReadonlyMap<number, DrawnFigure>,
    eye: Vector,
    eyes: boolean,
    origin: Vector = [0, 0, 0],
  ): Float32Array {
    const { tick } = this;
    const swung: Swing[] = [];
    for (const { id, view, right, left, looks } of eyes ? [] : strikers) {
      const action = view?.action;
      const figure = drawn.get(id);
      if (!view || !figure || action?.kind !== 'attack') continue;
      // A blow is drawn in the right hand; a pair's side cut with its right blade.
      const blow = blowWay(figure.anim);
      const way = blow ?? directionOf(action.stroke);
      swung.push({
        id,
        stroke: action.stroke,
        elapsed: action.elapsed * tick,
        strike: action.strike * tick,
        end: action.end * tick,
        reach: this.rules.strokeReach(view.arms, action.stroke),
        halfArc: this.rules.strokeArc(STROKE_DIRECTIONS.indexOf(way) + 1),
        aim: view.aim,
        way,
        leftHand: blow ? false : action.leftHand,
        mirrored: figure.flip,
        special: action.swing !== 'plain',
        tint: weaponTint(action.leftHand ? left : right),
        look: looks?.[action.leftHand ? 1 : 0] ?? 0,
        arms: view.arms,
      });
    }
    this.arcs.seen(clock, swung, (id) => drawn.get(id)?.feet ?? null);
    const look = { brightness: this.feel.arc && !eyes ? this.feel.arcBrightness : 0, trail: this.feel.arcTrail };
    return this.arcs.mesh(eye, look, (id) => this.lag(id), origin);
  }

  /** The smear behind a striker's card as its strike is first drawn, for an eye whose right is `right`; none while the
   *  arcs are off. */
  smearOf(id: number, right: readonly [number, number]): Smear | null {
    return this.feel.arc ? this.arcs.smearOf(id, right, this.lag(id)) : null;
  }
}
