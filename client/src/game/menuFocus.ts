// Where the menu's focus goes when the press holding it goes (dismantled, worn, sold, moved): to the press beside it
// in what holds it, read off the tree the menu built this frame.
import type { Child, Node } from '../ui/node.ts';

/** The ids of what takes the focus under `node`, as the interface walks them: presses, fields and the focusable. */
export function pressesIn(node: Child): string[] {
  if (!node) return [];
  const own = (node.press || node.field || node.focusable) && !node.disabled && node.id ? [node.id] : [];
  return [...own, ...(node.children ?? []).flatMap(pressesIn)];
}

/** The nodes from `node` down to the one named `id`, or null where it holds none. */
function pathTo(node: Node, id: string): Node[] | null {
  if (node.id === id) return [node];
  for (const child of node.children ?? []) {
    const below = child ? pathTo(child, id) : null;
    if (below) return [node, ...below];
  }
  return null;
}

/** The presses to take the focus should `id` go, nearest first: the next and the last before it among what holds
 *  it, then among what holds that, and so on out to the menu's body. A keeper's tile, held with its price, so finds
 *  the tiles beside it, then the next row's first and the last row's last. */
export function besideOf(root: Node, id: string): string[] {
  const path = pathTo(root, id) ?? [];
  const found: string[] = [];
  for (let level = path.length - 1; level > 0 && path[level]?.id !== 'gear-body'; level--) {
    const [holder, held] = [path[level - 1], path[level]];
    const children = holder?.children ?? [];
    const place = children.indexOf(held);
    const [after] = children.slice(place + 1).flatMap(pressesIn);
    const before = children.slice(0, place).flatMap(pressesIn).at(-1);
    found.push(...[after, before].filter((each): each is string => each !== undefined));
  }
  return found;
}
