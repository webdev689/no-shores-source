// The Art's abilities on the HUD, at the bottom left beside the vitals, as Destiny shows a Super and its abilities:
// the Anima as the Art's diamond, lit from the bottom as it charges and glowing once full; the two Tenets as square
// icons, a dark wedge over each sweeping clockwise away as it recharges, its last seconds counted in it. Each has its
// key on a keycap. What it shows is worked out from the room's numbers alone, and only what changed is written.
import arts from '../../../content/arts/arts.json' with { type: 'json' };
import { ROLES } from '../plus/kit.ts';
import { HALO, TONES } from '../plus/tones.ts';
import { ELEMENTS } from '../player/gear.ts';

/** The keys that cast the Anima and the two Tenets. */
export const ABILITY_KEYS = ['F', 'Q', 'C'] as const;
/** The Anima's diamond's rows: it lights a whole row of its picture at a time. */
export const ANIMA_ROWS = 24;
/** The steps a Tenet's wedge sweeps in, round the circle. */
const SWEEP_STEPS = 60;
/** A Tenet counts its seconds only once fewer than this are left. */
const COUNT_UNDER = 10;
/** How many CSS pixels each cell of a picture takes on the bar. */
const SCALE = 3;
/** Float error left by a share worked out from ticks, kept from tipping a step. */
const EPSILON = 1e-9;

/** What the bar is shown from: the Art worn (its id in the Arts' file, 0 for none), how far the Anima has charged,
 *  and how far each Tenet has recharged, each a share from 0 (just cast) to 1 (ready). */
export interface AbilityState {
  readonly art: number;
  readonly animaShare: number;
  readonly tenets: readonly [number, number];
}

/** A Tenet as the bar shows it: how many degrees of its wedge are still dark, clockwise from the top, the seconds
 *  written in it (none until fewer than ten are left), and whether it is ready. */
export interface TenetShown {
  readonly sweep: number;
  readonly seconds: string;
  readonly ready: boolean;
}

/** What the bar shows: the Art, how many of the Anima's rows are lit from the bottom, whether it is full, and each
 *  Tenet. */
export interface AbilityShown {
  readonly art: number;
  readonly animaRows: number;
  readonly animaFull: boolean;
  readonly tenets: readonly [TenetShown, TenetShown];
}

/** The pictures the bar draws an Art with, as SVG: its diamond, and its two Tenets' icons. The game's glyphs make
 *  them, so the HUD needs no picture of its own. */
export interface ArtPictures {
  readonly diamond: string;
  readonly tenets: readonly [string, string];
}

const share = (value: number): number => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0);

/** A Tenet recharging over `rechargeS` seconds, `charged` of the way. */
export function tenetShown(charged: number, rechargeS: number): TenetShown {
  const left = 1 - share(charged);
  const counted = Math.ceil(left * rechargeS - EPSILON);
  const steps = Math.max(0, Math.ceil(left * SWEEP_STEPS - EPSILON));
  return {
    sweep: (steps * 360) / SWEEP_STEPS,
    seconds: counted > 0 && counted < COUNT_UNDER ? String(counted) : '',
    ready: left <= 0,
  };
}

/** What the bar shows for `state`. */
export function abilityBarOf(state: AbilityState): AbilityShown {
  const tenets = arts.arts.find((art) => art.id === state.art)?.tenets ?? [];
  const charged = share(state.animaShare);
  return {
    art: state.art,
    animaRows: Math.floor(charged * ANIMA_ROWS + EPSILON),
    animaFull: charged >= 1,
    tenets: [
      tenetShown(state.tenets[0], tenets[0]?.rechargeS ?? 0),
      tenetShown(state.tenets[1], tenets[1]?.rechargeS ?? 0),
    ],
  };
}

const SHEET_ID = 'ability-bar';
/** The bar's sheet: a carved window right of the vitals, the Anima's diamond, the Tenets' wells and the keycaps. */
const SHEET = `
.ability-bar { position: absolute; left: 308px; bottom: 24px; display: flex; align-items: flex-end; gap: 11px;
  box-sizing: border-box; padding: 7px 12px; border-width: 2px; border-style: solid; pointer-events: none; }
.ability-bar[hidden] { display: none; }
.ability-bar .slot { position: relative; display: flex; flex-direction: column; align-items: center; gap: 4px; }
.ability-bar img { display: block; image-rendering: pixelated; }
.ability-bar .anima { position: relative; width: ${ANIMA_ROWS * SCALE}px; height: ${ANIMA_ROWS * SCALE}px; }
.ability-bar .anima img { position: absolute; inset: 0; width: 100%; height: 100%; }
.ability-bar .anima .unlit { filter: grayscale(0.8) brightness(0.4); }
.ability-bar .anima.full .lit { filter: drop-shadow(0 0 6px var(--art)); }
.ability-bar .anima kbd { position: absolute; left: 50%; bottom: -6px; translate: -50% 0; }
.ability-bar .tenet { position: relative; box-sizing: border-box; width: 44px; height: 44px; display: grid;
  place-items: center; border: 2px solid; border-color: ${TONES.stoneDark} ${TONES.stoneMid} ${TONES.stoneLit}
  ${TONES.stoneDim}; background: ${TONES.groundTrack}; box-shadow: 0 0 0 1px ${TONES.outline}; }
.ability-bar .tenet img { width: 36px; height: 36px; }
.ability-bar .tenet:not(.ready) img { filter: saturate(0.5) brightness(0.75); }
.ability-bar .tenet.ready { border-color: var(--art-lit) var(--art-dark) var(--art-dark) var(--art-lit);
  box-shadow: 0 0 0 1px ${TONES.outline}, 0 0 8px var(--art); }
.ability-bar .sweep { position: absolute; inset: 0; background: conic-gradient(transparent 0 var(--done),
  rgba(5, 6, 8, 0.7) var(--done) 360deg); }
.ability-bar .tenet.ready .sweep { display: none; }
.ability-bar .seconds { position: absolute; inset: 0; display: grid; place-items: center; font-size: 22px;
  line-height: 1; color: ${TONES.word}; text-shadow: ${HALO}; font-variant-numeric: tabular-nums; }
.ability-bar kbd { min-width: 18px; box-sizing: border-box; padding: 0 5px; border: 1px solid;
  border-color: ${TONES.stoneLit} ${TONES.stoneDark} ${TONES.stoneDark} ${TONES.stoneLit}; border-bottom-width: 2px;
  background: #16181d; font: inherit; font-size: 11px; line-height: 16px; text-align: center; color: ${TONES.word}; }
@media (prefers-reduced-motion: no-preference) {
  .ability-bar .anima.full .lit { animation: ability-full 1.6s steps(4, end) infinite alternate; }
}
@keyframes ability-full { from { filter: drop-shadow(0 0 3px var(--art)); } to { filter: drop-shadow(0 0 9px var(--art)); } }
`;

/** Lays the bar's sheet on `page`, once. */
function wearSheet(page: Document): void {
  if (page.getElementById(SHEET_ID)) return;
  const sheet = page.createElement('style');
  sheet.id = SHEET_ID;
  sheet.textContent = SHEET;
  page.head.append(sheet);
}

const pictureUrl = (svg: string): string => `data:image/svg+xml,${encodeURIComponent(svg)}`;

function part<K extends keyof HTMLElementTagNameMap>(name: K, className: string, parent: HTMLElement, text = '') {
  const node = document.createElement(name);
  node.className = className;
  node.textContent = text;
  parent.append(node);
  return node;
}

/** One Tenet's well and what the bar last wrote in it. */
interface TenetParts {
  readonly well: HTMLElement;
  readonly icon: HTMLImageElement;
  readonly seconds: HTMLElement;
}

/** The bar on the HUD, written each frame from an `AbilityState`; only what changed reaches the page. */
export class AbilityBar {
  readonly root: HTMLElement;
  private readonly anima: HTMLElement;
  private readonly unlit: HTMLImageElement;
  private readonly lit: HTMLImageElement;
  private readonly tenets: readonly [TenetParts, TenetParts];
  private readonly pictures: (art: number) => ArtPictures | null;
  private shown: AbilityShown | null = null;

  constructor(parent: HTMLElement, pictures: (art: number) => ArtPictures | null) {
    this.pictures = pictures;
    wearSheet(parent.ownerDocument);
    this.root = part('div', `ability-bar ${ROLES.window}`, parent);
    this.root.hidden = true;
    this.root.setAttribute('aria-hidden', 'true');
    const animaSlot = part('div', 'slot', this.root);
    this.anima = part('div', 'anima', animaSlot);
    this.unlit = part('img', 'unlit', this.anima);
    this.lit = part('img', 'lit', this.anima);
    part('kbd', '', this.anima, ABILITY_KEYS[0]);
    const tenet = (key: string): TenetParts => {
      const slot = part('div', 'slot', this.root);
      const well = part('div', 'tenet', slot);
      const icon = part('img', '', well);
      part('span', 'sweep', well);
      const seconds = part('span', 'seconds', well);
      part('kbd', '', slot, key);
      return { well, icon, seconds };
    };
    this.tenets = [tenet(ABILITY_KEYS[1]), tenet(ABILITY_KEYS[2])];
  }

  /** Shows `state`, writing only what differs from what is shown. */
  update(state: AbilityState): void {
    const next = abilityBarOf(state);
    const was = this.shown;
    this.shown = next;
    if (next.art !== was?.art) this.wear(next.art);
    if (next.animaRows !== was?.animaRows)
      this.lit.style.clipPath = `inset(${((ANIMA_ROWS - next.animaRows) / ANIMA_ROWS) * 100}% 0 0 0)`;
    if (next.animaFull !== was?.animaFull) this.anima.classList.toggle('full', next.animaFull);
    next.tenets.forEach((tenet, index) => {
      const parts = this.tenets[index as 0 | 1];
      const before = was?.tenets[index];
      if (tenet.sweep !== before?.sweep) parts.well.style.setProperty('--done', `${360 - tenet.sweep}deg`);
      if (tenet.seconds !== before?.seconds) parts.seconds.textContent = tenet.seconds;
      if (tenet.ready !== before?.ready) parts.well.classList.toggle('ready', tenet.ready);
    });
  }

  /** Hides the bar until it is next shown a state. */
  hide(): void {
    if (this.root.hidden && !this.shown) return;
    this.root.hidden = true;
    this.shown = null;
  }

  /** Draws the bar in `art`'s pictures and colours; hidden with none. */
  private wear(art: number): void {
    const pictures = this.pictures(art);
    const element = ELEMENTS[arts.arts.find((each) => each.id === art)?.element ?? 0];
    this.root.hidden = !pictures || !element;
    if (!pictures || !element) return;
    const [dark, , lit] = element.palette;
    this.root.style.setProperty('--art', element.colour);
    this.root.style.setProperty('--art-lit', lit);
    this.root.style.setProperty('--art-dark', dark);
    this.unlit.src = this.lit.src = pictureUrl(pictures.diamond);
    this.tenets.forEach((parts, index) => (parts.icon.src = pictureUrl(pictures.tenets[index as 0 | 1])));
  }
}
