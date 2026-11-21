// A zone's public event as the banner under the compass shows it, after Destiny's: what it is over its name, the name
// and the place, the countdown at the right, the objective with its bar, the heroic task with its window's countdown,
// the bonus and whether it holds; the result for its time once it is over; and the next event's line between them.
// It slides in afresh at each beat (begun, a stage, heroic met or missed, won, failed).
import type { PlaceMark } from '../plus/compass.ts';
import { HALO, TONES } from '../plus/tones.ts';
import { element, Meter, setStyle, showNode } from '../plus/meter.ts';

/** The banner's tone: an event running, one turned heroic, its result, or the next event's line between them. */
export type BannerTone = 'running' | 'heroic' | 'won' | 'failed' | 'next';

/** What the banner shows: a line over the name (what it is), the name, the place, a clock (the countdown, or how long
 *  until the next), the objective, the bar under it, the heroic task with its window's clock, and the bonus. */
export interface Banner {
  readonly tone: BannerTone;
  readonly kicker: string;
  readonly title: string;
  readonly place: string;
  readonly clock: string;
  /** The event's last minute: its clock red and pulsing. */
  readonly urgent?: boolean;
  /** What runs or comes next elsewhere on the island, between events. */
  readonly elsewhere?: string;
  readonly objective: string;
  readonly bar: { readonly share: number; readonly label: string } | null;
  readonly heroic: { readonly text: string; readonly clock: string; readonly met: boolean } | null;
  readonly bonus: { readonly text: string; readonly state: 'holds' | 'met' | 'lost' } | null;
}

/** A beat of the event the banner slides in afresh for. */
export type BannerBeat = 'begun' | 'stage' | 'heroic' | 'missed' | 'won' | 'failed';

/** What the display shows of the zone's public event this frame: its banner and the beat it slides in for, the
 *  places the compass marks, and each store's health over it while a raid runs. */
export interface PublicShown {
  readonly banner: Banner | null;
  readonly beat: BannerBeat | null;
  readonly places: readonly PlaceMark[];
  readonly stores: readonly { readonly at: readonly [number, number, number]; readonly share: number }[];
}

/** How high over a store's foot its bar stands, metres: over its stack and tarp (1.6 m), as a plate over a head. */
export const STORE_BAR_OVER_M = 2.3;

/** Each tone's colour: the accent down its edge, its kicker's words and its bar's fill. */
const TONE_COLOURS = {
  running: '#e9b44c',
  heroic: '#ff7a3d',
  won: '#9fd86a',
  failed: '#e0483c',
  next: TONES.stoneHi,
} as const;

/** The banner's elements, made once and written only when their words change. */
export class PublicBanner {
  readonly root: HTMLElement;
  private readonly kicker: HTMLElement;
  private readonly clock: HTMLElement;
  private readonly title: HTMLElement;
  private readonly place: HTMLElement;
  private readonly objective: HTMLElement;
  private readonly barRow: HTMLElement;
  private readonly bar: Meter;
  private readonly barLabel: HTMLElement;
  private readonly heroic: HTMLElement;
  private readonly heroicText: HTMLElement;
  private readonly heroicClock: HTMLElement;
  private readonly bonus: HTMLElement;
  /** A line a screen reader reads at each beat, unseen: the banner's own words change too often to be read out. */
  private readonly said: HTMLElement;

  constructor(parent: HTMLElement) {
    this.root = element('section', 'public-banner', parent);
    this.root.setAttribute('role', 'status');
    this.root.setAttribute('aria-label', 'Public event');
    this.root.setAttribute('aria-atomic', 'false');
    const head = element('div', 'pb-head', this.root);
    this.kicker = element('span', 'pb-kicker', head);
    this.clock = element('span', 'pb-clock', head);
    this.clock.setAttribute('aria-hidden', 'true');
    const name = element('div', 'pb-name', this.root);
    this.title = element('span', 'pb-title', name);
    this.place = element('span', 'pb-place', name);
    this.objective = element('div', 'pb-objective', this.root);
    this.barRow = element('div', 'pb-bar-row', this.root);
    this.bar = new Meter(this.barRow, 'pb-bar', { lossShown: false });
    this.barLabel = element('span', 'pb-bar-label', this.barRow);
    this.heroic = element('div', 'pb-heroic', this.root);
    element('i', 'pb-heroic-mark', this.heroic);
    this.heroicText = element('span', 'pb-heroic-text', this.heroic);
    this.heroicClock = element('span', 'pb-heroic-clock', this.heroic);
    this.heroicClock.setAttribute('aria-hidden', 'true');
    this.bonus = element('div', 'pb-bonus', this.root);
    this.said = element('span', 'pb-said', this.root);
    this.root.hidden = true;
  }

  /** Shows `banner`, or hides it for none, `seconds` after the last frame; a `beat` slides it in afresh. */
  update(banner: Banner | null, seconds: number, beat: BannerBeat | null = null): void {
    showNode(this.root, !!banner);
    if (!banner) return;
    this.root.dataset.tone = banner.tone;
    setStyle(this.root, '--tone', TONE_COLOURS[banner.tone]);
    say(this.kicker, banner.kicker);
    say(this.clock, banner.clock);
    say(this.title, banner.title);
    say(this.place, banner.place);
    say(this.objective, banner.objective);
    showNode(this.objective, banner.objective !== '');
    showNode(this.barRow, !!banner.bar);
    if (banner.bar) {
      this.bar.set(banner.bar.share, seconds);
      say(this.barLabel, banner.bar.label);
    }
    showNode(this.heroic, !!banner.heroic);
    if (banner.heroic) {
      this.heroic.classList.toggle('met', banner.heroic.met);
      say(this.heroicText, banner.heroic.text);
      say(this.heroicClock, banner.heroic.clock);
    }
    showNode(this.bonus, !!banner.bonus);
    if (banner.bonus) {
      say(this.bonus, banner.bonus.text);
      this.bonus.dataset.state = banner.bonus.state;
    }
    if (beat) {
      const objective = beat === 'heroic' || beat === 'missed' ? banner.heroic?.text : banner.objective;
      say(this.said, `${banner.kicker}: ${banner.title}${objective ? `. ${objective}` : ''}`);
      // Taken off and put back, so the slide plays again for each beat.
      this.root.dataset.beat = beat;
      this.root.classList.remove('beat');
      void this.root.offsetWidth;
      this.root.classList.add('beat');
    }
  }
}

/** A small bar over each store while a raid runs, its health, as a plate over a foe. */
export class StoreBars {
  private readonly layer: HTMLElement;
  private readonly bars: { readonly root: HTMLElement; readonly meter: Meter }[] = [];

  constructor(layer: HTMLElement) {
    this.layer = layer;
  }

  /** Lays a bar over each of `stores` where `project` puts the point over it (null off the screen). */
  update(
    stores: PublicShown['stores'],
    project: (point: readonly [number, number, number]) => { readonly x: number; readonly y: number } | null,
    seconds: number,
  ): void {
    while (this.bars.length < stores.length) {
      const root = element('div', 'store-bar', this.layer);
      this.bars.push({ root, meter: new Meter(root, 'health', { lossShown: true }) });
    }
    this.bars.forEach((bar, index) => {
      const store = stores[index];
      const spot = store && project([store.at[0], store.at[1], store.at[2] + STORE_BAR_OVER_M]);
      showNode(bar.root, !!spot);
      if (!store || !spot) return;
      setStyle(bar.root, 'transform', `translate(${spot.x}px, ${spot.y}px)`);
      bar.root.classList.toggle('fallen', store.share <= 0);
      bar.meter.set(store.share, seconds);
    });
  }
}

/** Writes words only when they change. */
function say(node: HTMLElement, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}

/** The banner's sheet: a dark band fading to its right under the compass, its tone down its left edge; words on the
 *  face's grid, 11 px, the name at 22. */
export function publicBannerCss(): string {
  return `
.fight-hud .public-banner { position: relative; box-sizing: border-box; width: min(440px, 76%);
  padding: 6px 12px 7px 14px; border-left: 3px solid var(--tone);
  background: linear-gradient(90deg, rgba(8,9,12,0.86), rgba(8,9,12,0.7) 70%, rgba(8,9,12,0.35));
  box-shadow: 0 0 0 1px ${TONES.outline}; color: ${TONES.word}; text-shadow: ${HALO}; font-size: 11px;
  line-height: 14px; font-variant-numeric: tabular-nums; pointer-events: none; }
.fight-hud .public-banner[hidden], .fight-hud .public-banner [hidden] { display: none; }
.fight-hud .public-banner .pb-said { position: absolute; width: 1px; height: 1px; overflow: hidden;
  clip-path: inset(50%); white-space: nowrap; }
.fight-hud .public-banner .pb-head { display: flex; align-items: baseline; gap: 12px; }
.fight-hud .public-banner .pb-kicker { color: var(--tone); letter-spacing: 0.16em; text-transform: uppercase; }
.fight-hud .public-banner .pb-clock { margin-left: auto; font-size: 22px; line-height: 22px; white-space: nowrap; }
.fight-hud .public-banner .pb-name { display: flex; flex-wrap: wrap; align-items: baseline; column-gap: 10px; }
.fight-hud .public-banner .pb-title { font-size: 22px; line-height: 26px; font-weight: 600; }
.fight-hud .public-banner .pb-place { color: ${TONES.wordDim}; letter-spacing: 0.08em; }
.fight-hud .public-banner .pb-objective { margin-top: 3px; }
.fight-hud .public-banner .pb-bar-row { display: flex; align-items: center; gap: 8px; margin-top: 4px; }
.fight-hud .public-banner .pb-bar { --fill: var(--tone); flex: 1; height: 8px; }
.fight-hud .public-banner .pb-bar-label { white-space: nowrap; color: ${TONES.wordDim}; }
.fight-hud .public-banner .pb-heroic { display: flex; align-items: center; gap: 8px; margin-top: 5px; color: #ffb27a; }
.fight-hud .public-banner .pb-heroic-mark { width: 8px; height: 8px; rotate: 45deg; flex: none;
  background: #ff7a3d; box-shadow: 0 0 0 1px ${TONES.outline}, 0 0 6px #ff7a3d; }
.fight-hud .public-banner .pb-heroic:not(.met) .pb-heroic-mark { animation: pb-pulse 0.8s steps(2, end) infinite; }
.fight-hud .public-banner .pb-heroic.met { color: #ff7a3d; letter-spacing: 0.16em; text-transform: uppercase; }
.fight-hud .public-banner .pb-heroic-clock { margin-left: auto; }
.fight-hud .public-banner .pb-bonus { margin-top: 3px; color: ${TONES.wordDim}; }
.fight-hud .public-banner .pb-bonus::before { content: ''; display: inline-block; width: 6px; height: 6px;
  margin: 0 8px 1px 1px; rotate: 45deg; border: 1px solid var(--tone); vertical-align: middle; }
.fight-hud .public-banner .pb-bonus[data-state='met']::before { background: var(--tone); }
.fight-hud .public-banner .pb-bonus[data-state='lost'] { text-decoration: line-through; opacity: 0.6; }
/* Between events, one line: what comes next, where, and when. */
.fight-hud .public-banner[data-tone='next'] { display: flex; flex-wrap: wrap; align-items: baseline; column-gap: 10px;
  padding: 4px 12px 4px 10px; }
.fight-hud .public-banner[data-tone='next'] .pb-head { display: contents; }
.fight-hud .public-banner[data-tone='next'] .pb-clock { order: 3; font-size: 11px; line-height: 14px; }
.fight-hud .public-banner[data-tone='next'] .pb-name { order: 2; }
.fight-hud .public-banner[data-tone='next'] .pb-title { font-size: 11px; line-height: 14px; }
.fight-hud .public-banner[data-tone='won'] .pb-title, .fight-hud .public-banner[data-tone='failed'] .pb-title {
  color: var(--tone); }
.fight-hud .public-banner.beat { animation: pb-slide 0.45s cubic-bezier(0.2, 0.8, 0.3, 1); }
.fight-hud .public-banner.beat[data-beat='heroic'], .fight-hud .public-banner.beat[data-beat='won'] {
  animation: pb-slide 0.45s cubic-bezier(0.2, 0.8, 0.3, 1), pb-flare 1.2s ease-out; }
@keyframes pb-slide { from { translate: 0 -10px; opacity: 0; clip-path: inset(0 100% 0 0); }
  to { translate: 0 0; opacity: 1; clip-path: inset(0 0 0 0); } }
@keyframes pb-flare { from { box-shadow: 0 0 0 1px ${TONES.outline}, 0 0 24px var(--tone); }
  to { box-shadow: 0 0 0 1px ${TONES.outline}, 0 0 0 transparent; } }
@keyframes pb-pulse { 50% { opacity: 0.35; } }
/* Over each store, its health, as a foe's plate holds its own. */
.fight-hud .store-bar { position: absolute; left: 0; top: 0; width: 72px; translate: -50% -100%; pointer-events: none; }
.fight-hud .store-bar .meter.health { --fill: #e9b44c; height: 7px; }
.fight-hud .store-bar.fallen { opacity: 0.45; }
@media (prefers-reduced-motion: reduce) {
  .fight-hud .public-banner.beat, .fight-hud .public-banner .pb-heroic-mark { animation: none !important; }
}
`;
}
