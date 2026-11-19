// The Art's screen, after Destiny's subclass screen: over a dark ground washed in the Art's colour, the worn Art's name
// and its diamond large at the left, the three Arts' diamonds under it to wear another; to the right its ANIMA, its two
// TENETS and its CORE in rows of the menu's tiles, framed in its element. A Core slot opens a flyout of the Art's six
// fragments, where one set in another slot is refused. Each spell and fragment shows its card on hover or focus. The
// arrows move between the tiles, Enter chooses, Escape closes the flyout and then the screen. Every change is an ask
// the room answers; the screen shows the Art and Core the room last sent.

import './arts.css';
import { make } from '../editor/dom.ts';
import { ELEMENTS } from '../player/gear.ts';
import { ROLES } from '../plus/kit.ts';
import {
  ARTS,
  type Art,
  type ArtsAsk,
  type Cores,
  type Spell,
  artCard,
  artOf,
  coreChoices,
  coreOf,
  emblemSvg,
  fragmentCard,
  fragmentSvg,
  keyOf,
  spellCard,
  slotCard,
  spellSvg,
} from './artsCards.ts';
import type { Card } from './gearCards.ts';
import { type Hint, type HoverCard, cardNode, elementGlyph, glyphImage } from './gearDom.ts';
import { STEP_BACK } from './gearScreen.ts';
import { play } from './uiSounds.ts';

/** What the Art's screen draws from: the Art worn and each Art's Core as the room last sent them, the way to ask the
 *  room for a change, the menu's hover card, and the way back to the Character page. */
export interface ArtsPageContext {
  readonly worn: number;
  readonly cores: Cores;
  readonly ask: (ask: ArtsAsk) => void;
  readonly tip: HoverCard;
  readonly close: () => void;
}

/** What the footer says the screen's presses and keys do. */
export const ARTS_HINTS: readonly Hint[] = [
  ['Click', 'Wear an Art or set a fragment'],
  ['Esc', 'Back'],
];
/** The key of the Character page's diamond, which takes the focus back once the screen closes. */
export const ART_DIAMOND_KEY = 'art-diamond';
/** What a card's foot says its tile's press does. */
const WEAR: readonly Hint[] = [['Click', 'Wear it']];
const CHANGE: readonly Hint[] = [['Click', 'Change it']];
const CHOOSE: readonly Hint[] = [['Click', 'Choose a fragment']];
const SET: readonly Hint[] = [['Click', 'Set it here']];
/** How much fainter the Art's emblem is where it washes the screen's ground. */
const WASH_OPACITY = 0.08;
/** Each arrow key's way across the screen. */
const ARROWS: Readonly<Record<string, readonly [number, number]>> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

const pictureUrl = (svg: string): string => `data:image/svg+xml,${encodeURIComponent(svg)}`;

/** A pixel picture as an image, never read aloud: its tile names it. */
function picture(svg: string, className: string): HTMLImageElement {
  const image = make('img', '', className);
  image.src = pictureUrl(svg);
  image.alt = '';
  return image;
}

/** Colours a surface with an element, as the menu colours one with a rarity: its frame, glow and band. */
function tone(node: HTMLElement, element: number): void {
  const found = ELEMENTS[element];
  if (!found) return;
  const [dark, , lit] = found.palette;
  const channels = [1, 3, 5].map((start) => parseInt(found.colour.slice(start, start + 2), 16)).join(', ');
  node.style.setProperty('--rar', found.colour);
  node.style.setProperty('--rar-hi', lit);
  node.style.setProperty('--rar-lo', dark);
  node.style.setProperty('--rar-rgb', channels);
}

/** A card in the gear's style, its band in `element`, its picture over its numbers. */
function cardWith(card: Card, svg: string, element: number, hints: readonly Hint[]): HTMLElement {
  const node = cardNode(card, null, hints);
  tone(node, element);
  const icon = make('div', '', 'gear-card-icon');
  icon.append(picture(svg, 'arts-card-icon'));
  node.querySelector('.gear-card-body')?.prepend(icon);
  return node;
}

/** Focuses the control `key` names: now, where a choice has built the page again already, else once it has. The
 *  menu finds a focused control again by its key whenever it builds a page anew. */
function focusSoon(key: string): void {
  const found = () => document.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`);
  const now = found();
  if (now) now.focus();
  else requestAnimationFrame(() => found()?.focus());
}

/** A tile of the menu's, for the arrows to move between. */
function tileOf(className: string, key: string, label: string): HTMLButtonElement {
  const tile = make('button', '', `${className} ${ROLES.tile}`);
  tile.type = 'button';
  tile.dataset['key'] = key;
  tile.dataset['nav'] = '';
  tile.setAttribute('aria-label', label);
  return tile;
}

/** The control nearest `from` the way an arrow points, favouring those straight on; null if none lies that way. */
function nearest(from: HTMLElement, among: readonly HTMLElement[], [right, down]: readonly [number, number]) {
  const centre = (node: HTMLElement) => {
    const box = node.getBoundingClientRect();
    return [box.left + box.width / 2, box.top + box.height / 2] as const;
  };
  const [fromX, fromY] = centre(from);
  let best: { node: HTMLElement; score: number } | null = null;
  for (const node of among) {
    const [nodeX, nodeY] = centre(node);
    const along = (nodeX - fromX) * right + (nodeY - fromY) * down;
    const across = Math.abs((nodeX - fromX) * down - (nodeY - fromY) * right);
    if (node === from || along <= 1) continue;
    const score = along + across * 2;
    if (!best || score < best.score) best = { node, score };
  }
  return best?.node ?? null;
}

/** A row's heading over its tiles. */
function group(name: string, tiles: readonly HTMLElement[], className = ''): HTMLElement {
  const shown = make('section', '', `arts-group ${className}`.trim());
  const row = make('div', '', 'arts-tiles');
  row.append(...tiles);
  shown.append(make('h3', name, `gear-heading ${ROLES.rule}`), row);
  return shown;
}

/** A spell's tile: its icon, its key on a keycap, and its card on hover or focus. */
function spellTile(context: ArtsPageContext, art: Art, spell: Spell): HTMLElement {
  const anima = spell === art.anima;
  const key = keyOf(art, spell);
  const tile = tileOf(
    anima ? 'gear-slot' : 'gear-cell',
    `spell-${spell.key}`,
    `${spell.name}, ${anima ? 'Anima' : 'Tenet'}, key ${key}`,
  );
  tile.append(picture(spellSvg(art, spell), 'arts-glyph'), make('kbd', key, 'gear-key arts-key'));
  context.tip.over(tile, () =>
    cardWith(spellCard(art, spell), spellSvg(art, spell), art.element, [[key, 'Cast in play']]),
  );
  return tile;
}

/** The Core's three slots, and the open one's flyout of the Art's six fragments. */
function coreRow(context: ArtsPageContext, art: Art, open: number | null, choose: (slot: number | null) => void) {
  const core = coreOf(context.cores, art.id);
  const slots = core.map((chosen, slot) => {
    const fragment = chosen === null ? undefined : art.core[chosen];
    const label = `Core slot ${slot + 1}: ${fragment?.name ?? 'empty'}`;
    const tile = tileOf('gear-cell', `core-${slot}`, label);
    tile.append(fragment ? picture(fragmentSvg(art, fragment), 'arts-glyph') : glyphImage('empty'));
    tile.classList.toggle('gear-vacant', !fragment);
    tile.classList.toggle('gear-open', open === slot);
    tile.setAttribute('aria-expanded', String(open === slot));
    tile.setAttribute('aria-haspopup', 'true');
    tile.addEventListener('click', () => {
      context.tip.hide();
      choose(open === slot ? null : slot);
      if (open === slot) return;
      // Into the flyout, at the fragment set here, else the first that may be.
      const first = chosen ?? coreChoices(art, core, slot).find((each) => each.ask)?.index ?? 0;
      focusSoon(`fragment-${first}`);
    });
    const card = () => {
      if (fragment) return cardWith(fragmentCard(art, fragment), fragmentSvg(art, fragment), art.element, CHANGE);
      const node = cardNode(slotCard(art, slot), null, CHOOSE);
      tone(node, art.element);
      return node;
    };
    context.tip.over(tile, card);
    return tile;
  });
  const shown = group('Core', slots, 'arts-core');
  if (open === null) return shown;
  const flyout = make('div', '', `gear-flyout arts-flyout ${ROLES.panel}`);
  flyout.append(make('div', `Core slot ${open + 1}`, 'gear-flyout-head'));
  const grid = make('div', '', 'gear-flyout-grid');
  for (const choice of coreChoices(art, core, open)) {
    const { fragment, setIn, ask } = choice;
    const said = setIn === null ? '' : setIn === open ? ', set here' : `, set in slot ${setIn + 1}`;
    const cell = tileOf('gear-cell', `fragment-${choice.index}`, `${fragment.name}${said}`);
    cell.append(picture(fragmentSvg(art, fragment), 'arts-glyph'));
    cell.classList.toggle('gear-open', setIn === open);
    const taken = setIn !== null && setIn !== open;
    cell.classList.toggle('arts-taken', taken);
    if (taken) {
      cell.setAttribute('aria-disabled', 'true');
      cell.append(make('span', String(setIn + 1), 'gear-count'));
    }
    cell.addEventListener('click', () => {
      // A fragment set in another slot is refused here, before any ask; the one set here is already chosen.
      if (taken) return play('refused');
      context.tip.hide();
      if (ask) context.ask(ask);
      choose(null);
      focusSoon(`core-${open}`);
    });
    const hints = setIn === null ? SET : [];
    const card = () => cardWith(fragmentCard(art, fragment, setIn), fragmentSvg(art, fragment), art.element, hints);
    context.tip.over(cell, card, flyout);
    grid.append(cell);
  }
  flyout.append(grid);
  // Beside the slots, as a slot's flyout opens beside it on the Character page.
  shown.querySelector('.arts-tiles')?.append(flyout);
  return shown;
}

/** The Art's screen for the worn Art, with `open` the Core slot whose flyout is open (null for none); `choose` opens
 *  or closes a slot's flyout. */
export function artsPage(
  context: ArtsPageContext,
  open: number | null,
  choose: (slot: number | null) => void,
): HTMLElement {
  const art = artOf(context.worn) ?? ARTS[0];
  const page = make('div', '', 'arts-page');
  if (!art) return page;
  page.dataset['art'] = art.key;
  tone(page, art.element);
  const wash = emblemSvg(art).replace('<svg ', `<svg opacity="${WASH_OPACITY}" `);
  page.style.setProperty('--wash', `url("${pictureUrl(wash)}")`);
  const side = make('div', '', 'arts-side');
  const name = make('h2', art.name, 'arts-name');
  name.tabIndex = -1;
  // Named, so the menu finds the focus again on the page built anew when the room's word comes.
  name.dataset['key'] = 'arts-name';
  const kind = make('p', '', 'arts-kind');
  const glyph = elementGlyph(art.element, 'gear-element-inline');
  if (glyph) kind.append(glyph);
  kind.append(make('span', `${ELEMENTS[art.element]?.name ?? ''} Art`));
  const emblem = make('div', '', 'arts-emblem');
  emblem.append(picture(emblemSvg(art), 'arts-emblem-img'));
  const picks = make('div', '', 'arts-picks');
  picks.setAttribute('role', 'group');
  picks.setAttribute('aria-label', 'Arts');
  for (const each of ARTS) {
    const worn = each.id === art.id;
    const pick = make('button', '', 'arts-pick');
    pick.type = 'button';
    pick.dataset['key'] = `art-${each.id}`;
    pick.dataset['nav'] = '';
    pick.classList.toggle('arts-worn', worn);
    pick.setAttribute('aria-pressed', String(worn));
    pick.setAttribute('aria-label', `${each.name}${worn ? ', worn' : ''}`);
    tone(pick, each.element);
    pick.append(picture(emblemSvg(each), 'arts-pick-img'));
    pick.addEventListener('click', () => {
      if (worn) return;
      context.tip.hide();
      context.ask({ kind: 'wearArt', art: each.id });
    });
    context.tip.over(pick, () => cardWith(artCard(each, worn), emblemSvg(each), each.element, worn ? [] : WEAR));
    picks.append(pick);
  }
  side.append(name, kind, emblem, make('p', art.blurb, 'arts-blurb'), picks);
  const rows = make('div', '', 'arts-rows');
  const top = make('div', '', 'arts-line');
  top.append(
    group('Anima', [spellTile(context, art, art.anima)]),
    group(
      'Tenets',
      art.tenets.map((tenet) => spellTile(context, art, tenet)),
    ),
  );
  rows.append(top, coreRow(context, art, open, choose));
  page.append(side, rows);
  page.addEventListener('keydown', (event) => {
    const way = ARROWS[event.key];
    const from = document.activeElement;
    if (!way || !(from instanceof HTMLElement) || !page.contains(from)) return;
    // Within the flyout the arrows keep to its fragments until it closes.
    const flyout = page.querySelector('.arts-flyout');
    const scope = flyout?.contains(from) ? flyout : page;
    const next = nearest(from, [...scope.querySelectorAll<HTMLElement>('[data-nav]')], way);
    if (!next) return;
    event.preventDefault();
    next.focus();
  });
  // Escape closes the flyout, and then the screen, before the menu steps back.
  page.addEventListener(STEP_BACK, (event) => {
    event.preventDefault();
    context.tip.hide();
    if (open !== null) {
      choose(null);
      focusSoon(`core-${open}`);
    } else {
      context.close();
      focusSoon(ART_DIAMOND_KEY);
    }
  });
  return page;
}

/** The worn Art's diamond for the Character page, above the weapons, its name beside it: pressed, it opens the Art's
 *  screen through `open`. */
export function artDiamond(worn: number, open: () => void, tip: HoverCard | null = null): HTMLElement {
  const art = artOf(worn) ?? ARTS[0];
  const holder = make('div', '', 'gear-slot-holder arts-holder');
  if (!art) return holder;
  tone(holder, art.element);
  const press = make('button', '', 'arts-diamond');
  press.type = 'button';
  press.dataset['key'] = ART_DIAMOND_KEY;
  press.setAttribute('aria-label', `Art: ${art.name}`);
  press.append(picture(emblemSvg(art), 'arts-diamond-img'));
  press.addEventListener('click', () => {
    tip?.hide();
    open();
    // The screen is read from its name, so no card opens over it unasked.
    requestAnimationFrame(() => document.querySelector<HTMLElement>('.arts-name')?.focus());
  });
  tip?.over(press, () => cardWith(artCard(art), emblemSvg(art), art.element, [['Click', 'Open its screen']]));
  const words = make('div', '', 'gear-slot-words');
  const named = make('span', art.name, 'gear-slot-item');
  named.style.color = ELEMENTS[art.element]?.colour ?? '';
  words.append(make('span', 'Art', 'gear-slot-name'), named);
  holder.append(press, words);
  return holder;
}
