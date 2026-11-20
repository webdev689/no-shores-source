// The vault's two sides, as Destiny's vault opens in the Tower: its weapons, armour and Vestiges beside what the player
// carries, each a click to move across. They stand in the vault keeper's screen, where a keeper's wares stand
// (npc/npcScreen.ts).

import { make } from '../editor/dom.ts';
import { ROLES } from '../plus/kit.ts';
import type { PageContext } from './characterPage.ts';
import { type VaultShelf, vaultOf } from './gearCards.ts';
import { cellTile, vestigePlace } from './inventoryPage.ts';

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
