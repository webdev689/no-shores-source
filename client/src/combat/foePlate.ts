// A foe's plate, one layout for every bar of a foe: its faction's emblem in a square at the left and, to its right, its
// name above a long thin bar of its health, the fill in its rank's colour over a dark trough with a hairline edge.
import { ROLES } from '../plus/kit.ts';
import type { FighterView } from '../rules/fighters.ts';
import { rankBand, rankMark } from '../rules/roster.ts';
import { element, Meter } from './meter.ts';

/** A foe as the display marks it: its number, its type's name, its glance (its place as it is drawn), its rank (1 Minor
 *  to 5 Boss), its faction's name, the phase it fights in (1 to 3) and how alert it is (0 idle, 1 suspicious, 2 alert,
 *  3 searching); and its faction's number, which picks its emblem (none without it). */
export interface MarkedFoe {
  readonly id: number;
  readonly name: string;
  readonly view: FighterView;
  readonly rank: number;
  readonly faction: string;
  readonly phase: number;
  readonly alert: number;
  readonly factionNumber?: number;
}

/** What a plate holds besides its emblem, name and health: a poise bar under the health, and spans after the name
 *  (by their class) for other words. */
export interface PlateParts {
  readonly poise?: boolean;
  readonly words?: readonly string[];
}

/** A foe's plate on the display. */
export class FoePlate {
  readonly root: HTMLElement;
  readonly health: Meter;
  readonly words: Readonly<Record<string, HTMLElement>>;
  private readonly emblem: HTMLElement;
  private readonly alert: HTMLElement;
  private readonly name: HTMLElement;
  private readonly mark: HTMLElement;
  private readonly poise: Meter | null;
  /** The foe the plate showed last, so its bars forget another's losses. */
  private shown: number | null = null;

  constructor(parent: HTMLElement, className: string, parts: PlateParts = {}) {
    this.root = element('div', `plate ${className}`, parent);
    this.emblem = element('i', `emblem ${ROLES.chip}`, this.root);
    const body = element('div', 'body', this.root);
    const title = element('div', 'title', body);
    this.alert = element('span', 'alert', title);
    this.name = element('span', 'name', title);
    this.mark = element('i', 'rank-mark', title);
    this.words = Object.fromEntries((parts.words ?? []).map((word) => [word, element('span', word, title)]));
    this.health = new Meter(body, 'health');
    this.poise = parts.poise ? new Meter(body, 'poise', false) : null;
  }

  /** Shows `foe` `seconds` on, with its alert's mark ('' for none). */
  show(foe: MarkedFoe, seconds: number, alert = ''): void {
    if (this.shown !== foe.id) {
      this.shown = foe.id;
      this.health.forget();
    }
    const { dataset } = this.root;
    if (dataset['band'] !== rankBand(foe.rank)) dataset['band'] = rankBand(foe.rank);
    const faction = String(foe.factionNumber ?? 0);
    if (this.emblem.dataset['faction'] !== faction) this.emblem.dataset['faction'] = faction;
    const mark = rankMark(foe.rank) ?? '';
    if (this.mark.dataset['mark'] !== mark) this.mark.dataset['mark'] = mark;
    if (this.name.textContent !== foe.name) this.name.textContent = foe.name;
    if (this.alert.textContent !== alert) this.alert.textContent = alert;
    this.alert.classList.toggle('now', alert === '!');
    this.health.set(foe.view.health / Math.max(1, foe.view.healthMax), seconds);
    this.poise?.set(foe.view.poise / Math.max(1, foe.view.poiseMax), seconds);
  }
}
