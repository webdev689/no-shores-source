import type { GlowLook } from '../elementGlow.ts';
import type { FightEvent } from '../network/messages.ts';
import type { Fired } from '../rules/combatRules.ts';
import type { Block } from '../rules/movementRules.ts';
import type { Fighting } from './fighting.ts';
import { Flashes } from './flashes.ts';
import { type TelegraphMark, marksMesh } from './marks.ts';
import { Sparks } from './sparks.ts';
import { IMPACT_SPARKS, Tracers, othersArrows } from './tracers.ts';

type Point = readonly [number, number, number];

/**
 * What a fight throws up round its fighters, on any page: the struck figures' flashes, the sparks of steel on steel
 * and of shots come to rest, the tracers of every shot, and the marks on the ground of the foes' telegraphed blows.
 */
export class FightEffects {
  readonly flashes = new Flashes();
  /** The element the player's own weapon glows in while drawn, as the page reads it each frame: their blows that land
   *  burst in it, and their shots' tracers and trails take it. */
  ownLook: GlowLook = 0;
  private readonly sparks = new Sparks();
  private readonly tracers = new Tracers();
  /** The seconds the effects have run, which a Volt tracer jumps by. */
  private clock = 0;

  /** Takes the fight's events since the last frame, `seconds` long, and hands them back for the display and the
   *  blood: each struck figure flashes, and each clash throws its sparks from where `fight` has its fighters. */
  events(fight: Fighting, seconds: number): FightEvent[] {
    const events = fight.takeEvents();
    this.clock += seconds;
    this.flashes.update(events, seconds);
    this.sparks.update(seconds);
    const where = (id: number) => {
      const fighter = id === fight.player ? fight.own : (fight.foes.get(id)?.view ?? fight.others.get(id)?.body);
      return fighter ? ([fighter.x, fighter.y, fighter.z] as const) : null;
    };
    this.sparks.struck(events, where, { player: fight.player, look: this.ownLook });
    return events;
  }

  /**
   * The marks to draw from an eye at `eye`, as `marksMesh` lays them from `origin`: every telegraphed blow, everyone
   * else's arrows, the sparks and the tracers. The player's own shots leave the weapon at `muzzleOf`'s point; the
   * tracers run on by `seconds` (none while the fight waits), a shot stopped by `blocks`, the ground or one of
   * `bodies` (their feet) throwing sparks where it comes to rest.
   */
  marks(
    fight: Fighting,
    seconds: number,
    where: {
      readonly eye: Point;
      readonly blocks: readonly Block[];
      readonly bodies: readonly Point[];
      readonly muzzleOf: (shot: Fired) => Point;
      readonly origin?: Point;
      readonly groundAt?: (x: number, y: number) => number | null;
      readonly more?: readonly number[];
    },
  ): Float32Array {
    const telegraphs = [...fight.foes.values()].flatMap((kept): TelegraphMark[] =>
      kept.view.action.kind === 'telegraph' ? [kept.view.action] : [],
    );
    const { eye, blocks, bodies, muzzleOf, origin, groundAt, more = [] } = where;
    this.tracers.fired(fight.fired.splice(0), muzzleOf);
    this.tracers.seen(fight.takeShots(), fight.player);
    for (const impact of this.tracers.update(seconds, blocks, bodies, groundAt))
      this.sparks.burst(impact.at, impact.back, IMPACT_SPARKS);
    const look = this.ownLook;
    if (look) for (const head of this.tracers.ownHeads) this.sparks.trail(head, look, seconds);
    const traced = this.tracers.mesh(eye, fight.shots, fight.player, look, this.clock);
    const arrows = othersArrows(fight.shots, fight.player);
    return marksMesh(telegraphs, arrows, this.sparks.flying, [...traced, ...more], origin);
  }
}
