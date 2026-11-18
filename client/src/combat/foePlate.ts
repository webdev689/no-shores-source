// A foe's plate, one layout for every bar of a foe: its faction's emblem in a square at the left and, to its right, its
// name above a long thin bar of its health, the fill in its rank's colour over a dark trough with a hairline edge.
import { ROLES } from '../plus/kit.ts';
import type { FighterView } from '../rules/fighters.ts';
import { rankBand, rankMark } from '../rules/roster.ts';
import { element, Meter, PIECE_LEAST } from './meter.ts';

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

/** What the poise track under a foe's health says: nothing to say (not drawn), its poise filling toward a break, an
 *  iron blow wound up (no poise stops it), staggered, or open after a blow that found no one. */
export type PoiseState = 'empty' | 'filling' | 'iron' | 'staggered' | 'open';

/** The poise track's reading of a foe: its state, how full it stands (0 to 1) and the word under it. A feint reads
 *  as any wind-up: the track tells no more than the ground does. */
export function poiseTrackOf(view: FighterView): { state: PoiseState; fill: number; word: string } {
  const { action } = view;
  if (action.kind === 'staggered') return { state: 'staggered', fill: 1, word: 'Staggered' };
  if (action.kind === 'overreach') return { state: 'open', fill: 0, word: 'Open' };
  if (action.kind === 'telegraph' && action.iron) return { state: 'iron', fill: 1, word: 'Iron' };
  const fill = Math.max(0, Math.min(1, view.poise / Math.max(1, view.poiseMax)));
  return action.kind === 'telegraph' || fill > 0
    ? { state: 'filling', fill, word: '' }
    : { state: 'empty', fill: 0, word: '' };
}

/** The poise track: a thin bar under the health, its state a class, its word centred under it. It flashes only as the
 *  foe it shows breaks into a stagger, never as the plate turns onto one already staggered. */
class PoiseTrack {
  private readonly root: HTMLElement;
  private readonly fill: HTMLElement;
  private readonly word: HTMLElement;
  private last: { id: number; state: PoiseState } | null = null;

  constructor(parent: HTMLElement) {
    this.root = element('div', 'poise-track', parent);
    this.fill = element('i', 'poise-fill', this.root);
    this.word = element('span', 'poise-word', this.root);
  }

  show(id: number, view: FighterView): void {
    const { state, fill, word } = poiseTrackOf(view);
    if (this.last?.id !== id || this.last.state !== state) {
      const breaks = state === 'staggered' && this.last?.id === id;
      this.root.className = `poise-track poise-${state}${breaks ? ' poise-flash' : ''}`;
      this.last = { id, state };
    }
    this.fill.style.width = `${Math.round(fill * 1000) / 10}%`;
    if (this.word.textContent !== word) this.word.textContent = word;
  }
}

/** What a plate holds besides its emblem, name and health: a poise track under the health; whether its health breaks
 *  off in pieces and remembers each foe's, for a plate that turns from foe to foe; and spans after the name (by their
 *  class) for other words. */
export interface PlateParts {
  readonly poise?: boolean;
  readonly remembers?: boolean;
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
  private readonly poise: PoiseTrack | null;
  /** The share of health the plate last showed of each foe it remembers, so a foe it turns back to loses from where
   *  its bar stood, and a foe first shown is taken as whole: the plate comes with the first blow, after it lands. */
  private readonly seen: Map<number, number> | null;
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
    this.health = new Meter(body, 'health', { pieceLeast: parts.remembers ? PIECE_LEAST.foe : null });
    this.poise = parts.poise ? new PoiseTrack(body) : null;
    this.seen = parts.remembers ? new Map() : null;
  }

  /** Shows `foe` `seconds` on, with its alert's mark ('' for none). */
  show(foe: MarkedFoe, seconds: number, alert = ''): void {
    const share = foe.view.health / Math.max(1, foe.view.healthMax);
    if (this.shown !== foe.id) {
      this.shown = foe.id;
      this.health.forget(this.seen ? (this.seen.get(foe.id) ?? 1) : null);
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
    this.health.set(share, seconds);
    this.seen?.set(foe.id, Math.max(0, Math.min(1, share)));
    this.poise?.show(foe.id, foe.view);
  }

  /** Forgets the foes not in `present`, whose numbers may come again for others. */
  keep(present: ReadonlySet<number>): void {
    for (const id of this.seen?.keys() ?? []) if (!present.has(id)) this.seen?.delete(id);
  }
}
