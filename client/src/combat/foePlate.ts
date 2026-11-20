// A foe's plate, one layout for every bar of a foe: its level in a square at the left and, to its right, its
// name above a thin bar of its health, the fill in its rank's colour over a dark trough with a hairline edge; its
// debuffs' icons beside the bar. Over a figure its size goes with its rank, as Destiny's bars do: a Minor's short and
// thin, so the crowd's fodder stays quiet, and an Elite's and up long and marked in thirds, so they stand out.
import { PLATES } from '../plus/barLayout.ts';
import { ROLES } from '../plus/kit.ts';
import type { FoeShield, FoeStatuses } from '../network/messages.ts';
import type { FighterView } from '../rules/fighters.ts';
import { type RankBand, rankBand, rankMark } from '../rules/roster.ts';
import { PIECE_LEAST } from '../plus/barLoss.ts';
import { element, Meter, setStyle, showNode } from '../plus/meter.ts';
import { foeDebuffs, StatusRow } from './statusIcons.ts';

/** A foe as the display marks it: its number, its type's name, its glance (its place as it is drawn), its rank (1 Minor
 *  to 5 Boss), its faction's name, the phase it fights in (1 to 3) and how alert it is (0 idle, 1 suspicious, 2 alert,
 *  3 searching); its faction's number, which picks its emblem (none without it); its level (0 for a foe of none,
 *  whose square stands empty); its shield, if it stands with one; its debuffs; and whether it is a companion. */
export interface MarkedFoe {
  readonly id: number;
  readonly name: string;
  readonly view: FighterView;
  readonly rank: number;
  readonly faction: string;
  readonly phase: number;
  readonly alert: number;
  readonly factionNumber?: number;
  readonly level?: number;
  readonly shield?: FoeShield | null;
  readonly statuses?: FoeStatuses;
  /** A companion fighting beside the players, whose plate is drawn in the players' colour. */
  readonly ally?: boolean;
}

/** A plate's tier by its foe's rank: a Minor's, a Major's, or an Elite's and up. */
export type PlateTier = 'minor' | 'major' | 'elite';
export function plateTier(rank: number): PlateTier {
  return rank <= 1 ? 'minor' : rank === 2 ? 'major' : 'elite';
}

/** A plate's width and its bar's height over a figure, by its tier, in CSS pixels, each as tall as its level's square
 *  (`PLATES.overhead.height`), and the share of the room under the name its bar runs. A Major's is the size a ship's
 *  plate is drawn at; a Minor's as wide, which "? Crossbowman", the longest name a Minor has, fills in the game's face,
 *  so only its bar is short. A Minor's bar is 6 px: drawn far off at three quarters, it still holds a row of its red
 *  and of a shield's colour. */
export const OVERHEAD_SIZES: Readonly<
  Record<PlateTier, { readonly width: number; readonly bar: number; readonly barShare: number }>
> = {
  minor: { width: PLATES.overhead.width, bar: 6, barShare: 0.6 },
  major: { width: PLATES.overhead.width, bar: PLATES.overhead.bar, barShare: 1 },
  elite: { width: 176, bar: 10, barShare: 1 },
};

/** Where an Elite's and up's bar over a figure is marked, as shares of its whole health: its thirds. */
export const THIRDS: readonly number[] = [1 / 3, 2 / 3];

/** A shield's ward over a foe's health, as DFO's Enhanced HUD laid a boss's: from the bar's left end, as long as the
 *  share of the foe's whole health it holds still, in its element's colour (by the gear crate's number); none once
 *  it is broken or for a foe with none. */
export function wardOf(
  foe: Pick<MarkedFoe, 'shield' | 'view'>,
): { readonly share: number; readonly element: number } | null {
  const shield = foe.shield;
  if (!shield || shield.left <= 0) return null;
  return { share: Math.min(1, shield.left / Math.max(1, foe.view.healthMax)), element: shield.element };
}

/** The colour a plate's health is drawn in: green for an ally fighting on the players' side, as the Brig's crew do,
 *  else its rank's band. */
export function plateBand(foe: Pick<MarkedFoe, 'rank' | 'view'>): RankBand | 'green' {
  return foe.view.side === 'players' ? 'green' : rankBand(foe.rank);
}

/** What the poise track under a foe's health says: nothing to say (not drawn), its poise filling toward a break, an
 *  iron blow wound up (no poise stops it), staggered, or open after a blow that found no one. */
export type PoiseState = 'empty' | 'filling' | 'iron' | 'staggered' | 'open';

/** The poise track's reading of a foe: its state, how full it stands (0 to 1) and the word under it. A feint reads
 *  as any wind-up: the track tells no more than the ground does. */
export function poiseTrackOf(view: FighterView): { state: PoiseState; fill: number; word: string } {
  const { action } = view;
  if (action.kind === 'staggered') {
    return { state: 'staggered', fill: 1, word: action.cause === 'charged' ? 'Charged' : 'Staggered' };
  }
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
    setStyle(this.fill, 'width', `${Math.round(fill * 1000) / 10}%`);
    if (this.word.textContent !== word) this.word.textContent = word;
  }
}

/** What a plate holds besides its level, name and health: a poise track under the health; whether its health breaks
 *  off in pieces and remembers each foe's, for a plate that turns from foe to foe, taking a foe it first shows as
 *  whole (a plate that comes with the first blow, after it lands) or as found (one that comes before any blow); and
 *  spans after the name (by their class) for other words. */
export interface PlateParts {
  readonly poise?: boolean;
  readonly remembers?: 'whole' | 'found';
  readonly words?: readonly string[];
}

/** A foe's plate on the display. */
export class FoePlate {
  readonly root: HTMLElement;
  readonly health: Meter;
  readonly words: Readonly<Record<string, HTMLElement>>;
  private readonly level: HTMLElement;
  private readonly alert: HTMLElement;
  private readonly name: HTMLElement;
  private readonly mark: HTMLElement;
  private readonly poise: PoiseTrack | null;
  private readonly ward: HTMLElement;
  private readonly debuffs: StatusRow;
  /** The share of health the plate last showed of each foe it remembers, so a foe it turns back to loses from where
   *  its bar stood; and the share a foe first shown is taken at (null for as found). */
  private readonly seen: Map<number, number> | null;
  private readonly firstSeen: number | null;
  /** The foe the plate showed last, so its bars forget another's losses. */
  private shown: number | null = null;

  constructor(parent: HTMLElement, className: string, parts: PlateParts = {}) {
    this.root = element('div', `plate ${className}`, parent);
    this.level = element('b', `level ${ROLES.chip}`, this.root);
    const body = element('div', 'body', this.root);
    const title = element('div', 'title', body);
    this.alert = element('span', 'alert', title);
    this.name = element('span', 'name', title);
    this.mark = element('i', 'rank-mark', title);
    this.words = Object.fromEntries((parts.words ?? []).map((word) => [word, element('span', word, title)]));
    this.health = new Meter(body, 'health', { pieceLeast: parts.remembers ? PIECE_LEAST.foe : null });
    this.ward = element('i', 'ward', this.health.root);
    this.ward.hidden = true;
    for (const share of THIRDS) element('i', 'third-mark', this.health.root).style.left = `${share * 100}%`;
    this.poise = parts.poise ? new PoiseTrack(body) : null;
    this.debuffs = new StatusRow(this.root, 'Debuffs');
    this.seen = parts.remembers ? new Map() : null;
    this.firstSeen = parts.remembers === 'whole' ? 1 : null;
  }

  /** Shows `foe` `seconds` on, with its alert's mark ('' for none). */
  show(foe: MarkedFoe, seconds: number, alert = ''): void {
    const share = foe.view.health / Math.max(1, foe.view.healthMax);
    if (this.shown !== foe.id) {
      this.shown = foe.id;
      this.health.forget(this.seen?.get(foe.id) ?? this.firstSeen);
    }
    const { dataset } = this.root;
    const band = foe.ally ? 'ally' : plateBand(foe);
    if (dataset['band'] !== band) dataset['band'] = band;
    if (dataset['tier'] !== plateTier(foe.rank)) dataset['tier'] = plateTier(foe.rank);
    const level = foe.level ? String(foe.level) : '';
    if (this.level.textContent !== level) this.level.textContent = level;
    const mark = rankMark(foe.rank) ?? '';
    if (this.mark.dataset['mark'] !== mark) this.mark.dataset['mark'] = mark;
    if (this.name.textContent !== foe.name) this.name.textContent = foe.name;
    if (this.alert.textContent !== alert) this.alert.textContent = alert;
    this.alert.classList.toggle('now', alert === '!');
    this.health.set(share, seconds);
    const ward = wardOf(foe);
    showNode(this.ward, !!ward);
    if (ward) {
      setStyle(this.ward, 'width', `${Math.round(ward.share * 1000) / 10}%`);
      if (this.ward.dataset['element'] !== String(ward.element)) this.ward.dataset['element'] = String(ward.element);
    }
    this.seen?.set(foe.id, Math.max(0, Math.min(1, share)));
    this.poise?.show(foe.id, foe.view);
    this.debuffs.show(foe.id, foeDebuffs(foe.statuses));
  }

  /** Scales the debuffs back up by as much as the plate is drawn smaller (`scale`), so each reads at its own size
   *  however far its foe stands. */
  scaled(scale: number): void {
    const back = scale > 0 && scale < 1 ? (1 / scale).toFixed(3) : '';
    if (this.debuffs.root.style.scale !== back) this.debuffs.root.style.scale = back;
  }

  /** Forgets the foes not in `present`, whose numbers may come again for others. */
  keep(present: ReadonlySet<number>): void {
    for (const id of this.seen?.keys() ?? []) if (!present.has(id)) this.seen?.delete(id);
    this.debuffs.keep(present);
  }
}
