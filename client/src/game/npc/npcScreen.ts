// The one screen every keeper of a social space opens, after Destiny 1's vendors: the keeper large at the left over a
// ground lit in their colour, their mark and title above them; at the right their words, the currencies they deal in
// (and a faction's rank and its meter), the band they speak in, their wares in rows under engraved headings (the
// vault keeper's two sides of the vault in their place, the Postmaster's letters in theirs), and at the foot the time to the next stock, or to Shape's
// leaving. The menu (gearWindow.ts) frames it with its header and footer.
import './npcScreen.css';
import { make } from '../../editor/dom.ts';
import type { GearAsk, GearState } from '../../network/gearMessages.ts';
import type { Cards } from '../../player/cards.ts';
import { ELEMENTS } from '../../player/gear.ts';
import { ROLES } from '../../plus/kit.ts';
import type { PageContext } from '../characterPage.ts';
import { emblemImage, emblemOf } from '../emblemArt.ts';
import { type Hint, glyphImage } from '../gearDom.ts';
import { STEP_BACK, type View } from '../gearScreen.ts';
import { KEEPERS, KEEPER_KINDS, type KeeperKind } from '../keepers.ts';
import { clockWords, countdownsAt } from './npcClock.ts';
import { factionOf, rankRewards, reputationOf } from './factionRows.ts';
import { keeperFigure } from './npcFigure.ts';
import { mailPage } from './mailPage.ts';
import { keeperMarkSvg, svgUrl } from './npcMarks.ts';
import { type Asked, answeredWith } from './npcLines.ts';
import { hush, keeperSays, speechBand } from './npcSpeech.ts';
import { coinGlyph, meter, rowNode } from './npcTiles.ts';
import { type Ware, purseOf, rowsOf } from './npcWares.ts';
import { ARROWS, nearest } from '../arrowFocus.ts';
import { vaultPage } from '../stationPages.ts';

/** The keepers whose wares change at each daily reset. */
const DAILY: readonly KeeperKind[] = ['armorsmith', 'weaponsmith', 'tailor', 'tack'];
/** The menu's brass, the ground of a keeper who serves no Art. */
const BRASS = '#c08a3e';
/** What the footer says the screen's keys do, as the references' footer does: the Mage's holds open a Vestige, and
 *  Escape steps back out of the Art's choice of fragments before it dismisses the screen. */
export const npcHints = (view: View): readonly Hint[] => [
  ['Hold', view === 'mage' ? 'Open' : 'Buy'],
  ['I', 'Open Character'],
  ['Esc', choosing ? 'Back' : 'Dismiss'],
];
/** Whether the screen shows the Art's choice of fragments, a step the footer steps back out of. */
export const npcChoosing = (): boolean => choosing;
/** The figure's height beside what the screen's body leaves it, and the least it is drawn at. */
const FIGURE_AROUND = 120;
const FIGURE_LEAST = 200;

/** Whether a view of the menu is a keeper's screen: every counter's, the vault's among them. */
export const isKeeperView = (view: View): view is KeeperKind => (KEEPER_KINDS as readonly string[]).includes(view);

/** What the arrows move among: a keeper's tiles, at the vault its cells that take the focus, and the mail's presses. */
const KEEPER_PRESSES = '.npc-tile, .gear-vault button.gear-cell, .gear-vault .gear-cell[tabindex], .npc-mail button';
/** Whether the Art's rise waits on its fragment. */
let choosing = false;
/** The press to focus once the page is built again: the first fragment as the choice opens, the Rise as it closes. */
let focusNext: string | null = null;
const FIRST_FRAGMENT = '[data-key^="npc-rise-"]';
const RISE_PRESS = '[data-key="npc-rise"]';
const ART_TILE = '[data-key="npc-art"]';
/** The asks that wait on the room's answers: how many it had answered at the first, and how many were made. */
let pending: Asked | null = null;

/** The screen opens at `view`: a keeper's greets the player; any other view hushes the last. */
export function npcOpened(view: View): void {
  [choosing, pending, focusNext] = [false, null, null];
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
    // The glyph says nothing to a screen reader, so the currency's name is read beside its number.
    shown.append(
      coin.glyph === 'shapes' ? coinGlyph('shapes') : glyphImage(coin.glyph),
      make('b', coin.amount.toLocaleString('en')),
      make('span', ` ${coin.name}`, 'npc-unseen'),
    );
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

/** The foot's countdown, kept to the second while the page stands: to the daily reset, or to Shape's leaving. */
function footNode(kind: KeeperKind, gear: GearState): HTMLElement | null {
  const shape = kind === 'shape' ? gear.shape : null;
  if (!DAILY.includes(kind) && !shape) return null;
  const foot = make('div', '', `npc-foot ${ROLES.well}`);
  const label = make('span', shape ? 'Leaves in' : 'Stock refresh', 'npc-foot-label');
  const time = make('b', '', 'npc-foot-time');
  const tick = () => {
    const left = countdownsAt(Date.now());
    time.textContent = left ? clockWords(shape ? left.shape : left.stock) : '';
  };
  tick();
  const timer = window.setInterval(() => (foot.isConnected ? tick() : window.clearInterval(timer)), 1000);
  foot.append(label, time);
  return foot;
}

const ownKey = (node: Element | null | undefined) => (node as HTMLElement | null | undefined)?.dataset?.['key'];
const keysIn = (node: Element | null | undefined) =>
  [...(node?.querySelectorAll<HTMLElement>('[data-key]') ?? [])].map((each) => each.dataset['key']);

/** The keys of the presses to take the focus should `held` go as the page is built anew, nearest first: the ones
 *  beside it, or for a keeper's tile, which stands in a holder with its price, the tiles beside its holder, then the
 *  next row's first and the row before's last. The menu takes the first its new page still holds. */
export function keyBeside(held: Element | null | undefined): string[] {
  const holder = held?.closest('.npc-ware');
  const row = holder?.closest('.npc-row');
  const keys = holder
    ? [
        keysIn(holder.nextElementSibling)[0],
        keysIn(holder.previousElementSibling).at(-1),
        keysIn(row?.nextElementSibling)[0],
        keysIn(row?.previousElementSibling).at(-1),
      ]
    : [held?.nextElementSibling, held?.previousElementSibling].map(ownKey);
  return keys.filter((key): key is string => Boolean(key));
}

/** The arrows move to the nearest tile that way (arrowFocus.ts). */
function arrowsAmong(page: HTMLElement): void {
  page.addEventListener('keydown', (event) => {
    const step = ARROWS[event.key];
    const from = document.activeElement;
    const tiles = [...page.querySelectorAll<HTMLElement>(KEEPER_PRESSES)];
    if (!step || !(from instanceof HTMLElement) || !tiles.includes(from)) return;
    event.preventDefault();
    nearest(from, tiles, step)?.focus();
  });
}

/** A keeper's screen, built anew each time the gear changes; `redraw` asks the menu to build it again; `more` stands
 *  under the wares (a faction's muster of officers, `shipPages.ts`). */
export function npcPage(
  context: PageContext,
  kind: KeeperKind,
  forge: Cards | null,
  redraw: () => void,
  more: readonly HTMLElement[] = [],
): HTMLElement {
  const { gear } = context;
  // The room's answer to the asks made here: thanks for a ware bought, a word for a price not met.
  const answer = pending ? answeredWith(pending, gear.answered, gear.answer) : undefined;
  if (answer !== undefined) {
    pending = null;
    // A rise bought from the choice of fragments takes its whole row away: the focus goes to the Art it raised.
    if (answer === 'Thanks' && choosing) [choosing, focusNext] = [false, ART_TILE];
    if (answer) keeperSays(kind, answer);
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
  const waitFor = () =>
    (pending = pending ? { ...pending, asked: pending.asked + 1 } : { from: gear.answered, asked: 1 });
  const act = (ware: Ware) => {
    if (!ware.ask) return;
    waitFor();
    context.ask(ware.ask);
  };
  const open = () => {
    choosing = !choosing;
    focusNext = choosing ? FIRST_FRAGMENT : RISE_PRESS;
    redraw();
  };
  const wares = make('div', '', 'npc-rows');
  // The vault keeper thanks the player for each thing put in or taken out, and the Postmaster for each letter taken,
  // as a keeper does for a ware.
  const thanked = { ...context, ask: (asked: GearAsk) => (waitFor(), context.ask(asked)) };
  if (kind === 'vault') wares.append(vaultPage(thanked));
  else if (kind === 'mail') wares.append(mailPage(thanked));
  else wares.append(...rowsOf(kind, gear, choosing).map((row) => rowNode(context, row, act, open)));
  side.append(wares, ...more);
  const foot = footNode(kind, gear);
  if (foot) side.append(foot);
  page.append(stage, side);
  arrowsAmong(page);
  if (focusNext) {
    const wanted = focusNext;
    focusNext = null;
    // After the menu has given the focus back to the press that opened the choice.
    window.setTimeout(() => page.querySelector<HTMLElement>(wanted)?.focus());
  }
  // Escape first closes the Art's choice of fragments, then the screen.
  page.addEventListener(STEP_BACK, (event) => {
    if (!choosing) return;
    event.preventDefault();
    choosing = false;
    focusNext = RISE_PRESS;
    redraw();
  });
  return page;
}
