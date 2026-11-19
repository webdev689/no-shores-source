import type { GlowLook } from '../elementGlow.ts';
import type { FightEvent } from '../network/messages.ts';
import type { Fired } from '../rules/combatRules.ts';
import type { Block } from '../rules/movementRules.ts';
import { blowLook } from './cues.ts';
import type { Fighting } from './fighting.ts';
import { Flashes } from './flashes.ts';
import { foeGlints } from './glints.ts';
import { aimRingMesh } from './casting.ts';
import { Impacts, warmImpactPictures } from './impacts.ts';
import { KillLooks, warmKillPictures } from './killLooks.ts';
import { type TelegraphMark, marksMesh } from './marks.ts';
import { Sparks } from './sparks.ts';
import type { AnimaScreen } from './animaMoment.ts';
import { type Drawn, SpellLooks, castLookOf } from './spellLooks.ts';
import { IMPACT_SPARKS, type Struck, Tracers, othersArrows } from './tracers.ts';

type Point = readonly [number, number, number];

/**
 * What a fight throws up round its fighters, on any page: the struck figures' flashes, the frame each blow lands on
 * and each clash of steel, each kill's look, the sparks of shots come to rest, the tracers of every shot, and the
 * marks on the ground of the foes' telegraphed blows.
 */
export class FightEffects {
  readonly flashes = new Flashes();
  /** The element the player's own weapon glows in while drawn, as the page reads it each frame: their blows that land
   *  burst in it, and their shots' tracers and trails take it. */
  ownLook: GlowLook = 0;
  private readonly sparks = new Sparks();
  private readonly impacts = new Impacts();
  private readonly kills = new KillLooks(this.impacts.bits);
  private readonly tracers = new Tracers();
  private readonly spellLooks = new SpellLooks(this.sparks);
  /** The seconds the effects have run, which a Volt tracer jumps by. */
  private clock = 0;
  /** The marks beyond the fight's own laid each frame, kept from frame to frame so none is made afresh. */
  private readonly more: number[] = [];
  /** What the shots did as the marks were last laid: the player's own let go, and where any stopped. */
  shotsHeard: { readonly fired: readonly Fired[]; readonly struck: readonly Struck[] } = { fired: [], struck: [] };

  constructor() {
    warmImpactPictures();
    warmKillPictures();
  }

  /** Takes the fight's events since the last frame, `seconds` long, and hands them back for the display and the
   *  blood: each struck figure flashes, each blow and clash lands where `fight` has its fighters, and each kill
   *  shows; a foe killed in an element is handed to `dissolve` to dissolve in it. */
  events(fight: Fighting, seconds: number, dissolve?: (id: number, look: GlowLook) => void): FightEvent[] {
    const events = fight.takeEvents();
    this.clock += seconds;
    this.sparks.update(seconds);
    const where = (id: number) => {
      const fighter = id === fight.player ? fight.own : (fight.foes.get(id)?.view ?? fight.others.get(id)?.body);
      return fighter ? ([fighter.x, fighter.y, fighter.z] as const) : null;
    };
    const spellLook = (caster: number) => castLookOf(fight, caster);
    const healthMax = fight.own?.healthMax ?? 0;
    this.flashes.update(events, seconds, { player: fight.player, look: this.ownLook, spellLook, healthMax, where });
    this.spellLooks.struck(events);
    const lookOf = (event: FightEvent) => blowLook(event, { player: fight.player, own: this.ownLook, spellLook });
    const healthOf = (id: number) => (id === fight.player ? healthMax : (fight.foes.get(id)?.view.healthMax ?? null));
    this.impacts.update(events, seconds, { where, lookOf, healthOf });
    const foesBut = (id: number) =>
      [...fight.foes.values()].flatMap(({ id: other, view }) =>
        other !== id && view.action.kind !== 'dead' ? [[view.x, view.y, view.z] as const] : [],
      );
    this.kills.update(events, seconds, { where, lookOf, foesBut, ...(dissolve ? { dissolve } : {}) });
    return events;
  }

  /** The player's own screen as their Anima's release takes it: its edge frame and the view's push in. */
  get anima(): AnimaScreen {
    return this.spellLooks.screen;
  }

  /**
   * The marks to draw from an eye at `eye`, as `marksMesh` lays them from `origin`: every telegraphed blow, everyone
   * else's arrows, the sparks and the tracers. The player's own shots leave the weapon at `muzzleOf`'s point; the
   * tracers run on by `seconds` (none while the fight waits), a shot stopped by `blocks`, the ground or one of
   * `bodies` (their feet) throwing sparks where it comes to rest; Dusk Daggers' ring while it is aimed; and every
   * spell in the room, with the statuses that show on the world, laid at the figures where `drawn` has them; and
   * where blows land and kills fall.
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
      readonly drawn?: Drawn;
    },
  ): Float32Array {
    const telegraphs = [...fight.foes.values()].flatMap((kept): TelegraphMark[] =>
      kept.view.action.kind === 'telegraph' ? [kept.view.action] : [],
    );
    const { eye, blocks, bodies, muzzleOf, origin, groundAt, more = [], drawn = null } = where;
    const fired = fight.fired.splice(0);
    this.tracers.fired(fired, muzzleOf);
    this.tracers.seen(fight.takeShots(), fight.player);
    for (const impact of this.tracers.update(seconds, blocks, bodies, groundAt))
      this.sparks.burst(impact.at, impact.back, IMPACT_SPARKS);
    this.shotsHeard = { fired, struck: this.tracers.struck };
    const look = this.ownLook;
    if (look) for (const head of this.tracers.ownHeads) this.sparks.trail(head, look, seconds);
    const traced = this.tracers.mesh(eye, fight.shots, fight.player, look, this.clock);
    const arrows = othersArrows(fight.shots, fight.player);
    const ring = fight.aimRing ? aimRingMesh(fight.aimRing) : [];
    const spells = this.spellLooks.marks(fight, eye, seconds, this.clock, drawn);
    const glints = foeGlints(fight.foes.values(), eye);
    const laid = this.more;
    laid.length = 0;
    for (const part of [traced, ring, spells, more, glints]) for (const value of part) laid.push(value);
    this.impacts.lay(laid, eye);
    this.kills.lay(laid, eye);
    return marksMesh(telegraphs, arrows, this.sparks.flying, laid, origin);
  }
}
