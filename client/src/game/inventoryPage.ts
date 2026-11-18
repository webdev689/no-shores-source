// The inventory page, after Destiny's: the currencies along its head, each named under its count; tabs to switch
// between the consumables, the materials, the Vestiges and the vault, each counting what it holds and dimmed while it
// holds nothing; and a grid of cells, each its glyph or item picture in a well of its rarity, its count at its foot and
// its pips beside it, as Enhanced Plus's cells are. Hovering or focusing a cell shows its card; a click does what it
// is for (a Vestige identified, an item taken out of the vault); a right-click its other use or the item's page.

import { make } from '../editor/dom.ts';
import { RARITIES } from '../player/gear.ts';
import { ROLES } from '../plus/kit.ts';
import type { PageContext } from './characterPage.ts';
import { type Cell, cardOf, inventoryPageOf } from './gearCards.ts';
import { cardNode, glyphImage, itemIcon, rarityOf, tileLabel } from './gearDom.ts';

/** A cell's picture box, in pixels. */
const CELL_PX = 48;

/** Whether a cell holds anything: an item, or a count above none. */
const holds = (cell: Cell): boolean => cell.item !== null || cell.glyph === 'vestige' || (cell.count ?? 0) > 0;

/** A cell's plain card: its name, how many are held, its words and what its presses do. */
function cellCard(cell: Cell): HTMLElement {
  const card = make('div', '', `gear-card ${ROLES.panel}`);
  rarityOf(card, cell.glyph === 'vestige' ? cell.rarity : null);
  const head = make('div', '', 'gear-card-head');
  const meta = cell.count === null ? '' : `${cell.count.toLocaleString()} held`;
  head.append(make('h3', cell.name), make('p', meta, 'gear-card-meta'));
  const body = make('div', '', 'gear-card-body');
  body.append(make('p', cell.words, 'gear-card-words'));
  card.append(head, body);
  const hints = [cell.press && `Click: ${cell.press.label}`, cell.other && `Right-click: ${cell.other.label}`];
  const said = hints.filter(Boolean).join(' · ');
  if (said) card.append(make('p', said, 'gear-card-hint'));
  return card;
}

export function inventoryPage(context: PageContext, tab: string, choose: (tab: string) => void): HTMLElement {
  const page = make('div', '', 'gear-inventory');
  const inventory = inventoryPageOf(context.gear);
  const head = make('div', '', 'gear-currencies');
  for (const currency of inventory.currencies) {
    const shown = make('div', '', `gear-currency ${ROLES.chip}`);
    const count = make('b', currency.count.toLocaleString());
    const words = make('div', '', 'gear-currency-words');
    words.append(count, make('span', currency.name, 'gear-currency-name'));
    shown.append(glyphImage(currency.glyph === 'item' ? 'empty' : currency.glyph), words);
    head.append(shown);
  }
  const tabs = make('div', '', 'gear-tabs gear-shelves');
  tabs.setAttribute('role', 'tablist');
  for (const each of inventory.tabs) {
    const press = make('button', '', `gear-tab gear-shelf ${ROLES.button}`);
    const held = each.cells.filter(holds).length;
    press.dataset['key'] = `shelf-${each.id}`;
    press.setAttribute('role', 'tab');
    press.setAttribute('aria-selected', String(each.id === tab));
    press.classList.toggle('gear-chosen', each.id === tab);
    press.classList.toggle('gear-bare', held === 0);
    press.append(make('span', each.name), make('span', String(held), 'gear-tab-count'));
    press.addEventListener('click', () => choose(each.id));
    tabs.append(press);
  }
  const grid = make('div', '', 'gear-grid');
  const cells = inventory.tabs.find((each) => each.id === tab)?.cells ?? [];
  for (const cell of cells) {
    const vacant = cell.glyph === 'empty';
    const node = make(vacant ? 'div' : 'button', '', `gear-cell ${ROLES.tile}`);
    if (cell.glyph === 'vestige' || cell.item) rarityOf(node, cell.rarity);
    node.classList.toggle('gear-none', !vacant && !holds(cell));
    node.classList.toggle('gear-vacant', vacant);
    node.append(
      cell.item
        ? itemIcon(context.picture(cell.item), cell.name, CELL_PX)
        : glyphImage(cell.glyph === 'item' ? 'empty' : cell.glyph, cell.rarity, cell.tint),
    );
    if (cell.count !== null) node.append(make('span', cell.count.toLocaleString(), 'gear-count'));
    const pips = cell.glyph === 'vestige' || cell.item ? (RARITIES[cell.rarity]?.pips ?? '') : '';
    if (pips) node.append(make('span', pips, 'gear-pips'));
    grid.append(node);
    if (vacant) continue;
    const item = cell.item;
    node.dataset['key'] = `cell-${cell.key}`;
    const what = cell.count === null ? '' : `${cell.count.toLocaleString()} held`;
    node.setAttribute('aria-label', tileLabel(cell.name, cell.item ? cell.rarity : null, what));
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
  }
  if (cells.length === 0)
    grid.append(
      make('p', tab === 'vault' ? 'The vault opens in a social space.' : 'Nothing here yet.', 'gear-hint gear-empty'),
    );
  page.append(head, tabs, grid);
  return page;
}
