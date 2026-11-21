// The vault's two sides, as Destiny's vault opens in the Tower: its weapons, armour and Vestiges beside what the player
// carries, each a click to move across. They stand in the vault keeper's screen, where a keeper's wares stand
// (npc/npcScreen.ts).
// shortcut: made of elements while the keeper's screen that holds it is; drawn with inventoryPage.ts's `cellNode` once
// npcScreen.ts is drawn.

import { make } from '../editor/dom.ts';
import { ASKS } from '../network/gearMessages.ts';
import { CARRIED, RARITIES } from '../player/gear.ts';
import { ROLES } from '../plus/kit.ts';
import { type Cell, type VaultShelf, cardOf, vaultOf } from './gearCards.ts';
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
import type { PageContext } from './menuPage.ts';

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
function cellTile(context: PageContext, cell: Cell): HTMLElement {
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

/** An empty place for a Vestige: a dark one stands in it. */
function vestigePlace(): HTMLElement {
  const place = make('div', '', `gear-cell ${ROLES.tile} gear-vacant gear-vestige-place`);
  place.append(glyphImage('vestige'));
  return place;
}

/** One shelf: its name and how full it is, then its cells, or a word that it is empty. */
function shelfNode(context: PageContext, shelf: VaultShelf): HTMLElement {
  const node = make('section', '', 'gear-vault-shelf');
  const heading = make('h3', '', `gear-heading ${ROLES.rule}`);
  heading.append(
    make('span', shelf.name),
    make('span', shelf.most ? `${shelf.held}/${shelf.most}` : String(shelf.held)),
  );
  // Vestiges stand five a row, as the inventory's do; the rest in rows as wide as the menu gives them.
  const grid = make('div', '', shelf.vestiges ? 'gear-vestige-grid' : 'gear-grid');
  grid.append(...shelf.cells.map((cell) => cellTile(context, cell)));
  // Its empty places stand as vacant tiles, as every other shelf's do.
  for (let place = shelf.cells.length; place < shelf.most; place++)
    grid.append(shelf.vestiges ? vestigePlace() : make('div', '', `gear-cell ${ROLES.tile} gear-vacant`));
  node.append(heading, grid);
  return node;
}

/** The vault, after Destiny 1's: what it keeps on the left, what the player carries on the right. */
export function vaultPage(context: PageContext): HTMLElement {
  const vault = vaultOf(context.gear);
  const page = make('div', '', 'gear-vault');
  const side = (title: string, shelves: readonly VaultShelf[]) => {
    const column = make('div', '', `gear-vault-side ${ROLES.panel}`);
    column.append(make('h2', title, 'gear-vault-title'), ...shelves.map((shelf) => shelfNode(context, shelf)));
    return column;
  };
  page.append(side('In the vault', vault.kept), side('Carried', vault.carried));
  return page;
}
