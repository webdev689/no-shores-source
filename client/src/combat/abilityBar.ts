// The Art's abilities at the bottom left, as Destiny shows a Super and its abilities: the Anima's icon in a diamond,
// lit from the bottom as it charges and glowing once full; the two Tenets' icons in rings, a dark wedge over each
// sweeping clockwise away as it recharges, its last seconds counted in it, the ring lit once ready. Each has its key on
// a keycap under it. A spell just cast flashes its frame white; while the player cannot cast (staggered, down, dead),
// every icon greys under a hatch. What it shows is worked out from the room's numbers alone, and only what changed is
// written.
import arts from '../../../content/arts/arts.json' with { type: 'json' };
import { HALO, TONES } from '../plus/tones.ts';
import { ELEMENTS } from '../player/gear.ts';
import { ARMS_SIZES, DIAMOND_CELLS, RING_CELLS } from './hudLayout.ts';
import { element } from './meter.ts';

/** The keys that cast the Anima and the two Tenets. */
export const ABILITY_KEYS = ['R', 'Q', 'G'] as const;
/** The Anima's icon's rows: it lights a whole row of its picture at a time. */
export const ANIMA_ROWS = 24;
/** A Tenet's icon's cells, and the clear middle of its ring, across. */
const TENET_CELLS = 12;
const RING_CLEAR = 14;
/** The steps a Tenet's wedge sweeps in, round the circle. */
const SWEEP_STEPS = 60;
/** A Tenet counts its seconds only once fewer than this are left. */
const COUNT_UNDER = 10;
/** How long a spell just cast flashes, in seconds. */
export const USED_SECONDS = 0.5;
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

/** The pictures the bar draws an Art with, as SVG: its Anima's icon and that icon's outline alone, its two Tenets'
 *  icons, and the Anima's diamond and a Tenet's ring. The game's glyphs make them, so the HUD needs no picture of its
 *  own. */
export interface ArtPictures {
  readonly anima: string;
  readonly animaOutline: string;
  readonly tenets: readonly [string, string];
  readonly diamond: string;
  readonly ring: string;
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

/** Which of the Anima and the two Tenets were spent between `was` and `now`: full before, short of it after. */
export function spentBetween(was: AbilityState | null, now: AbilityState): readonly [boolean, boolean, boolean] {
  const spent = (before: number | undefined, after: number) => before !== undefined && before >= 1 && after < 1;
  const same = was?.art === now.art;
  return [
    same && spent(was.animaShare, now.animaShare),
    same && spent(was.tenets[0], now.tenets[0]),
    same && spent(was.tenets[1], now.tenets[1]),
  ];
}

const SHEET_ID = 'ability-bar';
/** The bar's sheet at one step, `scope` the display's class for it: each picture a whole multiple of its cells. */
function stepCss(scope: string, cell: number, gap: number): string {
  const diamond = DIAMOND_CELLS * cell;
  const ring = RING_CELLS * cell;
  const clear = RING_CLEAR * cell;
  return `
${scope} .abilities { gap: ${gap}px; }
${scope} .abilities .anima { width: ${diamond}px; height: ${diamond}px; }
${scope} .abilities .anima .icon { inset: ${((DIAMOND_CELLS - ANIMA_ROWS) / 2) * cell}px; }
${scope} .abilities .tenet { width: ${ring}px; height: ${ring}px; }
${scope} .abilities .tenet .icon { inset: ${((RING_CELLS - TENET_CELLS) / 2) * cell}px; }
${scope} .abilities .tenet .sweep { inset: ${(ring - clear) / 2}px; }
${scope} .abilities kbd { min-width: ${cell * 9}px; font-size: ${cell === 2 ? 11 : 22}px;
  line-height: ${cell === 2 ? 14 : 24}px; margin-top: -${cell * 3}px; }
${scope} .abilities .seconds { font-size: ${cell === 2 ? 22 : 33}px; }`;
}

const SHEET = `
.fight-hud .abilities { display: flex; align-items: flex-end; pointer-events: none; }
.fight-hud .abilities[hidden] { display: none; }
.fight-hud .abilities .slot { position: relative; display: flex; flex-direction: column; align-items: center; }
.fight-hud .abilities img { display: block; image-rendering: pixelated; }
.fight-hud .abilities .anima, .fight-hud .abilities .tenet { position: relative; flex: none; }
.fight-hud .abilities .frame { position: absolute; inset: 0; width: 100%; height: 100%;
  filter: drop-shadow(1px 1px 0 ${TONES.outline}); }
.fight-hud .abilities .icon { position: absolute; }
.fight-hud .abilities .icon img { position: absolute; inset: 0; width: 100%; height: 100%; }
.fight-hud .abilities .anima .unlit { filter: grayscale(0.85) brightness(0.5); }
.fight-hud .abilities .anima:not(.full) .frame { filter: saturate(0.45) brightness(0.8)
  drop-shadow(1px 1px 0 ${TONES.outline}); }
.fight-hud .abilities .anima.full .frame { filter: drop-shadow(1px 1px 0 ${TONES.outline})
  drop-shadow(0 0 6px var(--art)); }
.fight-hud .abilities .anima.full .lit { filter: drop-shadow(0 0 4px var(--art)); }
.fight-hud .abilities .tenet:not(.ready) .frame { filter: saturate(0.45) brightness(0.8)
  drop-shadow(1px 1px 0 ${TONES.outline}); }
.fight-hud .abilities .tenet:not(.ready) .icon img { filter: saturate(0.5) brightness(0.7); }
/* Its last seconds counted, the icon steps back so the number reads. */
.fight-hud .abilities .tenet.counting .icon img { opacity: 0.3; }
.fight-hud .abilities .tenet.ready .frame { filter: brightness(1.25) drop-shadow(1px 1px 0 ${TONES.outline})
  drop-shadow(0 0 5px var(--art)); }
.fight-hud .abilities .sweep { position: absolute; border-radius: 50%; background: conic-gradient(transparent 0
  var(--done), rgba(5, 6, 8, 0.72) var(--done) 360deg); }
.fight-hud .abilities .tenet.ready .sweep { display: none; }
.fight-hud .abilities .seconds { position: absolute; inset: 0; display: grid; place-items: center; line-height: 1;
  color: ${TONES.word}; text-shadow: ${HALO}; font-variant-numeric: tabular-nums; }
/* A spell just cast: its frame white for a beat, in two hard steps. */
.fight-hud .abilities .used .frame { animation: ability-used ${USED_SECONDS}s steps(2, end) forwards; }
@keyframes ability-used { from { filter: brightness(3) drop-shadow(0 0 6px #fff); } to { filter: none; } }
/* Unable to cast: every icon greys under a hatch, so it never reads by its colour alone. */
.fight-hud .abilities.unable .anima::after, .fight-hud .abilities.unable .tenet::after { content: ''; position: absolute;
  inset: 22%; border-radius: 50%; background: repeating-linear-gradient(135deg, rgba(5,6,8,0.75) 0 3px,
  transparent 3px 6px); }
.fight-hud .abilities.unable img { filter: grayscale(1) brightness(0.6) !important; }
.fight-hud .abilities kbd { position: relative; box-sizing: border-box; padding: 0 4px; border: 1px solid;
  border-color: ${TONES.stoneLit} ${TONES.stoneDark} ${TONES.stoneDark} ${TONES.stoneLit}; border-bottom-width: 2px;
  background: #16181d; font: inherit; text-align: center; color: ${TONES.word};
  box-shadow: 0 0 0 1px ${TONES.outline}; }
${stepCss('.fight-hud', ARMS_SIZES.base.cell, ARMS_SIZES.base.gap)}
${stepCss('.fight-hud.wide', ARMS_SIZES.wide.cell, ARMS_SIZES.wide.gap)}
@media (prefers-reduced-motion: no-preference) {
  .fight-hud .abilities .anima.full .frame { animation: ability-full 1.6s steps(4, end) infinite alternate; }
}
@media (prefers-reduced-motion: reduce) {
  .fight-hud .abilities .used .frame { animation: none; outline: 2px solid #fff; outline-offset: -2px; }
}
@keyframes ability-full { from { filter: drop-shadow(1px 1px 0 ${TONES.outline}) drop-shadow(0 0 3px var(--art)); }
  to { filter: drop-shadow(1px 1px 0 ${TONES.outline}) drop-shadow(0 0 9px var(--art)); } }
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

/** One ability's frame and icon, and what the bar last wrote in it. */
interface Slot {
  readonly root: HTMLElement;
  readonly frame: HTMLImageElement;
  readonly icon: HTMLImageElement;
  used: number;
}

/** The bar on the HUD, written each frame from an `AbilityState`; only what changed reaches the page. */
export class AbilityBar {
  readonly root: HTMLElement;
  private readonly unlit: HTMLImageElement;
  private readonly outline: HTMLImageElement;
  private readonly lit: HTMLImageElement;
  private readonly slots: readonly [Slot, Slot, Slot];
  private readonly seconds: readonly [HTMLElement, HTMLElement];
  private readonly pictures: (art: number) => ArtPictures | null;
  private shown: AbilityShown | null = null;
  private state: AbilityState | null = null;
  private unable = false;

  constructor(parent: HTMLElement, pictures: (art: number) => ArtPictures | null) {
    this.pictures = pictures;
    wearSheet(parent.ownerDocument);
    this.root = element('div', 'abilities', parent);
    this.root.hidden = true;
    this.root.role = 'group';
    this.root.ariaLabel = 'Your Art';
    // Each ability: its frame, its icon (the Anima's three pictures, unlit, outlined and lit, one over another) and
    // its key on a keycap under it.
    const slot = (kind: string, key: string, icons: readonly string[]): Slot & { pictures: HTMLImageElement[] } => {
      const holder = element('div', 'slot', this.root);
      const root = element('div', kind, holder);
      root.role = 'img';
      const frame = element('img', 'frame', root) as HTMLImageElement;
      const icon = element('div', 'icon', root);
      const pictures = icons.map((name) => element('img', name, icon) as HTMLImageElement);
      element('kbd', '', holder, key);
      return { root, frame, icon: pictures[0] as HTMLImageElement, used: 0, pictures };
    };
    const anima = slot('anima', ABILITY_KEYS[0], ['unlit', 'outline', 'lit']);
    [this.unlit, this.outline, this.lit] = anima.pictures as [HTMLImageElement, HTMLImageElement, HTMLImageElement];
    const first = slot('tenet', ABILITY_KEYS[1], ['']);
    const second = slot('tenet', ABILITY_KEYS[2], ['']);
    this.slots = [anima, first, second];
    const counted = (tenet: Slot) => {
      element('span', 'sweep', tenet.root);
      return element('span', 'seconds', tenet.root);
    };
    this.seconds = [counted(first), counted(second)];
  }

  /** Shows `state` `seconds` on, greyed while the player is `unable` to cast, writing only what differs. */
  update(state: AbilityState, seconds = 0, unable = false): void {
    const next = abilityBarOf(state);
    const was = this.shown;
    this.shown = next;
    const spent = spentBetween(this.state, state);
    this.state = state;
    if (next.art !== was?.art) this.wear(next.art);
    if (next.animaRows !== was?.animaRows)
      this.lit.style.clipPath = `inset(${((ANIMA_ROWS - next.animaRows) / ANIMA_ROWS) * 100}% 0 0 0)`;
    const [anima, ...tenets] = this.slots;
    if (next.animaFull !== was?.animaFull) anima.root.classList.toggle('full', next.animaFull);
    next.tenets.forEach((tenet, index) => {
      const slot = tenets[index] as Slot;
      const before = was?.tenets[index];
      if (tenet.sweep !== before?.sweep) slot.root.style.setProperty('--done', `${360 - tenet.sweep}deg`);
      const counted = this.seconds[index as 0 | 1];
      if (tenet.seconds !== before?.seconds) {
        counted.textContent = tenet.seconds;
        slot.root.classList.toggle('counting', tenet.seconds !== '');
      }
      if (tenet.ready !== before?.ready) slot.root.classList.toggle('ready', tenet.ready);
    });
    this.slots.forEach((slot, index) => {
      slot.used = spent[index] ? USED_SECONDS : Math.max(0, slot.used - seconds);
      slot.root.classList.toggle('used', slot.used > 0);
    });
    if (unable !== this.unable) this.root.classList.toggle('unable', unable);
    this.unable = unable;
    this.say(next, unable);
  }

  /** Hides the bar until it is next shown a state. */
  hide(): void {
    if (this.root.hidden && !this.shown) return;
    this.root.hidden = true;
    [this.shown, this.state] = [null, null];
  }

  /** What a screen reader says of each ability: its name, then ready, charging with its share, or its seconds. */
  private say(shown: AbilityShown, unable: boolean): void {
    const art = arts.arts.find((each) => each.id === shown.art);
    if (!art || !this.state) return;
    const animaWords = shown.animaFull ? 'ready' : `charging, ${Math.floor(share(this.state.animaShare) * 100)}%`;
    const words = [
      `${art.anima.name} (${ABILITY_KEYS[0]}), ${unable ? 'cannot be cast now' : animaWords}`,
      ...shown.tenets.map((tenet, index) => {
        const name = art.tenets[index]?.name ?? '';
        const left = Math.ceil((1 - share(this.state?.tenets[index] ?? 0)) * (art.tenets[index]?.rechargeS ?? 0));
        const how = unable ? 'cannot be cast now' : tenet.ready ? 'ready' : `${left} s to recharge`;
        return `${name} (${ABILITY_KEYS[index + 1]}), ${how}`;
      }),
    ];
    this.slots.forEach((slot, index) => {
      const said = words[index] ?? '';
      if (slot.root.ariaLabel !== said) slot.root.ariaLabel = said;
    });
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
    const [anima, first, second] = this.slots;
    anima.frame.src = pictureUrl(pictures.diamond);
    first.frame.src = second.frame.src = pictureUrl(pictures.ring);
    this.unlit.src = this.lit.src = pictureUrl(pictures.anima);
    this.outline.src = pictureUrl(pictures.animaOutline);
    first.icon.src = pictureUrl(pictures.tenets[0]);
    second.icon.src = pictureUrl(pictures.tenets[1]);
  }
}
