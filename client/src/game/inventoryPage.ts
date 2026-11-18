// The inventory page, after Destiny's: the currencies along its head, tabs to switch between the consumables, the
// materials, the Vestiges and the vault, and a grid of cells, each its glyph or item picture in a frame of its rarity,
// its count at its foot and its pips beside it, as Enhanced Plus's cells are. Hovering a cell shows its card; a click
// does what it is for (a Vestige identified, an item taken out of the vault); a right-click its other use.

import { make } from '../editor/dom.ts';
import { RARITIES } from '../player/gear.ts';
import { ROLES } from '../plus/kit.ts';
import type { PageContext } from './characterPage.ts';
import { type Cell, cardOf, inventoryPageOf } from './gearCards.ts';
import { cardNode, glyphImage, itemIcon, rarityOf } from './gearDom.ts';

/** A cell's picture box, in pixels. */
const CELL_PX = 48;

/** A cell's plain card: its name, words and count. */
function cellCard(cell: Cell): HTMLElement {
  const card = make('div', '', `gear-card ${ROLES.panel}`);
  rarityOf(card, cell.glyph === 'resource' ? null : cell.rarity);
  const head = make('div', '', 'gear-card-head');
  const meta = cell.count === null ? '' : `${cell.count.toLocaleString()} held`;
  head.append(make('h3', cell.name), make('p', meta, 'gear-card-meta'));
  const hints = [cell.press && `Click: ${cell.press.label}`, cell.other && `Right-click: ${cell.other.label}`];
  card.append(
    head,
    make('p', cell.words, 'gear-card-words'),
    make('p', hints.filter(Boolean).join(' · '), 'gear-card-hint'),
  );
  return card;
}

export function inventoryPage(context: PageContext, tab: string, choose: (tab: string) => void): HTMLElement {
  const page = make('div', '', 'gear-inventory');
  const inventory = inventoryPageOf(context.gear);
  const head = make('div', '', 'gear-currencies');
  for (const currency of inventory.currencies) {
    const shown = make('span', '', `gear-currency ${ROLES.chip}`);
    shown.title = currency.name;
    shown.append(
      glyphImage(currency.glyph === 'item' ? 'empty' : currency.glyph),
      make('b', currency.count.toLocaleString()),
    );
    head.append(shown);
  }
  const tabs = make('div', '', 'gear-tabs');
  for (const each of inventory.tabs) {
    const press = make('button', '', `gear-tab ${ROLES.button}`);
    press.classList.toggle('gear-chosen', each.id === tab);
    press.append(
      make('span', each.name),
      make('span', String(each.cells.filter((cell) => cell.glyph !== 'empty').length), 'gear-tab-count'),
    );
    press.addEventListener('click', () => choose(each.id));
    tabs.append(press);
  }
  const grid = make('div', '', 'gear-grid');
  const cells = inventory.tabs.find((each) => each.id === tab)?.cells ?? [];
  for (const cell of cells) {
    const node = make('button', '', `gear-cell ${ROLES.tile}`);
    if (cell.glyph !== 'resource' && cell.glyph !== 'empty') rarityOf(node, cell.rarity);
    node.classList.toggle('gear-none', cell.count === 0);
    node.append(
      cell.item
        ? itemIcon(context.picture(cell.item), cell.name, CELL_PX)
        : glyphImage(cell.glyph === 'item' ? 'empty' : cell.glyph, cell.rarity, cell.tint),
    );
    if (cell.count !== null) node.append(make('span', cell.count.toLocaleString(), 'gear-count'));
    const pips = cell.glyph === 'vestige' || cell.item ? (RARITIES[cell.rarity]?.pips ?? '') : '';
    if (pips) node.append(make('span', pips, 'gear-pips'));
    const item = cell.item;
    context.tip.over(node, () =>
      item ? cardNode(cardOf(item), context.picture(item), 'Click: take out · Right-click: inspect') : cellCard(cell),
    );
    node.addEventListener('click', () => {
      context.tip.hide();
      if (cell.press) context.ask(cell.press.ask);
    });
    node.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      context.tip.hide();
      if (item) context.inspect(item);
      else if (cell.other) context.ask(cell.other.ask);
    });
    grid.append(node);
  }
  if (cells.length === 0)
    grid.append(make('p', tab === 'vault' ? 'The vault is kept in a social space.' : 'Nothing here yet.', 'gear-hint'));
  page.append(head, tabs, grid);
  return page;
}
