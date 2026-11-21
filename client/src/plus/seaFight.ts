// The sea fight's readout in the Plus kit, after DFO's helm readout (navalHud.js), built as the on-foot HUD is: the
// player's SHIP PLATE at the top left is the vitals' long thin bars (Hull over Sails over Crew, the hull's frame
// flashing low as health's does; a fire and a brace chip under them; and the BATTERY ROSE of its sides' reloads);
// the TARGET CARD under the compass is the target's plate (the faction's emblem, its name, one hull bar in its rank's
// colour, its class, distance and state as small words); the TALLY of the last volley; and the WARNING under the
// card while a battery is run out at the player's ship. A readout, never a window: made once, updated each frame.
import { barSheetCss, thinBarsCss } from './barSheet.ts';
import { BAR_TONES, CORNER, VITAL_SIZES } from './barFrame.ts';
import { PIECE_LEAST } from './barLoss.ts';
import { UNDER_COMPASS } from './compass.ts';
import { ROLES } from './kit.ts';
import { element as made, lowShare, Meter } from './meter.ts';
import { FILLS, HALO, TONES } from './tones.ts';

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
    /** The captain's faction (1 the Grey Tithe, 2 pirates), whose emblem the card frames. */
    readonly faction: number;
    /** The colour its bar is in, as a foe's plate's: its rank's band, or an ally's. */
    readonly band: string;
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

/** The ship's bars as the vitals' thin bars: the hull at health's height, its frame warning in blood; the sails and
 *  the crew at stamina's. */
const SHIP_BARS = {
  hull: { base: VITAL_SIZES.base.health, wide: VITAL_SIZES.wide.health, alert: BAR_TONES.blood },
  sails: { base: VITAL_SIZES.base.stamina, wide: VITAL_SIZES.wide.stamina, alert: BAR_TONES.blood },
  crew: { base: VITAL_SIZES.base.stamina, wide: VITAL_SIZES.wide.stamina, alert: BAR_TONES.blood },
} as const;

/** A bar of the vitals' build: its framed node, named for a screen reader, and the meter in it. */
function vital(panel: HTMLElement, kind: keyof typeof SHIP_BARS, label: string) {
  const node = made('div', `vital ${kind}`, panel);
  node.role = 'meter';
  node.ariaLabel = label;
  node.ariaValueMin = '0';
  node.ariaValueMax = '100';
  const meter = new Meter(node, 'bar', { pieceLeast: PIECE_LEAST.vital });
  // A meter is a well, not a track, here: the frame gives the bar its edge.
  meter.root.classList.remove(ROLES.track);
  return { node, meter };
}

/** The readout: the plate with its rose, the card and the tally, made once and updated. */
export class SeaFightReadout {
  readonly root: HTMLElement;
  private readonly plate: HTMLElement;
  private readonly bars: Record<'hull' | 'sail' | 'crew', ReturnType<typeof vital>>;
  private readonly chips: { fire: HTMLElement; brace: HTMLElement };
  private readonly rose: Record<'bow' | 'stern' | 'port' | 'starboard', HTMLElement>;
  private readonly card: HTMLElement;
  private readonly emblem: HTMLElement;
  private readonly cardName: HTMLElement;
  private readonly cardSub: HTMLElement;
  private readonly cardState: HTMLElement;
  private readonly cardHull: Meter;
  private readonly tally: HTMLElement;
  private readonly warn: HTMLElement;
  /** When the readout was last shown, seconds, so its bars' losses drain in time. */
  private shownAt: number | null = null;
  /** The card's ship last shown, so its bar forgets another's losses. */
  private carded: string | null = null;
  /** The layout the bars were last laid at. */
  private laidAt = '';

  constructor(parent: HTMLElement) {
    this.root = made('div', 'seafight', parent);
    // The vitals' thin bars, as on foot.
    this.plate = made('div', 'vitals seafight-plate', this.root);
    this.plate.role = 'group';
    this.plate.ariaLabel = 'Your ship';
    this.bars = {
      hull: vital(this.plate, 'hull', 'Hull'),
      sail: vital(this.plate, 'sails', 'Sails'),
      crew: vital(this.plate, 'crew', 'Crew'),
    };
    const chips = made('div', 'seafight-chips', this.plate);
    this.chips = {
      fire: made('span', `seafight-chip ${ROLES.chip} fire`, chips, 'On fire'),
      brace: made('span', `seafight-chip ${ROLES.chip} brace`, chips, 'Braced'),
    };
    const rose = made('div', 'seafight-rose', this.plate);
    this.rose = {
      bow: made('span', 'seafight-side bow', rose, 'Bow'),
      port: made('span', `seafight-side port ${ROLES.chip}`, rose),
      starboard: made('span', `seafight-side starboard ${ROLES.chip}`, rose),
      stern: made('span', 'seafight-side stern', rose, 'Stern'),
    };
    // The target's plate, as on foot: the emblem framed, the title, one bar.
    this.card = made('div', 'plate target seafight-card', this.root);
    this.emblem = made('i', `emblem ${ROLES.chip}`, this.card);
    const body = made('div', 'body', this.card);
    const title = made('div', 'title', body);
    this.cardName = made('span', 'name', title);
    this.cardSub = made('span', 'sub', title);
    this.cardState = made('span', 'state', title);
    this.cardHull = new Meter(body, 'health', { pieceLeast: PIECE_LEAST.foe });
    this.tally = made('div', 'seafight-tally', this.root);
    this.warn = made('div', 'seafight-warn', this.root);
  }

  /** How far down the ships' plates may stand, CSS pixels: under the card and the warning while they show, else under
   *  the compass; measured once a frame, as the readout is shown. */
  under = UNDER_COMPASS;

  /** Lays the bars as the vitals on foot are laid (`combat/hudLayout.ts`): their `length`, and whether they stand at
   *  the larger step or doubled. Unlaid, as in the World Editor, they stand at the first step, 160 px long. */
  lay(layout: { readonly length: number; readonly wide: boolean; readonly zoom: number }): void {
    const { length, wide, zoom } = layout;
    const laid = `${length} ${wide} ${zoom}`;
    if (laid === this.laidAt) return;
    this.laidAt = laid;
    this.root.classList.toggle('wide', wide);
    this.root.classList.toggle('double', zoom === 2);
    for (const { node } of Object.values(this.bars)) node.style.width = `${length}px`;
  }

  /** Shows `model`, or hides the readout for none. */
  update(model: SeaFightModel | null): void {
    this.root.hidden = model === null;
    this.under = UNDER_COMPASS;
    const clock = performance.now() / 1000;
    const seconds = this.shownAt === null ? 0 : Math.min(0.1, Math.max(0, clock - this.shownAt));
    this.shownAt = model ? clock : null;
    if (!model) return;
    const words = seaFightWords(model);
    const { ship, card } = model;
    this.plate.hidden = ship === null;
    if (ship) {
      for (const kind of ['hull', 'sail', 'crew'] as const) {
        const { node, meter } = this.bars[kind];
        meter.set(ship[kind], seconds);
        const said = String(percent(ship[kind]));
        if (node.ariaValueNow !== said) node.ariaValueNow = said;
      }
      this.bars.hull.node.classList.toggle('low', lowShare(ship.hull));
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
      if (this.carded !== card.name) this.cardHull.forget();
      this.carded = card.name;
      const { dataset } = this.card;
      if (dataset['band'] !== card.band) dataset['band'] = card.band;
      const faction = String(card.faction);
      if (this.emblem.dataset['faction'] !== faction) this.emblem.dataset['faction'] = faction;
      this.cardName.textContent = card.name;
      this.cardSub.textContent = card.sub;
      this.cardHull.set(card.hull, seconds);
      this.cardState.textContent = words.state;
      this.cardState.className = `state ${card.state}${card.boardKey ? ' board' : ''}`;
    }
    this.tally.hidden = words.tally === '';
    this.tally.textContent = words.tally;
    this.tally.classList.toggle('miss', model.tally?.hits === 0);
    this.warn.hidden = model.warn === null;
    if (this.warn.textContent !== (model.warn ?? '')) this.warn.textContent = model.warn ?? '';
    // The warning under the card, or the compass while none shows: clear of the sight and the ship aimed at; the
    // ships' plates under both.
    if (card) this.under = this.card.offsetTop + this.card.offsetHeight + CARD_GAP;
    if (model.warn !== null) {
      this.warn.style.top = `${this.under}px`;
      this.under += this.warn.offsetHeight + CARD_GAP;
    }
  }
}

/** The readout's sheet: the plate at the top left, the card centred under the compass, the tally under the middle;
 *  the bars banded, the rose as wide as its longest words ("Heated 88s" a side) so it never shifts as they change, its
 *  sides filling from their foot, gold where laid, flashing when fresh. */
export function seaFightCss(): string {
  const step = (scope: string, sizes: { readonly gap: number }) =>
    `${scope} .vitals { left: ${CORNER.side}px; top: ${CORNER.top}px; gap: ${sizes.gap}px; }`;
  return `${barSheetCss('.seafight')}${thinBarsCss('.seafight', SHIP_BARS)}
.seafight { position: absolute; inset: 0; pointer-events: none; color: ${TONES.word}; text-shadow: ${HALO}; }
.seafight [hidden] { display: none !important; }
${step('.seafight', VITAL_SIZES.base)}
${step('.seafight.wide', VITAL_SIZES.wide)}
.seafight .vital.hull { --fill: ${FILLS.health}; }
.seafight .vital.sails { --fill: ${FILLS.sails}; }
.seafight .vital.crew { --fill: ${FILLS.stamina}; }
.seafight .target { position: absolute; top: ${UNDER_COMPASS}px; left: 50%; translate: -50% 0; }
.seafight .target .sub, .seafight .target .state { font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase;
  color: ${TONES.wordDim}; }
.seafight .target .state:empty { display: none; }
.seafight .target .state.struck, .seafight .target .state.board { color: ${TONES.brassHi}; }
.seafight .target .state.sinking { color: #ee5745; }
.seafight-chips { display: flex; gap: 6px; margin-top: 4px; }
.seafight-chip { font-size: 10px; padding: 1px 6px; border-width: 1px; border-style: solid; }
.seafight-chip.fire { color: #ffb066; }
.seafight-rose { display: grid; grid-template-columns: 1fr 1fr; grid-template-areas: 'bow bow' 'port starboard' 'stern stern';
  gap: 3px; width: 172px; margin-top: 4px; text-align: center; font-size: 11px; }
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
/* In a sea fight the sea's status line stands in the top right corner, off the sky the aim looks at, and the place's
   name gives way to the ship's bars at the top left, as it does to the ships' plates. */
#hud:has(> .seafight:not([hidden])) > .status { left: auto; right: 28px; top: 22px; transform: none; }
#hud:has(> .seafight:not([hidden])) .place { visibility: hidden; }
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
