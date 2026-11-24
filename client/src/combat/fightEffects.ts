import type { GlowLook } from '../elementGlow.ts';
import type { FightEvent } from '../network/messages.ts';
import type { Fired } from '../rules/combatRules.ts';
import type { Block } from '../rules/movementRules.ts';
import { blowLook } from './cues.ts';
import type { Fighting } from './fighting.ts';
import { Flashes } from './flashes.ts';
import { type Boosting, HoofDust } from './hoofDust.ts';
import { foeGlints } from './glints.ts';
import { aimRingMesh } from './casting.ts';
import { Impacts, warmImpactPictures } from './impacts.ts';
import { KillLooks, warmKillPictures } from './killLooks.ts';
import { MARK_FLOATS, type TelegraphMark, marksMesh } from './marks.ts';
import { Sparks } from './sparks.ts';
import type { AnimaScreen } from './animaMoment.ts';
import { type Drawn, SpellLooks, castLookOf } from './spellLooks.ts';
import { IMPACT_SPARKS, type Struck, Tracers, othersArrows } from './tracers.ts';
import { shotBodies } from '../player/crosshair.ts';

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
  /** The dust the player's horse throws as its boost runs. */
  private readonly hooves = new HoofDust();
  /** The seconds the effects have run, which a Volt tracer jumps by. */
  private clock = 0;
  /** The marks beyond the fight's own laid each frame, kept from frame to frame so none is made afresh. */
  private readonly more: number[] = [];
  /** Every mark as last laid, measured from its origin, grown to the most yet: what `marks` hands back. */
  private mesh = new Float32Array(0);
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
   * where blows land and kills fall; and the dust the `rider`'s horse throws as it boosts. The marks are handed back in the effects' own array, good until the next frame's.
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
      readonly rider?: Boosting;
    },
  ): Float32Array {
    // A companion's telegraphed blows threaten no player: only foes' are marked.
    const telegraphs = [...fight.foes.values()].flatMap((kept): TelegraphMark[] =>
      kept.view.action.kind === 'telegraph' && kept.view.side === 'foes' ? [kept.view.action] : [],
    );
    const { eye, blocks, bodies, muzzleOf, origin, groundAt, more = [], drawn = null, rider } = where;
    if (rider) this.hooves.frame(rider, where, seconds);
    const fired = fight.fired.splice(0);
    this.tracers.fired(fired, muzzleOf);
    this.tracers.seen(fight.takeShots(), fight.player);
    // The player's own arrows fly as the room flies them: past the dead and their own side.
    const targets = drawn ? shotBodies(drawn.foes, fight.foes) : bodies;
    for (const impact of this.tracers.update(seconds, blocks, bodies, groundAt, targets))
      this.sparks.burst(impact.at, impact.back, IMPACT_SPARKS);
    this.shotsHeard = { fired, struck: this.tracers.struck };
    const look = this.ownLook;
    if (look) for (const head of this.tracers.ownHeads) this.sparks.trail(head, look, seconds);
    const traced = this.tracers.mesh(eye, fight.shots, fight.player, look, this.clock);
    const arrows = othersArrows(fight.shots, fight.player);
    const ring = fight.aimRing ? aimRingMesh(fight.aimRing) : [];
    const spells = this.spellLooks.marks(fight, eye, seconds, this.clock, drawn);
    const glints = foeGlints(fight.foes.values(), eye);
    // Written over from the front and cut to its count: emptied, a list lets its room go and grows again each frame.
    const laid = this.more;
    let count = 0;
    for (const part of [traced, ring, spells, more, glints]) for (const value of part) laid[count++] = value;
    if (laid.length !== count) laid.length = count;
    this.impacts.lay(laid, eye);
    this.kills.lay(laid, eye);
    this.hooves.lay(laid, eye);
    const own = marksMesh(telegraphs, arrows, this.sparks.flying, [], origin);
    const total = own.length + laid.length;
    if (this.mesh.length < total) this.mesh = new Float32Array(2 ** Math.ceil(Math.log2(total)));
    this.mesh.set(own);
    for (let value = 0; value < laid.length; value++) {
      const axis = value % MARK_FLOATS;
      this.mesh[own.length + value] = (laid[value] ?? 0) - (axis < 3 ? (origin?.[axis] ?? 0) : 0);
    }
    return this.mesh.subarray(0, total);
  }
}
