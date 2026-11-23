// The Mount slot's own part of its flyout on the Character page ([[Horses Are Items Worn in a Mount Slot]]): beneath
// the horses it carries, every barding, worn over the horse with a click when kept, each tile the horse worn in it
// (the bay's hide with none worn), as the Appearance screen draws its pieces.

import type { Node } from '../ui/node.ts';
import { tileOf } from './appearance/appearancePage.ts';
import { cosmeticTiles } from './appearance/appearanceModel.ts';
import { label } from './gearNodes.ts';
import type { MenuContext } from './menuPage.ts';

/** The bardings a line, as the flyout's cells stand. */
const ACROSS = 3;

/** The bardings' row: its heading counting those kept, then a tile for each, `size` a side. */
export function bardingRow(context: MenuContext, size: number): Node {
  const tiles = cosmeticTiles(context.gear, 'barding', 'Barding');
  const kept = tiles.filter((tile) => tile.kept).length;
  const lines: Node[] = [];
  for (let start = 0; start < tiles.length; start += ACROSS)
    lines.push({ gap: 6, children: tiles.slice(start, start + ACROSS).map((tile) => tileOf(context, tile, size)) });
  return {
    direction: 'column',
    gap: 6,
    children: [label(`Barding · ${kept} of ${tiles.length} kept`, context.sizes.label), ...lines],
  };
}
