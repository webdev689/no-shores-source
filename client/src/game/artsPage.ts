// The Art's screen, after Destiny's subclass screen: the Art's scene drawn behind it, its drama at the right; at the
// left the worn Art's name, its diamond large in a double frame, the three Arts' diamonds to wear another and its
// words; in the middle its ANIMA, its two TENETS and its CORE in rows of the menu's tiles, framed in its element, the
// Core's fragments written out under it. A Core slot opens a flyout of the Art's six fragments, where one set in
// another slot is refused. Each spell and fragment shows its card beside its row on hover or focus. The arrows move
// between the tiles, Enter chooses, Escape closes the flyout and then the screen. Every change is an ask the room
// answers; the screen shows the Art and Core the room last sent.

import './arts.css';
import { make } from '../editor/dom.ts';
import { ELEMENTS, answerText } from '../player/gear.ts';
import { LOCK_MAP, mapSvg } from '../player/artGlyphs.ts';
import type { Standing } from '../network/gearMessages.ts';
import { ROLES } from '../plus/kit.ts';
import {
  ARTS,
  CORE_SLOTS,
  type Art,
  type ArtsAsk,
  type Cores,
  type Spell,
  artCard,
  spellNumbers,
  artOf,
  coreChoices,
  coreOf,
  emblemSvg,
  fragmentCard,
  fragmentSvg,
  frameSvg,
  keyOf,
  spellCard,
  slotCard,
  spellSvg,
} from './artsCards.ts';
import {
  type ArtLevel,
  LEVEL_MOST,
  barWords,
  factionOf,
  howHad,
  levelOf,
  owns,
  ownedCount,
  ready,
  shareWords,
} from './artLevels.ts';
import { artStage } from './artStage.ts';
import { emblemImage, emblemOf } from './emblemArt.ts';
import type { Card } from './gearCards.ts';
import { type Hint, type HoverCard, cardNode, elementGlyph, glyphImage } from './gearDom.ts';
import { STEP_BACK } from './gearScreen.ts';
import { play } from './uiSounds.ts';

/** How the screen comes in when built: opened, another Art just worn, or neither. */
export type ArtsEntrance = 'open' | 'wear' | null;

/** What the Art's screen draws from: the Art worn, each Art's Core and where the player stands with each as the room
 *  last sent them, the way to ask the room for a change, the menu's hover card, the way back to the Character page,
 *  how the screen comes in, the Core slot the room has just set and the one whose ask is waiting. */
export interface ArtsPageContext {
  readonly worn: number;
  readonly cores: Cores;
  readonly standing?: Standing | undefined;
  readonly ask: (ask: ArtsAsk) => void;
  readonly tip: HoverCard;
  readonly close: () => void;
  readonly entrance?: ArtsEntrance;
  readonly justSet?: number | null;
  readonly pending?: number | null;
}

/** What the footer says the screen's presses and keys do. */
export const ARTS_HINTS: readonly Hint[] = [
  ['Click', 'Wear an Art or set a fragment'],
  ['Arrows', 'Move'],
  ['Enter', 'Choose'],
  ['Esc', 'Back'],
];
/** The key of the Character page's diamond, which takes the focus back once the screen closes. */
export const ART_DIAMOND_KEY = 'art-diamond';
/** What a card's foot says its tile's press does. */
const WEAR: readonly Hint[] = [['Click', 'Wear it']];
const CHANGE: readonly Hint[] = [['Click', 'Change it']];
const CHOOSE: readonly Hint[] = [['Click', 'Choose a fragment']];
const SET: readonly Hint[] = [['Click', 'Set it here']];
/** Each arrow key's way across the screen. */
const ARROWS: Readonly<Record<string, readonly [number, number]>> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

const pictureUrl = (svg: string): string => `data:image/svg+xml,${encodeURIComponent(svg)}`;
/** The key of a spell's tile, which the screen's focus starts on for the Anima. */
const spellKey = (spell: Spell): string => `spell-${spell.key}`;

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

/** An Art's level as five pips, lit up to it in the element around them, read aloud as "Level n". */
export function levelPips(level: number, className = ''): HTMLElement {
  const pips = make('span', '', `arts-pips ${className}`.trim());
  pips.setAttribute('role', 'img');
  pips.setAttribute('aria-label', `Level ${level}`);
  for (let pip = 1; pip <= LEVEL_MOST; pip++)
    pips.append(make('span', '', pip <= level ? 'arts-pip arts-pip-lit' : 'arts-pip'));
  return pips;
}

/** The worn Art's bar to its next level, its words under it, and the emblem of the faction that raises it, its card
 *  naming the faction. */
export function levelBlock(context: ArtsPageContext, art: Art, standing: ArtLevel): HTMLElement {
  const block = make('div', '', 'arts-level');
  const words = barWords(standing, art.id);
  const full = standing.level >= LEVEL_MOST || ready(standing);
  const bar = make('div', '', 'arts-bar');
  bar.classList.toggle('arts-ready', ready(standing));
  bar.classList.toggle('arts-most', standing.level >= LEVEL_MOST);
  bar.setAttribute('role', 'progressbar');
  bar.setAttribute('aria-label', `${art.name} XP`);
  bar.setAttribute('aria-valuemin', '0');
  bar.setAttribute('aria-valuemax', String(Math.max(1, standing.bar)));
  bar.setAttribute('aria-valuenow', String(full ? Math.max(1, standing.bar) : standing.xp));
  bar.setAttribute('aria-valuetext', words);
  const fill = make('span', '', 'arts-bar-fill');
  fill.style.width = `${full ? 100 : (100 * standing.xp) / Math.max(1, standing.bar)}%`;
  bar.append(fill);
  const line = make('div', '', 'arts-level-line');
  line.append(make('span', words, 'arts-bar-words'));
  const faction = factionOf(art.id);
  if (faction) {
    const sign = make('span', '', 'arts-faction');
    sign.tabIndex = 0;
    sign.role = 'img';
    sign.setAttribute('aria-label', faction.name);
    sign.style.backgroundImage = `url(${emblemImage(emblemOf(faction.emblem), 'sign')})`;
    const card = (): HTMLElement => {
      const node = cardNode(
        {
          name: faction.name,
          rarity: 0,
          kind: 'Faction',
          big: null,
          rows: [],
          element: art.element,
          traits: [],
          words: `${faction.words} At their counter the ${art.name} Art rises a level, and its fragments are sold.`,
          compare: null,
        },
        null,
        [],
      );
      tone(node, art.element);
      return node;
    };
    context.tip.over(sign, card, block);
    line.append(sign);
  }
  block.append(bar, line);
  return block;
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

/** A tile of the menu's, for the arrows to move between: a press, or with `still` one that only shows its card. */
function tileOf(className: string, key: string, label: string, still = false): HTMLElement {
  const tile = make(still ? 'div' : 'button', '', `${className} ${ROLES.tile}`);
  if (tile instanceof HTMLButtonElement) tile.type = 'button';
  else [tile.tabIndex, tile.role] = [0, 'img'];
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

/** A spell's tile: its icon and its key on a keycap under it. It is pressed for nothing, so it is no button; its card
 *  shows beside `row` on hover or focus. */
function spellTile(context: ArtsPageContext, art: Art, spell: Spell, row: HTMLElement): HTMLElement {
  const anima = spell === art.anima;
  const key = keyOf(art, spell);
  const label = `${spell.name}, ${anima ? 'Anima' : 'Tenet'}, key ${key}`;
  const tile = tileOf(anima ? 'gear-slot' : 'gear-cell', spellKey(spell), label, true);
  tile.append(picture(spellSvg(art, spell), 'arts-glyph'), make('kbd', key, 'gear-key arts-key'));
  const level = levelOf(context.standing, art.id).level;
  const card = () => {
    const node = cardWith(spellCard(art, spell, level), spellSvg(art, spell), art.element, [[key, 'Cast in play']]);
    // Below the highest level, what the spell holds there, muted under its numbers.
    const now = spellNumbers(spell, level);
    const most = spellNumbers(spell).filter(([, value], place) => value !== now[place]?.[1]);
    if (most.length > 0) {
      const said = most.map(([label, value]) => `${label} ${value}`).join(' · ');
      node.querySelector('.gear-card-body')?.append(make('p', `At level ${LEVEL_MOST}: ${said}`, 'arts-card-most'));
    }
    return node;
  };
  context.tip.over(tile, card, row);
  return tile;
}

/** The fragments set in a Core, one line each: its name and what it does. */
function buildList(art: Art, core: readonly (number | null)[]): HTMLElement {
  const list = make('ul', '', 'arts-build');
  list.setAttribute('aria-label', 'Set in the Core');
  for (const chosen of core) {
    const fragment = chosen === null ? undefined : art.core[chosen];
    if (!fragment) continue;
    const line = make('li');
    line.append(make('b', fragment.name), make('span', fragment.text));
    list.append(line);
  }
  return list;
}

/** The Core's three slots, the open one's flyout of the Art's six fragments, and what is set written out under them. */
function coreRow(context: ArtsPageContext, art: Art, open: number | null, choose: (slot: number | null) => void) {
  const core = coreOf(context.cores, art.id);
  const standing = levelOf(context.standing, art.id);
  const slots = core.map((chosen, slot) => {
    const fragment = chosen === null ? undefined : art.core[chosen];
    const label = `Core slot ${slot + 1}: ${fragment?.name ?? 'empty'}`;
    const tile = tileOf('gear-cell', `core-${slot}`, label);
    tile.append(fragment ? picture(fragmentSvg(art, fragment), 'arts-glyph') : glyphImage('empty'));
    tile.classList.toggle('gear-vacant', !fragment);
    tile.classList.toggle('gear-open', open === slot);
    // The room's word has just set it, or the ask that will is on its way.
    tile.classList.toggle('arts-just-set', context.justSet === slot);
    if (context.pending === slot) tile.setAttribute('aria-busy', 'true');
    tile.setAttribute('aria-expanded', String(open === slot));
    tile.setAttribute('aria-haspopup', 'true');
    tile.addEventListener('click', () => {
      context.tip.hide();
      choose(open === slot ? null : slot);
      if (open === slot) return;
      // Into the flyout, at the fragment set here, else the first that may be.
      const choices = coreChoices(art, core, slot, (fragment) => owns(standing, fragment));
      const first = chosen ?? choices.find((each) => each.ask)?.index ?? 0;
      focusSoon(`fragment-${first}`);
    });
    return { tile, fragment, slot };
  });
  const filled = core.filter((chosen) => chosen !== null).length;
  const shown = group(
    `Core · ${filled} of ${CORE_SLOTS} · ${ownedCount(standing)} owned`,
    slots.map(({ tile }) => tile),
    'arts-core',
  );
  const row = shown.querySelector<HTMLElement>('.arts-tiles') ?? shown;
  for (const { tile, fragment, slot } of slots) {
    const card = () => {
      if (fragment) {
        const shown = fragmentCard(art, fragment, null, standing.level);
        return cardWith(shown, fragmentSvg(art, fragment), art.element, CHANGE);
      }
      const node = cardNode(slotCard(art, slot), null, CHOOSE);
      tone(node, art.element);
      return node;
    };
    context.tip.over(tile, card, row);
  }
  shown.append(buildList(art, core));
  if (open === null) return shown;
  const flyout = make('div', '', `gear-flyout arts-flyout ${ROLES.panel}`);
  flyout.append(make('div', `Core slot ${open + 1}`, 'gear-flyout-head'));
  const grid = make('div', '', 'gear-flyout-grid');
  // What a refused choice says, as the room's answer would.
  const refusal = make('p', '', 'arts-refusal');
  refusal.setAttribute('role', 'status');
  for (const choice of coreChoices(art, core, open, (fragment) => owns(standing, fragment))) {
    const { fragment, setIn, ask, owned } = choice;
    const said =
      setIn === null ? (owned ? '' : ', not owned') : setIn === open ? ', set here' : `, set in slot ${setIn + 1}`;
    const cell = tileOf('gear-cell', `fragment-${choice.index}`, `${fragment.name}${said}`);
    cell.append(picture(fragmentSvg(art, fragment), 'arts-glyph'));
    cell.classList.toggle('gear-open', setIn === open);
    const taken = setIn !== null && setIn !== open;
    cell.classList.toggle('arts-taken', taken);
    cell.classList.toggle('arts-locked', !owned);
    if (taken || !owned) cell.setAttribute('aria-disabled', 'true');
    if (taken) cell.append(make('span', String(setIn + 1), 'gear-count'));
    if (!owned) cell.append(picture(mapSvg(LOCK_MAP, art.element), 'arts-lock'));
    cell.addEventListener('click', () => {
      // A fragment set in another slot, or not owned, is refused here, before any ask; the one set here is chosen.
      if (taken) {
        refusal.textContent = '';
        return play('refused');
      }
      if (!owned) {
        refusal.textContent = answerText(114);
        return play('refused');
      }
      context.tip.hide();
      if (ask) context.ask(ask);
      choose(null);
      focusSoon(`core-${open}`);
    });
    const hints = ask ? SET : [];
    const shown = fragmentCard(art, fragment, setIn, standing.level, owned ? null : howHad(art.id));
    const card = () => cardWith(shown, fragmentSvg(art, fragment), art.element, hints);
    context.tip.over(cell, card, flyout);
    grid.append(cell);
  }
  flyout.append(grid, refusal);
  // Beside the slots, as a slot's flyout opens beside it on the Character page.
  row.append(flyout);
  return shown;
}

/** The worn Art's name, element, framed diamond, the three Arts' diamonds to wear another, and its words. */
function sideOf(context: ArtsPageContext, art: Art): HTMLElement {
  const side = make('div', '', 'arts-side');
  const standing = levelOf(context.standing, art.id);
  const name = make('h2', art.name, 'arts-name');
  name.id = 'arts-name';
  const title = make('div', '', 'arts-title');
  title.append(name, levelPips(standing.level));
  const kind = make('p', '', 'arts-kind');
  const glyph = elementGlyph(art.element, 'gear-element-inline');
  if (glyph) kind.append(glyph);
  kind.append(
    make('span', `${ELEMENTS[art.element]?.name ?? ''} Art`),
    make('span', shareWords(standing.level), 'arts-share'),
  );
  const emblem = make('div', '', 'arts-emblem');
  emblem.append(picture(frameSvg(art), 'arts-frame-img'), picture(emblemSvg(art), 'arts-emblem-img'));
  const picks = make('div', '', 'arts-picks');
  picks.setAttribute('role', 'group');
  picks.setAttribute('aria-label', 'Arts');
  for (const each of ARTS) {
    const worn = each.id === art.id;
    const level = levelOf(context.standing, each.id).level;
    const pick = make('button', '', 'arts-pick');
    pick.type = 'button';
    pick.dataset['key'] = `art-${each.id}`;
    pick.dataset['nav'] = '';
    pick.classList.toggle('arts-worn', worn);
    pick.setAttribute('aria-pressed', String(worn));
    pick.setAttribute('aria-label', `${each.name}, level ${level}${worn ? ', worn' : ''}`);
    tone(pick, each.element);
    pick.append(picture(emblemSvg(each), 'arts-pick-img'), levelPips(level, 'arts-pips-small'));
    pick.addEventListener('click', () => {
      if (worn) return;
      context.tip.hide();
      context.ask({ kind: 'wearArt', art: each.id });
    });
    const card = () => cardWith(artCard(each, worn, level), emblemSvg(each), each.element, worn ? [] : WEAR);
    context.tip.over(pick, card, picks);
    picks.append(pick);
  }
  // The diamonds stand above the words, so a longer or shorter blurb never moves them under the pointer.
  side.append(title, kind, emblem, picks, levelBlock(context, art, standing), make('p', art.blurb, 'arts-blurb'));
  return side;
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
  page.setAttribute('role', 'region');
  page.setAttribute('aria-labelledby', 'arts-name');
  if (context.entrance) page.classList.add(`arts-${context.entrance}`);
  tone(page, art.element);
  const rows = make('div', '', 'arts-rows');
  const top = make('div', '', 'arts-line');
  top.append(
    group('Anima', [spellTile(context, art, art.anima, top)]),
    group(
      'Tenets',
      art.tenets.map((tenet) => spellTile(context, art, tenet, top)),
    ),
  );
  rows.append(top, coreRow(context, art, open, choose));
  page.append(artStage(art), sideOf(context, art), rows);
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

/** The worn Art's diamond for the Character page, the first of the weapons' rows, its name and level beside it:
 *  pressed, it opens the Art's screen through `open`, the focus on its Anima. */
export function artDiamond(
  worn: number,
  open: () => void,
  tip: HoverCard | null = null,
  standing?: Standing,
): HTMLElement {
  const art = artOf(worn) ?? ARTS[0];
  const holder = make('div', '', 'gear-slot-holder arts-holder');
  if (!art) return holder;
  tone(holder, art.element);
  const press = make('button', '', 'arts-diamond');
  press.type = 'button';
  press.dataset['key'] = ART_DIAMOND_KEY;
  const level = levelOf(standing, art.id).level;
  press.setAttribute('aria-label', `Art: ${art.name}, level ${level}`);
  press.append(picture(emblemSvg(art), 'arts-diamond-img'));
  press.addEventListener('click', () => {
    tip?.hide();
    open();
    focusSoon(spellKey(art.anima));
  });
  tip?.over(press, () =>
    cardWith(artCard(art, false, level), emblemSvg(art), art.element, [['Click', 'Open its screen']]),
  );
  const words = make('div', '', 'gear-slot-words');
  const named = make('span', art.name, 'gear-slot-item');
  named.style.color = ELEMENTS[art.element]?.colour ?? '';
  words.append(make('span', 'Art', 'gear-slot-name'), named, levelPips(level, 'arts-pips-small'));
  holder.append(press, words);
  return holder;
}
