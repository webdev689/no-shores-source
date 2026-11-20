// The inventory page, after Destiny's: Aurem and Shapes, the currencies, along its head, each named under its count;
// then the Vestiges carried, ten places in two rows of five as Destiny 2's engrams stand, an empty place a dark
// Vestige; then shelves to switch between the consumables and the materials, each counting what it holds and dimmed
// while it holds nothing. The gear itself is on the Character page. Each shelf is a grid as Destiny's is: what is held
// first (the materials' fragments and Essence, then the islands' resources), a stack of none not shown, then empty
// places to the end of its row of ten. A cell is its glyph in a well of its rarity, its count at its foot and its pips
// beside it, as Enhanced Plus's cells are. Hovering or focusing a cell shows its card; a click does what it is for (a
// Vestige opened at the Mage); a right-click its other use.

import { make } from '../editor/dom.ts';
import { ASKS } from '../network/gearMessages.ts';
import { CARRIED, RARITIES } from '../player/gear.ts';
import { ROLES } from '../plus/kit.ts';
import type { PageContext } from './characterPage.ts';
import { shapesSvg, svgUrl } from './npc/npcMarks.ts';
import { type Cell, cardOf, inventoryPageOf } from './gearCards.ts';
import {
  DISMANTLE_KEY,
  type Hint,
  cardNode,
  dismantleOnHold,
  glyphImage,
  hintLine,
  holdToAct,
  itemIcon,
  itemMarks,
  rarityOf,
  tileLabel,
} from './gearDom.ts';

/** A cell's picture box, in pixels. */
const CELL_PX = 48;

/** Whether a cell holds anything: an item, or a count above none. */
const holds = (cell: Cell): boolean => cell.item !== null || cell.glyph === 'vestige' || (cell.count ?? 0) > 0;

/** What a cell's presses do, in keycaps. */
function hintsOf(cell: Cell): Hint[] {
  return [
    ...(cell.press ? [[cell.press.held ? 'Press' : 'Click', cell.press.label] as const] : []),
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
  // A cell a press does nothing to (a stack, a Vestige away from the Mage) is no button: it takes the focus for its
  // card and reads as a picture with its count, and a click on it makes no press's sound.
  const pressed = cell.press !== null || cell.other !== null || cell.item !== null;
  const node = make(pressed && !vacant ? 'button' : 'div', '', `gear-cell ${ROLES.tile}`);
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
  if (!pressed) {
    node.tabIndex = 0;
    node.setAttribute('role', 'img');
  }
  const item = cell.item;
  node.dataset['key'] = `cell-${cell.key}`;
  const what = cell.count === null ? '' : `${cell.count.toLocaleString()} held`;
  node.setAttribute('aria-label', tileLabel(cell.name, cell.item ? cell.rarity : null, what));
  if (item) node.dataset['details'] = '';
  // A piece carried is dismantled by holding F over it, wherever its tile stands.
  const carried = item?.at === CARRIED;
  if (item && carried) dismantleOnHold(node, item.rarity, () => context.ask({ kind: ASKS.dismantle, item: item.id }));
  const hints: Hint[] = [
    ...(cell.press ? [[cell.press.held ? 'Press' : 'Click', cell.press.label] as const] : []),
    ['Right-click / X', 'Details'],
    ...(carried ? [[DISMANTLE_KEY, 'Hold to dismantle'] as const] : []),
  ];
  context.tip.over(node, () => (item ? cardNode(cardOf(item), context.picture(item), hints) : cellCard(cell)));
  const press = cell.press;
  if (press?.held) holdToAct(node, () => context.ask(press.ask), { charges: () => node, burst: press.burst ?? null });
  else
    node.addEventListener('click', () => {
      context.tip.hide();
      if (press) context.ask(press.ask);
    });
  node.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    context.tip.hide();
    if (item) context.inspect(item);
    else if (cell.other) context.ask(cell.other.ask);
  });
  return node;
}

/** A shelf's tiles a row. */
const SHELF_ROW = 10;

/** An empty place for a Vestige: a dark one stands in it. */
export function vestigePlace(): HTMLElement {
  const place = make('div', '', `gear-cell ${ROLES.tile} gear-vacant gear-vestige-place`);
  place.append(glyphImage('vestige'));
  return place;
}

/** The Vestiges carried: their name and how many of the ten are held, then a place for each, an empty one a dark
 *  Vestige, as Destiny 2's engrams stand. */
function vestigeShelf(context: PageContext, vestiges: ReturnType<typeof inventoryPageOf>['vestiges']): HTMLElement {
  const section = make('section', '', 'gear-vestiges');
  const heading = make('h3', '', `gear-heading ${ROLES.rule}`);
  heading.append(make('span', 'Vestiges'), make('span', `${vestiges.held}/${vestiges.most}`));
  heading.setAttribute('aria-label', `Vestiges, ${vestiges.held} of ${vestiges.most} carried`);
  const grid = make('div', '', 'gear-vestige-grid');
  for (const cell of vestiges.cells) {
    if (cell.glyph !== 'empty') {
      grid.append(cellTile(context, cell));
      continue;
    }
    grid.append(vestigePlace());
  }
  section.append(heading, grid);
  return section;
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
  // Shapes, Shape's own currency, gathered all week and spent only while he is here.
  const shapes = make('div', '', `gear-currency ${ROLES.chip}`);
  const mark = make('img', '', 'gear-glyph');
  [mark.src, mark.alt] = [svgUrl(shapesSvg()), ''];
  const words = make('div', '', 'gear-currency-words');
  words.append(make('b', (context.gear.shapes ?? 0).toLocaleString()), make('span', 'Shapes', 'gear-currency-name'));
  shapes.append(mark, words);
  head.append(shapes);
  const shelves = inventory.tabs.map((each) => ({
    id: each.id,
    name: each.name,
    held: each.cells.filter(holds).length,
  }));
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
    // Its name and count are read apart, not run together as one word.
    press.setAttribute('aria-label', `${each.name}, ${each.held}`);
    press.addEventListener('click', () => choose(each.id));
    tabs.append(press);
  }
  page.append(head, vestigeShelf(context, inventory.vestiges), tabs);
  const cells = inventory.tabs.find((each) => each.id === tab)?.cells ?? [];
  const grid = make('div', '', 'gear-grid');
  for (const cell of cells) grid.append(cellTile(context, cell));
  // A grid's empty places stand as vacant tiles to the end of its row of ten, as the vault's do.
  for (let place = cells.length; place < Math.max(SHELF_ROW, Math.ceil(cells.length / SHELF_ROW) * SHELF_ROW); place++)
    grid.append(make('div', '', `gear-cell ${ROLES.tile} gear-vacant`));
  page.append(grid);
  return page;
}
