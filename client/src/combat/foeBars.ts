import { BarLayout, PLATES } from '../plus/barLayout.ts';
import type { FighterView } from '../rules/fighters.ts';
import { BOSS_RANK } from '../rules/roster.ts';
import { FoePlate, type MarkedFoe } from './foePlate.ts';
import { element } from './meter.ts';

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

/** Over each living foe its plate, laid so none covers another, and across the top of the screen the boss bar of the
 *  Boss in the fight, who shows none over its head. */
export class FoeBars {
  private readonly hud: HTMLElement;
  private readonly over: HTMLElement;
  private readonly overheads = new Map<number, FoePlate>();
  private readonly layout = new BarLayout();
  /** Each foe's alert state as last seen, and the seconds since it last turned alert. */
  private readonly alerts = new Map<number, { alert: number; since: number }>();
  private readonly boss: FoePlate;

  constructor(hud: HTMLElement, over: HTMLElement) {
    this.hud = hud;
    this.over = over;
    this.boss = new FoePlate(hud, 'boss', { words: ['faction', 'phase'] });
    this.boss.root.hidden = true;
    for (const share of PHASE_MARKS) element('i', 'phase-mark', this.boss.health.root).style.left = `${share * 100}%`;
  }

  /** Draws the foes' bars, each over the point `spotOf` puts above its head (null off the screen) with how far that is
   *  from the eye, `seconds` on. */
  update(
    foes: readonly MarkedFoe[],
    own: FighterView | null,
    spotOf: (view: FighterView) => { readonly x: number; readonly y: number; readonly depth: number } | null,
    seconds: number,
  ): void {
    const { width, height } = PLATES.overhead;
    const shown: { foe: MarkedFoe; x: number; y: number; depth: number; since: number }[] = [];
    for (const foe of foes) {
      const was = this.alerts.get(foe.id);
      const turned = foe.alert === ALERT.alert && was?.alert !== ALERT.alert;
      const since = turned ? 0 : (was?.since ?? 0) + seconds;
      this.alerts.set(foe.id, { alert: foe.alert, since });
      const spot = spotOf(foe.view);
      if (foe.rank === BOSS_RANK || foe.view.action.kind === 'dead' || !spot) continue;
      shown.push({ foe, ...spot, since });
    }
    const laid = this.layout.lay(
      shown.map(({ foe, x, y, depth }) => ({ key: foe.id, x, y, depth, width, height })),
      seconds,
    );
    for (const { foe, x, y, since } of shown) {
      const plate = this.overheads.get(foe.id) ?? new FoePlate(this.over, 'overhead');
      this.overheads.set(foe.id, plate);
      plate.show(foe, seconds, alertMark(foe.alert, since));
      const place = laid.get(foe.id) ?? { lift: 0, front: 0 };
      plate.root.style.transform = `translate(${x.toFixed(1)}px, ${(y - place.lift).toFixed(1)}px)`;
      plate.root.style.zIndex = String(shown.length - place.front);
    }
    for (const [id, plate] of this.overheads) {
      if (laid.has(id)) continue;
      plate.root.remove();
      this.overheads.delete(id);
    }
    const present = new Set(foes.map((foe) => foe.id));
    for (const id of this.alerts.keys()) if (!present.has(id)) this.alerts.delete(id);
    this.showBoss(bossInFight(foes, own), seconds);
  }

  private showBoss(boss: MarkedFoe | null, seconds: number): void {
    this.boss.root.hidden = !boss;
    this.hud.classList.toggle('bossed', !!boss);
    if (!boss) return;
    const shown = bossBarOf(boss);
    this.boss.show(boss, seconds);
    const { faction, phase } = this.boss.words;
    if (faction && faction.textContent !== shown.faction) faction.textContent = shown.faction;
    if (phase && phase.textContent !== shown.phase) phase.textContent = shown.phase;
  }
}
