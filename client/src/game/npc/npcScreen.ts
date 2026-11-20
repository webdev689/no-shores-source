// The one screen every keeper of a social space opens, after Destiny 1's vendors (the owner's three references): the
// keeper large at the left over a ground lit in their colour, their mark and title above them; at the right their
// words, the currencies they deal in (and a faction's rank and its meter), the band they speak in, their wares in
// rows under engraved headings, and at the foot the time to the next stock, or to Shape's leaving. The menu
// (gearWindow.ts) frames it with its header and footer; the vault keeps its own page.
import './npcScreen.css';
import { make } from '../../editor/dom.ts';
import type { GearState } from '../../network/gearMessages.ts';
import type { Cards } from '../../player/cards.ts';
import { ELEMENTS } from '../../player/gear.ts';
import { ROLES } from '../../plus/kit.ts';
import type { PageContext } from '../characterPage.ts';
import { emblemImage, emblemOf } from '../emblemArt.ts';
import { type Hint, glyphImage } from '../gearDom.ts';
import { STEP_BACK, type View } from '../gearScreen.ts';
import { KEEPERS, KEEPER_KINDS, type KeeperKind } from '../keepers.ts';
import { clockWords, secondsToMidnight, shapeSecondsLeft } from './npcClock.ts';
import { factionOf, rankRewards, reputationOf } from './factionRows.ts';
import { keeperFigure } from './npcFigure.ts';
import { keeperMarkSvg, svgUrl } from './npcMarks.ts';
import { type Asked, answeredWith } from './npcLines.ts';
import { hush, keeperSays, speechBand } from './npcSpeech.ts';
import { coinGlyph, meter, rowNode } from './npcTiles.ts';
import { type Ware, purseOf, rowsOf } from './npcWares.ts';

/** The keepers whose wares change each day at midnight. */
const DAILY: readonly KeeperKind[] = ['armorsmith', 'weaponsmith', 'tailor', 'tack'];
/** The menu's brass, the ground of a keeper who serves no Art. */
const BRASS = '#c08a3e';
/** What the footer says the screen's keys do, as the references' footer does: the Mage's holds open a Vestige. */
export const npcHints = (view: View): readonly Hint[] => [
  ['Hold', view === 'mage' ? 'Open' : 'Buy'],
  ['I', 'Open Character'],
  ['Esc', 'Dismiss'],
];
/** The figure's height beside what the screen's body leaves it, and the least it is drawn at. */
const FIGURE_AROUND = 120;
const FIGURE_LEAST = 200;

/** Whether a view of the menu is a keeper's screen: every keeper's but the vault's. */
export const isKeeperView = (view: View): view is Exclude<KeeperKind, 'vault'> =>
  view !== 'vault' && (KEEPER_KINDS as readonly string[]).includes(view);

/** Whether the Art's rise waits on its fragment; the asks that wait on the room's answers (how many it had answered
 *  at the first, and how many were made); and when Shape's minutes were heard. */
let choosing = false;
/** Whether the choice has just opened, so its first fragment takes the focus. */
let chosenFirst = false;
let pending: Asked | null = null;
let heard: { readonly gear: GearState; readonly at: number } | null = null;

/** The screen opens at `view`: a keeper's greets the player; any other view hushes the last. */
export function npcOpened(view: View): void {
  [choosing, pending] = [false, null];
  if (isKeeperView(view)) keeperSays(view, 'Hello');
  else hush();
}

/** The keeper's colour: a faction's in its Art's element, else the menu's brass. */
function glowOf(kind: KeeperKind): string {
  const faction = KEEPERS[kind].faction;
  const element = faction === undefined ? 0 : (factionOf(faction)?.art.element ?? 0);
  return ELEMENTS[element]?.colour ?? BRASS;
}

/** The diamond by the keeper's title: a faction's emblem, else the keeper's own mark. */
function markOf(kind: KeeperKind): HTMLElement {
  const faction = KEEPERS[kind].faction;
  const mark = make('img', '', 'npc-mark');
  mark.alt = '';
  const emblem = faction === undefined ? null : factionOf(faction)?.faction.emblem;
  mark.src = emblem ? emblemImage(emblemOf(emblem), 'sign') : svgUrl(keeperMarkSvg(kind));
  mark.classList.toggle('npc-mark-emblem', Boolean(emblem));
  return mark;
}

/** The currencies at the top right, and for a faction the rank, its meter and the reputation's details. */
function purseNode(context: PageContext, kind: KeeperKind): HTMLElement {
  const purse = make('div', '', 'npc-purse');
  for (const coin of purseOf(kind, context.gear)) {
    const shown = make('span', '', 'npc-coin-line');
    shown.title = coin.name;
    shown.append(
      coin.glyph === 'shapes' ? coinGlyph('shapes') : glyphImage(coin.glyph),
      make('b', coin.amount.toLocaleString('en')),
    );
    shown.setAttribute('aria-label', `${coin.amount.toLocaleString('en')} ${coin.name}`);
    purse.append(shown);
  }
  const faction = KEEPERS[kind].faction;
  if (faction === undefined) return purse;
  const standing = reputationOf(faction, context.gear.standing);
  const rank = make('div', '', 'npc-rank');
  rank.append(make('b', `Rank ${standing.rank}`), meter(standing.toNext, standing.words));
  const details = make('button', 'Reputation details', `npc-details ${ROLES.button}`);
  details.dataset['key'] = 'npc-details';
  context.tip.over(details, () => {
    const card = make('div', '', `gear-card ${ROLES.panel}`);
    const body = make('div', '', 'gear-card-body');
    for (const words of ['Earned in the world while pledged to them and wearing their cape.', rankRewards(faction)])
      body.append(make('p', words, 'gear-card-words'));
    card.append(make('div', 'Reputation', 'gear-card-head'), body);
    return card;
  });
  rank.append(details);
  const both = make('div', '', 'npc-purses');
  both.append(purse, rank);
  return both;
}

/** The foot's countdown, kept to the second while the page stands: to midnight, or to Shape's leaving. */
function footNode(kind: KeeperKind, gear: GearState): HTMLElement | null {
  const shape = kind === 'shape' ? gear.shape : null;
  if (!DAILY.includes(kind) && !shape) return null;
  if (shape && heard?.gear !== gear) heard = { gear, at: Date.now() };
  const foot = make('div', '', `npc-foot ${ROLES.well}`);
  const label = make('span', shape ? 'Leaves in' : 'Stock refresh', 'npc-foot-label');
  const time = make('b', '', 'npc-foot-time');
  const tick = () => {
    const now = Date.now();
    time.textContent = clockWords(
      shape ? shapeSecondsLeft(shape.minutesLeft, heard?.at ?? now, now) : secondsToMidnight(now),
    );
  };
  tick();
  const timer = window.setInterval(() => (foot.isConnected ? tick() : window.clearInterval(timer)), 1000);
  foot.append(label, time);
  return foot;
}

/** The arrows move among the tiles: along their row, and to the nearest tile in the row above or below. */
function arrowsAmong(page: HTMLElement): void {
  page.addEventListener('keydown', (event) => {
    const steps: Record<string, readonly [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const step = steps[event.key];
    const from = document.activeElement;
    const tiles = [...page.querySelectorAll<HTMLElement>('.npc-tile')];
    if (!step || !(from instanceof HTMLElement) || !tiles.includes(from)) return;
    event.preventDefault();
    const here = from.getBoundingClientRect();
    const [across, down] = step;
    const next =
      across !== 0
        ? tiles[tiles.indexOf(from) + across]
        : tiles
            .map((tile) => ({ tile, box: tile.getBoundingClientRect() }))
            .filter(({ box }) => (down > 0 ? box.top >= here.bottom : box.bottom <= here.top))
            .sort(
              (one, other) =>
                Math.abs(one.box.top - here.top) - Math.abs(other.box.top - here.top) ||
                Math.abs(one.box.left - here.left) - Math.abs(other.box.left - here.left),
            )[0]?.tile;
    next?.focus();
  });
}

/** A keeper's screen, built anew each time the gear changes; `redraw` asks the menu to build it again. */
export function npcPage(context: PageContext, kind: KeeperKind, forge: Cards | null, redraw: () => void): HTMLElement {
  const { gear } = context;
  // The room's answer to the asks made here: thanks for a ware bought, a word for a price not met.
  const heard = pending ? answeredWith(pending, gear.answered, gear.answer) : undefined;
  if (heard !== undefined) {
    pending = null;
    if (heard === 'Thanks') choosing = false;
    if (heard) keeperSays(kind, heard);
  }
  const keeper = KEEPERS[kind];
  const page = make('div', '', 'npc-screen');
  page.style.setProperty('--npc-glow', glowOf(kind));
  const stage = make('div', '', 'npc-stage');
  const title = make('div', '', 'npc-title');
  title.append(markOf(kind), make('h2', keeper.title.toUpperCase(), 'npc-name'));
  const figure = keeperFigure(kind, forge, Math.max(FIGURE_LEAST, context.room - FIGURE_AROUND), redraw);
  stage.append(title, figure, make('div', '', 'npc-floor'));
  const side = make('div', '', 'npc-side');
  side.append(make('p', keeper.words, 'npc-words'), purseNode(context, kind), speechBand(kind));
  const act = (ware: Ware) => {
    if (!ware.ask) return;
    pending = pending ? { ...pending, asked: pending.asked + 1 } : { from: gear.answered, asked: 1 };
    context.ask(ware.ask);
  };
  const open = () => {
    choosing = !choosing;
    chosenFirst = choosing;
    redraw();
  };
  const rows = rowsOf(kind, gear, choosing);
  const wares = make('div', '', 'npc-rows');
  wares.append(...rows.map((row) => rowNode(context, row, act, open)));
  if (kind === 'shape' && !gear.shape)
    wares.append(make('p', 'Shape has gone. He comes again on Friday.', 'gear-hint npc-empty'));
  side.append(wares);
  const foot = footNode(kind, gear);
  if (foot) side.append(foot);
  page.append(stage, side);
  arrowsAmong(page);
  if (chosenFirst) {
    chosenFirst = false;
    // After the menu has given the focus back to the press that opened the choice.
    window.setTimeout(() => page.querySelector<HTMLElement>('[data-key^="npc-rise-"]')?.focus());
  }
  // Escape first closes the Art's choice of fragments, then the screen.
  page.addEventListener(STEP_BACK, (event) => {
    if (!choosing) return;
    event.preventDefault();
    choosing = false;
    redraw();
  });
  return page;
}
