// The sea fight's readout in the Plus kit, after DFO's helm readout (navalHud.js): the player's SHIP PLATE at the bottom
// right (its name, its hull, sails and crew as banded bars, a fire and a brace chip, and the BATTERY ROSE: bow over
// stern, port and starboard either side, each side filling as it reloads, glowing gold where the look lays it, brass-edged
// once loaded, flashing as it comes ready, and the side a blow came from flashed); the TARGET CARD under the compass
// (its name, class and distance, its hull and sail bars, its state and the key that boards it); the TALLY of the
// player's last volley; and the WARNING under the card while a battery is run out at the player's ship. A readout, never a window: made once,
// updated each frame, pressed never.
import { UNDER_COMPASS } from './compass.ts';
import { HALO, TONES } from './tones.ts';

/** A side of the player's guns as the rose shows it: its share loaded, whether ready, just come ready, laid by the look, its
 *  load and the seconds it still loads. */
export interface RoseSide {
  readonly fill: number;
  readonly ready: boolean;
  readonly fresh: boolean;
  readonly laid: boolean;
  readonly load: string;
  readonly left: number;
}

/** What the readout shows: the player's ship, the ship the card is on, and its last volley's count; any of them none. */
export interface SeaFightModel {
  readonly ship: {
    readonly name: string;
    readonly hull: number;
    readonly sail: number;
    readonly crew: number;
    readonly fire: boolean;
    readonly braced: boolean;
    readonly port: RoseSide;
    readonly starboard: RoseSide;
    readonly blow: 'bow' | 'stern' | 'port' | 'starboard' | null;
  } | null;
  readonly card: {
    readonly name: string;
    readonly sub: string;
    readonly hull: number;
    readonly sail: number;
    readonly state: 'afloat' | 'struck' | 'sinking';
    readonly hostile: boolean;
    readonly boardKey: string | null;
  } | null;
  readonly tally: {
    readonly balls: number;
    readonly hits: number;
    readonly holed: number;
    readonly rig: number;
  } | null;
  /** DFO's warning, under the card, while a captain's battery is run out at the player's ship, its words; none else. */
  readonly warn: string | null;
}

/** The gap between the card and a ship's plate under it, CSS pixels. */
const CARD_GAP = 8;

/** The bars' bands: each bar is cut in this many, as the vitals' are. */
export const BANDS = 10;

/** A share as a whole percent, held in 0 to 100. */
const percent = (share: number) => Math.round(Math.min(1, Math.max(0, share)) * 100);

/** The readout's words, as DFO's `navalHudText` says them: a side's chip, the card's state and the tally's line. */
export function seaFightWords(model: SeaFightModel) {
  const side = (rose: RoseSide) => (rose.ready ? rose.load : `${rose.load} ${Math.ceil(rose.left)}s`);
  const card = model.card;
  const state = !card
    ? ''
    : card.state === 'sinking'
      ? 'Going down'
      : card.state === 'struck'
        ? card.boardKey
          ? `Colors struck - ${card.boardKey}: board`
          : 'Colors struck'
        : card.hostile
          ? 'Hostile'
          : '';
  const tally = model.tally;
  return {
    port: model.ship ? side(model.ship.port) : '',
    starboard: model.ship ? side(model.ship.starboard) : '',
    state,
    tally: tally
      ? `${tally.hits} of ${tally.balls} ${tally.balls === 1 ? 'ball' : 'balls'} struck` +
        (tally.holed ? ` - ${tally.holed} below the waterline` : '') +
        (tally.rig ? ` - ${tally.rig} in the rigging` : '')
      : '',
  };
}

function made(tag: string, className: string, parent: HTMLElement, text = ''): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  parent.append(node);
  return node;
}

/** A banded bar: its track and its fill. */
function bar(parent: HTMLElement, kind: string, label: string): HTMLElement {
  const row = made('div', `seafight-row`, parent);
  made('span', 'seafight-label', row, label);
  const track = made('div', `seafight-bar plus-track ${kind}`, row);
  return made('i', 'plus-meter', track);
}

/** The readout: the plate with its rose, the card and the tally, made once and updated. */
export class SeaFightReadout {
  readonly root: HTMLElement;
  private readonly plate: HTMLElement;
  private readonly name: HTMLElement;
  private readonly bars: { hull: HTMLElement; sail: HTMLElement; crew: HTMLElement };
  private readonly chips: { fire: HTMLElement; brace: HTMLElement };
  private readonly rose: Record<'bow' | 'stern' | 'port' | 'starboard', HTMLElement>;
  private readonly card: HTMLElement;
  private readonly cardName: HTMLElement;
  private readonly cardSub: HTMLElement;
  private readonly cardBars: { hull: HTMLElement; sail: HTMLElement };
  private readonly cardState: HTMLElement;
  private readonly tally: HTMLElement;
  private readonly warn: HTMLElement;

  constructor(parent: HTMLElement) {
    this.root = made('div', 'seafight', parent);
    this.plate = made('div', 'seafight-plate plus-panel', this.root);
    this.name = made('div', 'seafight-name', this.plate);
    this.bars = {
      hull: bar(this.plate, 'hull', 'Hull'),
      sail: bar(this.plate, 'sail', 'Sails'),
      crew: bar(this.plate, 'crew', 'Crew'),
    };
    const chips = made('div', 'seafight-chips', this.plate);
    this.chips = {
      fire: made('span', 'seafight-chip plus-chip fire', chips, 'On fire'),
      brace: made('span', 'seafight-chip plus-chip brace', chips, 'Braced'),
    };
    const rose = made('div', 'seafight-rose', this.plate);
    this.rose = {
      bow: made('span', 'seafight-side bow', rose, 'Bow'),
      port: made('span', 'seafight-side port plus-chip', rose),
      starboard: made('span', 'seafight-side starboard plus-chip', rose),
      stern: made('span', 'seafight-side stern', rose, 'Stern'),
    };
    this.card = made('div', 'seafight-card plus-panel', this.root);
    this.cardName = made('div', 'seafight-name', this.card);
    this.cardSub = made('div', 'seafight-sub', this.card);
    this.cardBars = { hull: bar(this.card, 'hull', 'Hull'), sail: bar(this.card, 'sail', 'Sails') };
    this.cardState = made('div', 'seafight-state', this.card);
    this.tally = made('div', 'seafight-tally', this.root);
    this.warn = made('div', 'seafight-warn', this.root);
  }

  /** How far down the ships' plates may stand, CSS pixels: under the card while it shows, else under the compass. */
  get under(): number {
    return this.root.hidden || this.card.hidden
      ? UNDER_COMPASS
      : this.card.offsetTop + this.card.offsetHeight + CARD_GAP;
  }

  /** Shows `model`, or hides the readout for none. */
  update(model: SeaFightModel | null): void {
    this.root.hidden = model === null;
    if (!model) return;
    const words = seaFightWords(model);
    const { ship, card } = model;
    this.plate.hidden = ship === null;
    if (ship) {
      this.name.textContent = ship.name;
      this.bars.hull.style.width = `${percent(ship.hull)}%`;
      this.bars.sail.style.width = `${percent(ship.sail)}%`;
      this.bars.crew.style.width = `${percent(ship.crew)}%`;
      this.chips.fire.hidden = !ship.fire;
      this.chips.brace.hidden = !ship.braced;
      for (const side of ['port', 'starboard'] as const) {
        const rose = ship[side];
        const node = this.rose[side];
        node.textContent = words[side];
        node.style.setProperty('--fill', `${percent(rose.fill)}%`);
        node.classList.toggle('ready', rose.ready);
        node.classList.toggle('fresh', rose.fresh);
        node.classList.toggle('laid', rose.laid);
      }
      for (const side of ['bow', 'stern', 'port', 'starboard'] as const)
        this.rose[side].classList.toggle('blow', ship.blow === side);
    }
    this.card.hidden = card === null;
    if (card) {
      this.cardName.textContent = card.name;
      this.cardSub.textContent = card.sub;
      this.cardBars.hull.style.width = `${percent(card.hull)}%`;
      this.cardBars.sail.style.width = `${percent(card.sail)}%`;
      this.cardState.textContent = words.state;
      this.cardState.className = `seafight-state ${card.state}${card.boardKey ? ' board' : ''}`;
    }
    this.tally.hidden = words.tally === '';
    this.tally.textContent = words.tally;
    this.tally.classList.toggle('miss', model.tally?.hits === 0);
    this.warn.hidden = model.warn === null;
    if (this.warn.textContent !== (model.warn ?? '')) this.warn.textContent = model.warn ?? '';
    // Under the card, or the compass while none shows: clear of the sight and the ship aimed at.
    if (model.warn !== null) this.warn.style.top = `${this.under}px`;
  }
}

/** The readout's sheet: the plate at the bottom right, the card centred under the compass, the tally under the
 *  middle; the bars banded, the rose's sides filling from their foot, gold where laid, flashing when fresh. */
export function seaFightCss(): string {
  return `
.seafight { position: absolute; inset: 0; pointer-events: none; color: ${TONES.word}; text-shadow: ${HALO}; }
.seafight [hidden] { display: none !important; }
.seafight-plate { position: absolute; right: 18px; bottom: 18px; width: 272px; padding: 8px 10px; display: grid; gap: 4px; }
.seafight-card { position: absolute; top: ${UNDER_COMPASS}px; left: 50%; translate: -50% 0; width: min(400px, 86vw);
  padding: 6px 10px; display: grid; gap: 3px; }
.seafight-name { font-size: 14px; letter-spacing: 0.08em; }
.seafight-sub, .seafight-state, .seafight-label { font-size: 11px; color: ${TONES.wordDim}; }
.seafight-state.struck, .seafight-state.board { color: ${TONES.brassHi}; }
.seafight-state.sinking { color: #ee5745; }
.seafight-row { display: grid; grid-template-columns: 40px 1fr; align-items: center; gap: 6px; }
.seafight-bar { position: relative; height: 9px; border: 1px solid ${TONES.outline}; background: ${TONES.groundTrack}; }
.seafight-bar > i { position: absolute; inset: 0 auto 0 0; display: block; }
.seafight-bar.hull > i { background: #b8312c; }
.seafight-bar.sail > i { background: #e2d6b4; }
.seafight-bar.crew > i { background: #5f9a45; }
/* The bands: a dark notch every tenth, as the vitals' bars are cut. */
.seafight-bar::after { content: ''; position: absolute; inset: 0; pointer-events: none;
  background: repeating-linear-gradient(90deg, transparent 0 calc(${100 / BANDS}% - 1px), rgba(0,0,0,0.55) calc(${100 / BANDS}% - 1px) ${100 / BANDS}%); }
.seafight-chips { display: flex; gap: 6px; }
.seafight-chip { font-size: 10px; padding: 1px 6px; }
.seafight-chip.fire { color: #ffb066; }
.seafight-rose { display: grid; grid-template-columns: 1fr 1fr; grid-template-areas: 'bow bow' 'port starboard' 'stern stern';
  gap: 3px; text-align: center; font-size: 11px; }
.seafight-side.bow { grid-area: bow; } .seafight-side.stern { grid-area: stern; }
.seafight-side.port { grid-area: port; } .seafight-side.starboard { grid-area: starboard; }
.seafight-side.bow, .seafight-side.stern { color: ${TONES.stoneLit}; }
.seafight-side.port, .seafight-side.starboard { position: relative; padding: 2px 4px; border: 1px solid ${TONES.stoneDim};
  background: linear-gradient(0deg, color-mix(in srgb, ${TONES.brassLo} 80%, transparent) var(--fill, 0%), ${TONES.groundChip} var(--fill, 0%)); }
.seafight-side.ready { border-color: ${TONES.brass}; }
.seafight-side.laid { box-shadow: 0 0 0 1px #050608, 0 0 8px rgba(243,207,134,0.45); color: ${TONES.brassHi}; border-color: ${TONES.brassHi}; }
.seafight-side.fresh { animation: seafight-flash 0.35s steps(2) 2; }
.seafight-side.blow { outline: 2px solid #ee5745; color: #ffd0c8; }
@keyframes seafight-flash { 50% { background: ${TONES.brassHi}; color: ${TONES.outline}; } }
@media (prefers-reduced-motion: reduce) { .seafight-side.fresh { animation: none; background: ${TONES.brassHi}; } }
.seafight-tally { position: absolute; top: calc(50% + 64px); left: 50%; translate: -50% 0; font-size: 12px;
  letter-spacing: 0.1em; text-transform: uppercase; color: ${TONES.brassHi}; }
.seafight-tally.miss { color: #b3a684; }
/* DFO's warning (navalHud.js .dfnaval-warn), under the target card, never over the sight: blood-edged, pulsing in steps. */
.seafight-warn { position: absolute; top: ${UNDER_COMPASS}px; left: 50%; translate: -50% 0; white-space: nowrap;
  padding: 3px 12px 4px; font-size: 15px; letter-spacing: 0.16em; text-transform: uppercase; color: #ffd9cf;
  background: rgba(60, 12, 8, 0.72); border: 2px solid; border-color: #e0584a #5a130f #3d0d0a #b83a2e;
  box-shadow: 0 0 0 1px ${TONES.outline}; animation: seafight-warn 0.5s steps(1) infinite; }
@keyframes seafight-warn { 50% { color: #ff9c8a; border-color: #ff8a76 #7a1a12 #52110c #e0584a; } }
@media (prefers-reduced-motion: reduce) { .seafight-warn { animation: none; } }
/* In a sea fight the sea's status line stands in the top right corner, off the sky the aim looks at. */
#hud:has(> .seafight:not([hidden])) > .status { left: auto; right: 28px; top: 22px; transform: none; }
`;
}

const SHEET_ID = 'plus-seafight';

/** Lays the readout's sheet on `page`, once. */
export function wearSeaFight(page: Document): void {
  if (page.getElementById(SHEET_ID)) return;
  const sheet = page.createElement('style');
  sheet.id = SHEET_ID;
  sheet.textContent = seaFightCss();
  page.head.append(sheet);
}
