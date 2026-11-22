// Where the keys and the pad move focus: among what acts (a press, a field, what is focusable), round in order by Tab
// or to the nearest an arrow's way; and, while a modal node is laid, only among what acts inside the topmost one.
import type { Laid, Node } from './node.ts';
import type { Box } from './quads.ts';

/** The arrow keys' ways, across and down. */
export const ARROWS: Readonly<Record<string, readonly [number, number]>> = {
  arrowup: [0, -1],
  arrowdown: [0, 1],
  arrowleft: [-1, 0],
  arrowright: [1, 0],
};

/** Whether `node` acts: it is pressed, typed in or focused, and has an id to be known by. */
export const acts = (node: Node): boolean =>
  Boolean((node.press || node.field || node.focusable) && !node.disabled && node.id);

/** The topmost modal node laid, which holds the keys and the pad while it stands; null with none. */
export function modalOf(laid: readonly Laid[]): Laid | null {
  for (let index = laid.length - 1; index >= 0; index--) if (laid[index]?.node.modal) return laid[index] ?? null;
  return null;
}

/** Whether `laid` is `holder` or stands inside it; anything is inside no holder. */
export function inside(laid: Laid, holder: Laid | null): boolean {
  for (let each: Laid | null = laid; each; each = each.parent) if (each === holder) return true;
  return holder === null;
}

/** What acts that focus can reach, in drawing order: inside the topmost modal node while one is laid. */
export function reachable(laid: readonly Laid[]): Laid[] {
  const modal = modalOf(laid);
  return laid.filter((each) => acts(each.node) && inside(each, modal));
}

/** The one after `from` in `all` (`direction` 1), or before it (−1), round from the end; the first or the last with
 *  none. */
export function stepped(all: readonly Laid[], from: Laid | null, direction: 1 | -1): Laid | null {
  if (all.length === 0) return null;
  const now = from ? all.indexOf(from) : -1;
  const next = now < 0 ? (direction > 0 ? 0 : all.length - 1) : (now + direction + all.length) % all.length;
  return all[next] ?? null;
}

const middleOf = (box: Box) => [box.x + box.width / 2, box.y + box.height / 2] as const;

/** The nearest of `all` from `from` `across` and `down` (each −1, 0 or 1), its distance along that way counted once
 *  and aside it twice; the first with none from, and nothing that way. */
export function toward(
  all: readonly Laid[],
  from: Laid | null,
  [across, down]: readonly [number, number],
): Laid | null {
  if (!from || !all.includes(from)) return all[0] ?? null;
  const [fromX, fromY] = middleOf(from.box);
  let best: Laid | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const laid of all) {
    if (laid === from) continue;
    const [x, y] = middleOf(laid.box);
    const along = (x - fromX) * across + (y - fromY) * down;
    if (along <= 0) continue;
    const aside = Math.abs((x - fromX) * down) + Math.abs((y - fromY) * across);
    const score = along + 2 * aside;
    if (score < bestScore) [best, bestScore] = [laid, score];
  }
  return best;
}

/** Scrolls each list that holds `focused`, the innermost first, until it is in sight in all of them; answers how far
 *  that moves it down. */
export function scrollToShow(focused: Laid, scrolls: Map<string, number>): number {
  let [top, bottom] = [focused.box.y, focused.box.y + focused.box.height];
  for (let holder = focused.parent; holder; holder = holder.parent) {
    const id = holder.node.id;
    if (!holder.node.scroll || !id) continue;
    const scrolled = scrolls.get(id) ?? 0;
    const above = holder.box.y - top;
    const below = bottom - (holder.box.y + holder.box.height);
    const wanted = above > 0 ? scrolled - above : below > 0 ? scrolled + below : scrolled;
    const next = Math.max(0, Math.min(wanted, holder.content - holder.box.height));
    scrolls.set(id, next);
    // Scrolled, the node moves within the holders outside this one.
    [top, bottom] = [top - (next - scrolled), bottom - (next - scrolled)];
  }
  return top - focused.box.y;
}
