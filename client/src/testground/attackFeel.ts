// The attack feel over the Test Ground's fight: the swings' arcs, the hit-stops, the camera's kick and the lunge, each
// switched and set in the panel's Attack feel. Only the drawing moves: the fight's rules and their clock never do.
import { CameraKick, kicksOf, leanOf } from '../combat/cameraKick.ts';
import { EVENT } from '../combat/cues.ts';
import { HitStops, heldBack } from '../combat/hitStop.ts';
import { lungeOf } from '../combat/lunge.ts';
import { type Swing, SwingArcs, type Vector, weaponTint } from '../combat/swingArcs.ts';
import type { Orbit } from '../editor/orbit.ts';
import type { FightEvent } from '../network/messages.ts';
import type { CombatRules } from '../rules/combatRules.ts';
import type { FighterView } from '../rules/fighters.ts';
import { FEEL, type Feel, startFeelPanel } from './feelPanel.ts';

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

/** A fighter whose blow may be struck: its number, its view as the rules have it, what its hands hold, and whether it
 *  is seen through its own eyes. */
export interface Striker {
  readonly id: number;
  readonly view: FighterView | null;
  readonly right: string | null;
  readonly left: string | null;
  readonly eyes?: boolean;
}

/** The Test Ground's attack feel, as its panel sets it. */
export class AttackFeel {
  private feel: Feel = FEEL;
  private readonly arcs = new SwingArcs();
  private readonly stops = new HitStops();
  private readonly kick = new CameraKick();
  private readonly rules: CombatRules;
  private readonly tick: number;
  /** The player's own blow's clock last frame, to find the frame it lands in. */
  private ownElapsed: number | null = null;

  /** Adds the feel's panel to `panel`; `rules` reach and width each stroke, and a tick is `tickSeconds`. */
  constructor(panel: HTMLElement, rules: CombatRules, tickSeconds: number) {
    this.rules = rules;
    this.tick = tickSeconds;
    startFeelPanel(panel, (set) => {
      this.feel = set;
    });
  }

  /** Takes a frame of `seconds`: each blow landing holds its fighters still, flares its arc, and kicks the view of
   *  `player` (its fighter `own`) as it lands on or by them; their own blow leans the view as it lands, met or not.
   *  `clock` is the page's. */
  frame(events: readonly FightEvent[], own: FighterView | null, player: number, clock: number, seconds: number): void {
    const { feel } = this;
    this.stops.struck(events, feel.stop ? feel.stopLength : 0);
    this.stops.update(seconds);
    for (const event of events) {
      const flare = event.kind === EVENT.hit && event.amount <= 0 ? 0 : (ARC_FLARE[event.kind] ?? 0);
      if (flare > 0) this.arcs.struck(event.striker, flare, clock, this.stops.lagOf(event.striker));
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

  /** A fighter's view as its drawing shows it, held back while a blow landing holds it. */
  held(id: number, view: FighterView): FighterView {
    return heldBack(view, this.stops.lagOf(id) / this.tick);
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

  /** `orbit` kicked as the fight's blows land, and through the eyes (`eyes`) carried with `player`'s own lunge. */
  camera<Seen extends Orbit>(orbit: Seen, player: number, own: FighterView | null, eyes: boolean): Seen {
    const push = this.feel.kick ? this.kick.now : STILL;
    const lunge = eyes ? this.lunge(player, own).ahead * OWN_LUNGE_EYE : 0;
    return this.kick.kicked(orbit, { ...push, ahead: push.ahead + lunge });
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
   *  its arc, at its feet as `feet` has them drawn. */
  arcsMesh(clock: number, strikers: readonly Striker[], feet: ReadonlyMap<number, Vector>, eye: Vector): Float32Array {
    const { tick } = this;
    const swung: Swing[] = [];
    for (const { id, view, right, left, eyes } of strikers) {
      const action = view?.action;
      if (!view || action?.kind !== 'attack') continue;
      swung.push({
        id,
        stroke: action.stroke,
        elapsed: action.elapsed * tick,
        strike: action.strike * tick,
        end: action.end * tick,
        reach: this.rules.strokeReach(view.arms, action.stroke),
        halfArc: this.rules.strokeArc(action.stroke),
        aim: view.aim,
        leftHand: action.leftHand,
        special: action.swing !== 'plain',
        tint: weaponTint(action.leftHand ? left : right),
        firstPerson: eyes ?? false,
      });
    }
    this.arcs.seen(clock, swung, (id) => feet.get(id) ?? null);
    const look = { brightness: this.feel.arc ? this.feel.arcBrightness : 0, trail: this.feel.arcTrail };
    return this.arcs.mesh(clock, eye, look, (id) => this.stops.lagOf(id));
  }
}
