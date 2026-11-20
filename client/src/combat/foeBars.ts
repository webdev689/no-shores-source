import { BarLayout, PLATES } from '../plus/barLayout.ts';
import { motionReduced } from '../plus/kit.ts';
import type { FighterView } from '../rules/fighters.ts';
import { BOSS_RANK } from '../rules/roster.ts';
import { FoePlate, type MarkedFoe, OVERHEAD_SIZES, plateTier } from './foePlate.ts';
import type { Box } from './hitWords.ts';
import { element, setStyle, showNode } from './meter.ts';
import { aimedFoe, coneStep, coneWant, offDegrees, PLATE_RANGE_M, PlateSight, plateScale } from './plateSight.ts';

export type { MarkedFoe } from './foePlate.ts';

const ALERT = { suspicious: 1, alert: 2, searching: 3 } as const;
/** How long a foe that turns alert shows its "!", in seconds. */
export const ALERT_MARK_SECONDS = 1;

/** The mark of a foe's alert state over its name: nothing while idle, "?" while suspicious or searching, "!" for a
 *  moment once it turns alert (`sinceAlert` seconds ago), then nothing while it fights. */
export function alertMark(alert: number, sinceAlert: number): '' | '?' | '!' {
  if (alert === ALERT.suspicious || alert === ALERT.searching) return '?';
  return alert === ALERT.alert && sinceAlert < ALERT_MARK_SECONDS ? '!' : '';
}

/** The Boss in the fight: the nearest to `near` of the living Boss foes that are alert or have been struck. */
export function bossInFight(
  foes: readonly MarkedFoe[],
  near: { readonly x: number; readonly y: number } | null,
): MarkedFoe | null {
  const apart = (foe: MarkedFoe) => (near ? Math.hypot(foe.view.x - near.x, foe.view.y - near.y) : 0);
  const fighting = foes.filter(
    (foe) =>
      foe.rank === BOSS_RANK &&
      foe.view.action.kind !== 'dead' &&
      (foe.alert === ALERT.alert || foe.view.health < foe.view.healthMax),
  );
  return fighting.reduce<MarkedFoe | null>((best, foe) => (best && apart(best) <= apart(foe) ? best : foe), null);
}

/** Where the boss bar marks its health, as shares of the whole: where its phases change. */
export const PHASE_MARKS: readonly number[] = [2 / 3, 1 / 3];

/** What the boss bar shows of a Boss: its name and faction, its health's share, and its phase, 1 to 3. */
export function bossBarOf(foe: MarkedFoe): { title: string; faction: string; share: number; phase: string } {
  const phase = Math.min(3, Math.max(1, foe.phase));
  const share = Math.max(0, Math.min(1, foe.view.health / Math.max(1, foe.view.healthMax)));
  return { title: foe.name, faction: foe.faction, share, phase: `Phase ${phase} of 3` };
}

/** How the plates over figures are seen this frame: the camera (its eye, the way it looks and its focal length; null
 *  when its matrix says none), whether the line between two points is blocked, how much the fight holds a foe's plate
 *  wherever the player looks (1 down to 0, `FoeTarget.foughtShare`), and the foe the soft lock holds, if any. */
export interface PlateViewing {
  readonly camera: {
    readonly eye: readonly [number, number, number];
    readonly forward: readonly [number, number, number];
    readonly focal: number;
  } | null;
  readonly blocked: (from: readonly [number, number, number], to: readonly [number, number, number]) => boolean;
  readonly fought: (id: number) => number;
  readonly locked: number | null;
}

/** How high a foe's head stands over its feet, in metres: where its plate's sight and angle are read. */
const HEAD_M = 1.8;

/** Over a living foe its plate, shown for the one nearest the crosshair, the one locked and those fought lately, laid
 *  so none covers another, and under the compass the boss bar of the Boss in the fight, who shows none over its head. */
export class FoeBars {
  readonly boss: FoePlate;
  private readonly hud: HTMLElement;
  private readonly over: HTMLElement;
  private readonly overheads = new Map<number, FoePlate>();
  private readonly layout = new BarLayout();
  private readonly sight = new PlateSight();
  /** How much of each plate the cone shows, as last drawn. */
  private readonly cones = new Map<number, number>();
  /** The foe the cone showed last frame. */
  private aimed: number | null = null;
  /** The columns the plates over figures stand in this frame, each as wide as its plate from its foot up, which the
   *  blows' words keep clear of. */
  columns: readonly Box[] = [];
  /** Each foe's alert state as last seen, and the seconds since it last turned alert. */
  private readonly alerts = new Map<number, { alert: number; since: number }>();

  /** Over figures in `over`, the boss bar in `column`; `hud` is marked while a Boss fights. */
  constructor(hud: HTMLElement, over: HTMLElement, column: HTMLElement) {
    this.hud = hud;
    this.over = over;
    this.boss = new FoePlate(column, 'boss', { words: ['faction', 'phase'], poise: true, remembers: 'found' });
    this.boss.root.hidden = true;
    for (const share of PHASE_MARKS) element('i', 'phase-mark', this.boss.health.root).style.left = `${share * 100}%`;
  }

  /** Draws the foes' bars, each over the point `spotOf` puts above its head (null off the screen) with how far that is
   *  from the eye, as `viewing` sees them, `seconds` on. Answers the Boss on the boss bar. */
  update(
    foes: readonly MarkedFoe[],
    own: FighterView | null,
    spotOf: (view: FighterView) => { readonly x: number; readonly y: number; readonly depth: number } | null,
    viewing: PlateViewing,
    seconds: number,
  ): MarkedFoe | null {
    const { height } = PLATES.overhead;
    const { camera } = viewing;
    const seen: { foe: MarkedFoe; spot: { x: number; y: number; depth: number }; since: number; off: number }[] = [];
    for (const foe of foes) {
      const was = this.alerts.get(foe.id);
      const turned = foe.alert === ALERT.alert && was?.alert !== ALERT.alert;
      const since = turned ? 0 : (was?.since ?? 0) + seconds;
      this.alerts.set(foe.id, { alert: foe.alert, since });
      const spot = spotOf(foe.view);
      const head = [foe.view.x, foe.view.y, foe.view.z + HEAD_M] as const;
      const far = !!camera && Math.hypot(head[0] - camera.eye[0], head[1] - camera.eye[1]) > PLATE_RANGE_M;
      const drawn = foe.rank !== BOSS_RANK && foe.view.action.kind !== 'dead' && !!spot && !far;
      const hidden = drawn && !!camera && this.sight.hidden(foe.id, viewing.blocked(camera.eye, head), seconds);
      if (!drawn || !spot || hidden) {
        this.cones.delete(foe.id);
        continue;
      }
      // With no camera no angle is known, so the cone shows none.
      seen.push({ foe, spot, since, off: camera ? offDegrees(camera, head) : Number.NaN });
    }
    this.aimed = aimedFoe(new Map(seen.map(({ foe, off }) => [foe.id, off])), this.aimed);
    const shown: { foe: MarkedFoe; x: number; y: number; depth: number; since: number; cone: number; scale: number }[] =
      [];
    for (const { foe, spot, since, off } of seen) {
      const held = Math.max(viewing.fought(foe.id), viewing.locked === foe.id ? 1 : 0);
      const want = coneWant(foe.id === this.aimed ? off : null, held);
      const cone = coneStep(this.cones.get(foe.id) ?? null, want, seconds);
      this.cones.set(foe.id, cone);
      if (cone <= 0) continue;
      shown.push({ foe, ...spot, since, cone, scale: plateScale(spot.depth, camera?.focal ?? NaN) });
    }
    const spots = shown.map(({ foe, x, y, depth, scale }) => ({
      key: foe.id,
      x,
      y,
      depth,
      width: OVERHEAD_SIZES[plateTier(foe.rank)].width * scale,
      height: height * scale,
    }));
    const laid = this.layout.lay(spots, motionReduced() ? Infinity : seconds);
    this.columns = spots.map(({ x, y, width }) => ({
      left: x - width / 2,
      right: x + width / 2,
      top: -Infinity,
      bottom: y,
    }));
    for (const { foe, x, y, since, cone, scale } of shown) {
      const plate = this.overheads.get(foe.id) ?? new FoePlate(this.over, 'overhead');
      this.overheads.set(foe.id, plate);
      plate.show(foe, seconds, alertMark(foe.alert, since));
      const place = laid.get(foe.id) ?? { lift: 0, front: 0 };
      const moved = `translate(${x.toFixed(1)}px, ${(y - place.lift).toFixed(1)}px)`;
      setStyle(plate.root, 'transform', scale < 1 ? `${moved} scale(${scale.toFixed(3)})` : moved);
      plate.scaled(scale);
      setStyle(plate.root, 'opacity', cone < 1 ? cone.toFixed(2) : '');
      setStyle(plate.root, 'z-index', String(shown.length - place.front));
    }
    for (const [id, plate] of this.overheads) {
      if (laid.has(id)) continue;
      plate.root.remove();
      this.overheads.delete(id);
    }
    const present = new Set(foes.map((foe) => foe.id));
    for (const id of this.alerts.keys()) if (!present.has(id)) this.alerts.delete(id);
    for (const id of this.cones.keys()) if (!present.has(id)) this.cones.delete(id);
    this.sight.keep(present);
    this.boss.keep(present);
    const boss = bossInFight(foes, own);
    this.showBoss(boss, seconds);
    return boss;
  }

  private showBoss(boss: MarkedFoe | null, seconds: number): void {
    showNode(this.boss.root, !!boss);
    this.hud.classList.toggle('bossed', !!boss);
    if (!boss) return;
    const shown = bossBarOf(boss);
    this.boss.show(boss, seconds);
    const { faction, phase } = this.boss.words;
    if (faction && faction.textContent !== shown.faction) faction.textContent = shown.faction;
    if (phase && phase.textContent !== shown.phase) phase.textContent = shown.phase;
  }
}
