import type { FighterView } from '../rules/fighters.ts';
import { BOSS_RANK, rankBand } from '../rules/roster.ts';

/** A foe as the display marks it: its number, its type's name, its glance (its place as it is drawn), its rank (1 Minor
 *  to 5 Boss), its faction's name, the phase it fights in (1 to 3) and how alert it is (0 idle, 1 suspicious, 2 alert,
 *  3 searching). */
export interface MarkedFoe {
  readonly id: number;
  readonly name: string;
  readonly view: FighterView;
  readonly rank: number;
  readonly faction: string;
  readonly phase: number;
  readonly alert: number;
}

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

const made = (tag: string, className: string, parent: HTMLElement, text = ''): HTMLElement => {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  parent.append(element);
  return element;
};
const widthOf = (share: number) => `${Math.round(share * 1000) / 10}%`;

/** A foe's name over its bar, with its alert's mark. */
interface Overhead {
  readonly root: HTMLElement;
  readonly mark: HTMLElement;
  readonly name: HTMLElement;
  readonly fill: HTMLElement;
}

/** Over each living foe its name above a bar of its health coloured by its rank, and across the top of the screen the
 *  boss bar of the Boss in the fight, who shows none over its head. */
export class FoeBars {
  private readonly hud: HTMLElement;
  private readonly over: HTMLElement;
  private readonly overheads = new Map<number, Overhead>();
  /** Each foe's alert state as last seen, and the seconds since it last turned alert. */
  private readonly alerts = new Map<number, { alert: number; since: number }>();
  private readonly boss: HTMLElement;
  private readonly bossName: HTMLElement;
  private readonly bossFaction: HTMLElement;
  private readonly bossPhase: HTMLElement;
  private readonly bossFill: HTMLElement;

  constructor(hud: HTMLElement, over: HTMLElement) {
    this.hud = hud;
    this.over = over;
    this.boss = made('div', 'boss', hud);
    this.boss.hidden = true;
    const title = made('div', 'title', this.boss);
    this.bossName = made('span', 'name', title);
    this.bossFaction = made('span', 'faction', title);
    this.bossPhase = made('span', 'phase', title);
    const bar = made('div', 'bar', this.boss);
    this.bossFill = made('div', 'fill', bar);
    for (const share of PHASE_MARKS) made('i', '', bar).style.left = widthOf(share);
  }

  /** Draws the foes' bars, each over the point `spotOf` puts above its head (null off the screen), `seconds` on. */
  update(
    foes: readonly MarkedFoe[],
    own: FighterView | null,
    spotOf: (view: FighterView) => { readonly x: number; readonly y: number } | null,
    seconds: number,
  ): void {
    const shown = new Set<number>();
    for (const foe of foes) {
      const was = this.alerts.get(foe.id);
      const turned = foe.alert === ALERT.alert && was?.alert !== ALERT.alert;
      const since = turned ? 0 : (was?.since ?? 0) + seconds;
      this.alerts.set(foe.id, { alert: foe.alert, since });
      const spot = spotOf(foe.view);
      if (foe.rank === BOSS_RANK || foe.view.action.kind === 'dead' || !spot) continue;
      shown.add(foe.id);
      const overhead = this.overheads.get(foe.id) ?? this.overhead();
      this.overheads.set(foe.id, overhead);
      overhead.root.className = `foe-bar ${rankBand(foe.rank)}`;
      overhead.name.textContent = foe.name;
      const mark = alertMark(foe.alert, since);
      overhead.mark.textContent = mark;
      overhead.mark.className = mark === '!' ? 'alert now' : 'alert';
      overhead.fill.style.width = widthOf(Math.max(0, foe.view.health / Math.max(1, foe.view.healthMax)));
      overhead.root.style.transform = `translate(${spot.x}px, ${spot.y}px)`;
    }
    for (const [id, overhead] of this.overheads) {
      if (shown.has(id)) continue;
      overhead.root.remove();
      this.overheads.delete(id);
    }
    const present = new Set(foes.map((foe) => foe.id));
    for (const id of this.alerts.keys()) if (!present.has(id)) this.alerts.delete(id);
    this.showBoss(bossInFight(foes, own));
  }

  private overhead(): Overhead {
    const root = made('div', 'foe-bar', this.over);
    const line = made('div', 'name', root);
    const mark = made('span', 'alert', line);
    const name = made('span', '', line);
    const fill = made('div', 'fill', made('div', 'bar', root));
    return { root, mark, name, fill };
  }

  private showBoss(boss: MarkedFoe | null): void {
    this.boss.hidden = !boss;
    this.hud.classList.toggle('bossed', !!boss);
    if (!boss) return;
    const shown = bossBarOf(boss);
    this.bossName.textContent = shown.title;
    this.bossFaction.textContent = shown.faction;
    this.bossPhase.textContent = shown.phase;
    this.bossFill.style.width = widthOf(shown.share);
  }
}
