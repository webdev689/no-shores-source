// The inventory page, after Destiny's: the currencies along its head, each named under its count; shelves to switch
// between the gear carried, the consumables, the materials and the Vestiges, each counting what it holds and dimmed
// while it holds nothing. The gear shelf is Destiny 1's own: each slot's worn piece, then the nine it carries, a click
// wearing one. The materials are a list, each named beside its count, so nine alike are told apart; the rest are a
// grid of cells, each its glyph or item picture in a well of its rarity, its count at its foot and its pips beside it,
// as Enhanced Plus's cells are. Hovering or focusing a cell shows its card; a click does what it is for (a Vestige
// opened); a right-click its other use or the item's page.

import { make } from '../editor/dom.ts';
import type { GearItem } from '../network/gearMessages.ts';
import { CARRIED, RARITIES, SLOTS, itemName } from '../player/gear.ts';
import { ROLES } from '../plus/kit.ts';
import { ARMOUR, CELL_HINTS, type PageContext, WEAPONS } from './characterPage.ts';
import { type Cell, cardOf, flyoutOf, inventoryPageOf, wearIn } from './gearCards.ts';
import { type Hint, cardNode, glyphImage, hintLine, itemIcon, itemMarks, rarityOf, tileLabel } from './gearDom.ts';

/** A cell's picture box, a worn piece's, and a material's in its row, in pixels. */
const CELL_PX = 48;
const WORN_PX = 64;
const ROW_PX = 32;
/** A carried piece's picture in the gear shelf's three by three, smaller, as Destiny 1's are beside the worn one. */
const SMALL_PX = 34;

const capital = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

/** Whether a cell holds anything: an item, or a count above none. */
const holds = (cell: Cell): boolean => cell.item !== null || cell.glyph === 'vestige' || (cell.count ?? 0) > 0;

/** What a cell's presses do, in keycaps. */
function hintsOf(cell: Cell): Hint[] {
  return [
    ...(cell.press ? [['Click', cell.press.label] as const] : []),
    ...(cell.other ? [['Right-click', cell.other.label] as const] : []),
  ];
}

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
  const hints = hintsOf(cell);
  if (hints.length > 0) card.append(hintLine(hints, 'gear-card-hint'));
  return card;
}

/** A cell's tile: its picture in a well of its rarity, its count and pips, its card, and its presses. */
export function cellTile(context: PageContext, cell: Cell): HTMLElement {
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
  if (cell.item) itemMarks(node, cell.item);
  if (cell.count !== null) node.append(make('span', cell.count.toLocaleString(), 'gear-count'));
  const pips = cell.glyph === 'vestige' || cell.item ? (RARITIES[cell.rarity]?.pips ?? '') : '';
  if (pips) node.append(make('span', pips, 'gear-pips'));
  if (vacant) return node;
  const item = cell.item;
  node.dataset['key'] = `cell-${cell.key}`;
  const what = cell.count === null ? '' : `${cell.count.toLocaleString()} held`;
  node.setAttribute('aria-label', tileLabel(cell.name, cell.item ? cell.rarity : null, what));
  if (item) node.dataset['details'] = '';
  const hints: Hint[] = [...(cell.press ? [['Click', cell.press.label] as const] : []), ['Right-click / X', 'Details']];
  context.tip.over(node, () => (item ? cardNode(cardOf(item), context.picture(item), hints) : cellCard(cell)));
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
  return node;
}

/** A material in its row: its glyph, its name and its count, its card on hover or focus. */
/** A shelf's tiles a row. */
const SHELF_ROW = 10;

function materialRow(context: PageContext, cell: Cell): HTMLElement {
  const row = make('div', '', `gear-material ${ROLES.well}`);
  row.setAttribute('role', 'listitem');
  row.tabIndex = 0;
  row.dataset['key'] = `cell-${cell.key}`;
  row.classList.toggle('gear-none', !holds(cell));
  const icon = glyphImage(cell.glyph === 'item' ? 'empty' : cell.glyph, cell.rarity, cell.tint);
  icon.width = icon.height = ROW_PX;
  row.append(icon, make('span', cell.name, 'gear-material-name'), make('b', (cell.count ?? 0).toLocaleString()));
  row.setAttribute('aria-label', `${cell.name}, ${(cell.count ?? 0).toLocaleString()} held`);
  context.tip.over(row, () => cellCard(cell));
  return row;
}

/** A tile holding a piece of gear, in the worn place (`isWorn`) or carried, its card against the piece worn. */
function gearTile(
  context: PageContext,
  item: GearItem | null,
  slot: number,
  worn: GearItem | null,
  isWorn = false,
  small = false,
): HTMLElement {
  const tile = make(item ? 'button' : 'div', '', `gear-cell ${ROLES.tile}${small ? ' gear-small' : ''}`);
  rarityOf(tile, item?.rarity ?? null);
  tile.classList.toggle('gear-worn', isWorn);
  const box = isWorn ? WORN_PX : small ? SMALL_PX : CELL_PX;
  tile.append(item ? itemIcon(context.picture(item), itemName(item), box) : glyphImage('empty'));
  if (!item) {
    tile.classList.add('gear-vacant');
    return tile;
  }
  itemMarks(tile, item);
  const pips = RARITIES[item.rarity]?.pips ?? '';
  if (pips) tile.append(make('span', pips, 'gear-pips'));
  tile.dataset['key'] = `item-${item.id}`;
  tile.dataset['details'] = '';
  tile.setAttribute('aria-label', tileLabel(itemName(item), item.rarity, isWorn ? 'worn' : 'carried'));
  const hints: readonly Hint[] = isWorn ? [['Right-click / X', 'Details']] : CELL_HINTS;
  context.tip.over(tile, () => cardNode(cardOf(item, isWorn ? null : worn), context.picture(item), hints));
  tile.addEventListener('click', () => {
    context.tip.hide();
    const wear = isWorn ? null : wearIn(item, slot);
    if (wear) context.ask(wear.ask);
    else context.inspect(item);
  });
  tile.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    context.tip.hide();
    context.inspect(item);
  });
  return tile;
}

/** The gear shelf: a row for each slot, its worn piece and then the nine it carries. */
/** The gear shelf, after Destiny 1's: the weapons and cloak on the left, the armour on the right, each slot's worn
 *  piece with its name beside the nine it carries, three by three. */
function gearShelf(context: PageContext): HTMLElement {
  const shelf = make('div', '', 'gear-gear');
  for (const side of [WEAPONS, ARMOUR]) {
    const column = make('div', '', 'gear-gear-side');
    for (const slot of side) {
      const { worn, cells } = flyoutOf(context.gear, slot);
      const row = make('div', '', 'gear-gear-row');
      const label = make('div', '', 'gear-gear-label');
      label.append(make('span', capital(SLOTS[slot] ?? ''), 'gear-slot-name'));
      if (worn) label.append(make('span', itemName(worn), 'gear-slot-item'));
      const carried = make('div', '', 'gear-gear-carried');
      carried.append(...cells.map((item) => gearTile(context, item, slot, worn, false, true)));
      row.append(label, gearTile(context, worn, slot, worn, true), carried);
      column.append(row);
    }
    shelf.append(column);
  }
  return shelf;
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
  const carried = context.gear.items.filter((item) => item.at === CARRIED).length;
  const shelves = [
    { id: 'gear', name: 'Gear', held: carried },
    ...inventory.tabs.map((each) => ({ id: each.id, name: each.name, held: each.cells.filter(holds).length })),
  ];
  const tabs = make('div', '', `gear-shelves ${ROLES.well}`);
  tabs.setAttribute('role', 'tablist');
  for (const each of shelves) {
    const press = make('button', '', 'gear-shelf');
    press.dataset['key'] = `shelf-${each.id}`;
    press.setAttribute('role', 'tab');
    press.setAttribute('aria-selected', String(each.id === tab));
    press.classList.toggle('gear-chosen', each.id === tab);
    press.classList.toggle('gear-bare', each.held === 0);
    press.append(make('span', each.name), make('span', String(each.held), 'gear-tab-count'));
    press.addEventListener('click', () => choose(each.id));
    tabs.append(press);
  }
  page.append(head, tabs);
  if (tab === 'gear') {
    page.append(gearShelf(context));
    return page;
  }
  const cells = inventory.tabs.find((each) => each.id === tab)?.cells ?? [];
  const listed = tab === 'materials';
  const grid = make('div', '', listed ? 'gear-list' : 'gear-grid');
  if (listed) grid.setAttribute('role', 'list');
  for (const cell of cells) grid.append(listed ? materialRow(context, cell) : cellTile(context, cell));
  if (listed && cells.length === 0) grid.append(make('p', 'Nothing here yet.', 'gear-hint gear-empty'));
  // A grid's empty places stand as vacant tiles to the end of its row of ten, as the vault's and the Vestiges' do.
  if (!listed)
    for (
      let place = cells.length;
      place < Math.max(SHELF_ROW, Math.ceil(cells.length / SHELF_ROW) * SHELF_ROW);
      place++
    )
      grid.append(make('div', '', `gear-cell ${ROLES.tile} gear-vacant`));
  page.append(grid);
  return page;
}
