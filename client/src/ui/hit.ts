// What the pointer is on: the topmost laid node under a point that takes it, and what a press there acts on.
import { acts } from './focus.ts';
import type { Laid, Node } from './node.ts';
import type { Box } from './quads.ts';

const takes = (node: Node) =>
  Boolean(
    node.press ||
    node.field ||
    node.focusable ||
    node.solid ||
    node.role ||
    node.fill ||
    node.picture ||
    node.text ||
    node.scroll,
  );
const over = (box: Box, x: number, y: number) =>
  x >= box.x && y >= box.y && x < box.x + box.width && y < box.y + box.height;
/** Whether the pointer passes through `laid`: it, or what holds it, lets it through. */
const passes = (laid: Laid | null): boolean => (laid ? Boolean(laid.node.through) || passes(laid.parent) : false);

/** The topmost of `laid` under the point that takes the pointer, unless it lets the pointer through. */
export function hitAt(laid: readonly Laid[], x: number, y: number): Laid | null {
  for (let index = laid.length - 1; index >= 0; index--) {
    const each = laid[index];
    if (each && takes(each.node) && over(each.box, x, y) && over(each.clip, x, y) && !passes(each)) return each;
  }
  return null;
}

/** What a press at the point acts on: the node hit, or the nearest of its parents that acts. */
export function targetAt(laid: readonly Laid[], x: number, y: number): Laid | null {
  for (let each = hitAt(laid, x, y); each; each = each.parent) if (acts(each.node)) return each;
  return null;
}

/** Scrolls the innermost list under the point by `rolled`, kept within what it holds; answers whether the interface
 *  is under the point, so the wheel there is its own. */
export function scrolledAt(
  laid: readonly Laid[],
  x: number,
  y: number,
  rolled: number,
  scrolls: Map<string, number>,
): boolean {
  for (let each = hitAt(laid, x, y); each; each = each.parent) {
    const id = each.node.id;
    if (each.node.scroll && id) {
      scrolls.set(id, keptIn(each, (scrolls.get(id) ?? 0) + rolled));
      return true;
    }
  }
  return hitAt(laid, x, y) !== null;
}

/** A scroll of `laid` kept within what it holds. */
export const keptIn = (laid: Laid, scroll: number): number =>
  Math.max(0, Math.min(scroll, laid.content - laid.box.height));

/** Whether any of the pointer's presses `downs` (what each hit) fell on something neither `id` nor inside it. */
export function pressedOutside(downs: readonly (Laid | null)[], id: string): boolean {
  return downs.some((hit) => {
    for (let each = hit; each; each = each.parent) if (each.node.id === id) return false;
    return true;
  });
}
