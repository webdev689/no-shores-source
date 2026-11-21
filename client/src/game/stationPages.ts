// The vault's two sides, as Destiny's vault opens in the Tower: its weapons, armour and Vestiges beside what the player
// carries, each a click to move across. They stand in the vault keeper's screen, where a keeper's wares stand
// (npc/npcScreen.ts); each cell is the inventory's (inventoryPage.ts).

import type { Node } from '../ui/node.ts';
import { type VaultShelf, vaultOf } from './gearCards.ts';
import { INK, label, words } from './gearNodes.ts';
import { cellNode, vacantNode } from './inventoryPage.ts';
import type { MenuContext } from './menuPage.ts';

/** One shelf: its name and how full it is over a rule, then its cells and its empty places, as many to a row as the
 *  side gives them (Vestiges five a row, as the inventory's stand). */
function shelfNode(context: MenuContext, shelf: VaultShelf, size: number): Node {
  const cells = [
    ...shelf.cells.map((cell) => cellNode(context, cell)),
    ...Array.from({ length: Math.max(0, shelf.most - shelf.cells.length) }, () => vacantNode(shelf.vestiges)),
  ];
  return {
    width: 'grow',
    direction: 'column',
    children: [
      {
        width: 'grow',
        direction: 'column',
        gap: 4,
        padding: [4, 0, 6, 0],
        children: [
          {
            width: 'grow',
            children: [
              { width: 'grow', children: [label(shelf.name, size)] },
              words(shelf.most ? `${shelf.held}/${shelf.most}` : String(shelf.held), size, INK.faint),
            ],
          },
          { width: 'grow', height: 1, fill: 'rgba(163,152,128,0.26)' },
        ],
      },
      { width: 'grow', gap: 6, wrap: true, children: cells },
    ],
  };
}

/** The vault, after Destiny 1's: what it keeps on the left, what the player carries on the right. */
export function vaultPage(context: MenuContext, size: number): Node {
  const vault = vaultOf(context.gear);
  const side = (title: string, shelves: readonly VaultShelf[]): Node => ({
    role: 'panel',
    width: 'grow',
    direction: 'column',
    gap: 12,
    padding: [14, 16],
    children: [
      { padding: [0, 0, 0, 0], children: [words(title, 2, INK.brassLit)] },
      ...shelves.map((shelf) => shelfNode(context, shelf, size)),
    ],
  });
  return { width: 'grow', gap: 18, children: [side('In the vault', vault.kept), side('Carried', vault.carried)] };
}
