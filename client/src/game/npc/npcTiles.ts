// A keeper's wares drawn as Destiny 1's vendors draw theirs: a row of tiles under an engraved heading ruled across,
// each tile the ware's picture in a frame of its rarity with its price beneath, red with "Not enough" when short, and
// its card beside it on hover or focus. A ware is held to buy (gearDom's hold), so a stray click buys nothing.
import { make } from '../../editor/dom.ts';
import type { GearItem } from '../../network/gearMessages.ts';
import { WORN } from '../../player/gear.ts';
import { ROLES } from '../../plus/kit.ts';
import { bardingTile } from '../appearance/bardingTile.ts';
import { ARTS, emblemSvg, fragmentSvg } from '../artsCards.ts';
import type { PageContext } from '../menuPage.ts';
import { emblemImage, emblemOf } from '../emblemArt.ts';
import {
  type Hint,
  cardNode,
  glyphImage,
  hintLine,
  holdToAct,
  itemIcon,
  itemMarks,
  rarityOf,
  tileLabel,
} from '../gearDom.ts';
import { shapesSvg, svgUrl } from './npcMarks.ts';
import { type Price, type Row, type Ware, type WarePicture, priceWord, wareCard } from './npcWares.ts';

/** A tile's picture box, in pixels: the menu's cell's. */
const TILE_PX = 48;

/** The most wares a row stands beside another with. */
const SHORT_ROW = 3;
/** What a tile's press does, for its card and the footer. */
const HOLD_HINT: readonly Hint[] = [['Hold', 'Buy']];

function image(src: string, className = 'npc-glyph'): HTMLImageElement {
  const shown = make('img', '', className);
  Object.assign(shown, { src, alt: '' });
  return shown;
}

/** A dye's or a coat's colours as a swatch: a band of each, darkest first. */
function swatch(colours: readonly string[]): HTMLElement {
  const shown = make('span', '', 'npc-swatch');
  for (const colour of colours) {
    const band = make('span', '', 'npc-swatch-band');
    band.style.background = colour;
    shown.append(band);
  }
  return shown;
}

function pictureOf(context: PageContext, picture: WarePicture, name: string): HTMLElement {
  switch (picture.kind) {
    case 'item':
      return itemIcon(context.picture(picture.item), name, TILE_PX);
    case 'vestige':
      return glyphImage('vestige', picture.rarity);
    case 'package':
      return glyphImage('vestige', 2);
    case 'crate':
      return glyphImage('ammo-crate');
    case 'swatch':
      return swatch(picture.colours);
    case 'emblem':
      return image(emblemImage(emblemOf(picture.emblem), 'sign'), 'npc-emblem');
    case 'art': {
      const art = ARTS.find((each) => each.id === picture.art);
      return art ? image(svgUrl(emblemSvg(art))) : itemIcon(null, name, TILE_PX);
    }
    case 'fragment': {
      const art = ARTS.find((each) => each.id === picture.art);
      const fragment = art?.core[picture.fragment];
      return art && fragment ? image(svgUrl(fragmentSvg(art, fragment))) : itemIcon(null, name, TILE_PX);
    }
    case 'barding':
      // The barding on the player's horse, as the Appearance screen draws it.
      return bardingTile(context.forge ?? null, context.dress ?? null, picture.barding, 'npc-barding');
    default:
      // A cape not yet held stands as its initials, as Enhanced Plus shows a piece without art.
      return itemIcon(null, name, TILE_PX);
  }
}

/** A price's glyph: Aurem's, or Shapes'. */
export function coinGlyph(currency: Price['currency']): HTMLImageElement {
  return currency === 'shapes' ? image(svgUrl(shapesSvg()), 'gear-glyph npc-coin') : glyphImage('aurem');
}

/** The words under a tile: its price, the word in its place, or "Not enough". */
function priceLine(ware: Ware): HTMLElement {
  const { words, short } = priceWord(ware);
  const line = make('span', '', `npc-price${short ? ' gear-short' : ''}`);
  if (ware.price) line.append(coinGlyph(ware.price.currency), make('b', ware.price.amount.toLocaleString('en')));
  if (words) line.append(make('span', words, 'npc-price-note'));
  return line;
}

/** A ware's plain card: its name in its rarity, what it is, its words, what it costs and what holding it does. */
function plainCard(ware: Ware, hints: readonly Hint[]): HTMLElement {
  const card = make('div', '', `gear-card ${ROLES.panel}`);
  rarityOf(card, ware.rarity);
  const head = make('div', '', 'gear-card-head');
  head.append(make('h3', ware.name), make('p', ware.about, 'gear-card-meta'));
  const body = make('div', '', 'gear-card-body');
  if (ware.words) body.append(make('p', ware.words, 'gear-card-words'));
  if (ware.price?.more) body.append(make('p', `Also ${ware.price.more}.`, 'gear-card-words'));
  card.append(head, body);
  if (hints.length > 0) card.append(hintLine(hints, 'gear-card-hint'));
  return card;
}

/** One ware's tile and its price; `act` runs a ware's ask once held, and `open` a press that opens a choice. */
export function wareTile(context: PageContext, ware: Ware, act: (ware: Ware) => void, open: () => void): HTMLElement {
  const holder = make('div', '', 'npc-ware');
  const pressed = ware.ask !== null || ware.opens !== undefined;
  const tile = make('button', '', `gear-cell npc-tile ${ROLES.tile}`);
  tile.dataset['key'] = `npc-${ware.key}`;
  rarityOf(tile, ware.rarity);
  tile.classList.toggle('npc-dim', ware.dim === true);
  const item: GearItem | null = ware.picture.kind === 'item' ? ware.picture.item : null;
  tile.append(pictureOf(context, ware.picture, ware.name));
  if (item) itemMarks(tile, item);
  if (!pressed) tile.setAttribute('aria-disabled', 'true');
  const cost = ware.price
    ? `${ware.price.amount.toLocaleString('en')} ${ware.price.currency === 'shapes' ? 'Shapes' : 'Aurem'}`
    : '';
  const said = priceWord(ware);
  const state = said.short ? 'not enough' : said.words || (ware.opens ? 'press to choose' : pressed ? 'hold' : '');
  tile.setAttribute('aria-label', tileLabel(ware.name, ware.rarity, [cost, state].filter(Boolean).join(', ')));
  const hints: readonly Hint[] = ware.opens ? [['Click', 'Choose a fragment']] : pressed ? HOLD_HINT : [];
  if (item) {
    const worn = context.gear.items.find((each) => each.at === WORN + item.bucket && each.id !== item.id) ?? null;
    context.tip.over(tile, () =>
      cardNode(wareCard(ware, item, item.at >= WORN ? null : worn), context.picture(item), hints),
    );
  } else context.tip.over(tile, () => plainCard(ware, hints));
  if (ware.opens) tile.addEventListener('click', () => (context.tip.hide(), open()));
  else if (ware.ask) holdToAct(tile, () => act(ware), { charges: () => tile });
  holder.append(tile, priceLine(ware));
  return holder;
}

/** A row of wares under its heading ruled across, or the words for why it holds none. */
export function rowNode(context: PageContext, row: Row, act: (ware: Ware) => void, open: () => void): HTMLElement {
  // A row of a few stands beside the next, as the references' short rows would if they had room to spare.
  const section = make('section', '', `npc-row${row.wares.length <= SHORT_ROW ? ' npc-row-short' : ''}`);
  section.append(make('h3', row.heading, `gear-heading ${ROLES.rule}`));
  if (row.art) section.append(artLine(row.art));
  const tiles = make('div', '', 'npc-tiles');
  tiles.append(...row.wares.map((ware) => wareTile(context, ware, act, open)));
  if (row.wares.length > 0) section.append(tiles);
  else if (row.empty) section.append(make('p', row.empty, 'gear-hint npc-empty'));
  return section;
}

/** An Art's level as five pips, and its bar toward the next level. */
function artLine(art: NonNullable<Row['art']>): HTMLElement {
  const line = make('div', '', 'npc-art-line');
  const pips = make('span', '', 'npc-pips');
  pips.setAttribute('role', 'img');
  pips.setAttribute('aria-label', `Level ${art.level} of 5`);
  for (let pip = 1; pip <= 5; pip++) pips.append(make('span', '', `npc-pip${pip <= art.level ? ' npc-pip-lit' : ''}`));
  line.append(pips, meter(art.toNext, art.words));
  return line;
}

/** A bar sunk into the surface, filled to `share`, with its words beside it. */
export function meter(share: number, words: string): HTMLElement {
  const holder = make('div', '', 'npc-meter-line');
  const bar = make('div', '', `npc-meter ${ROLES.track}`);
  bar.setAttribute('role', 'progressbar');
  bar.setAttribute('aria-valuenow', String(Math.round(share * 100)));
  bar.setAttribute('aria-label', words);
  const fill = make('div', '', `npc-meter-fill ${ROLES.meter}`);
  fill.style.width = `${Math.round(share * 100)}%`;
  bar.append(fill);
  holder.append(bar, make('span', words, 'gear-hint'));
  return holder;
}
