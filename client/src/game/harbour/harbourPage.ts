// The Harbourmaster's counter, drawn by the game, in four parts chosen as the inventory's shelves are: the shipyard
// (every hull, bought and sailed), the paint yard (each ship kept dressed), the register (each ship kept named) and
// the Shipwright's modules of the day. The ship a part dresses or names is the one sailed until another is chosen.
import type { Node } from '../../ui/node.ts';
import { shelvesNode } from '../inventoryPage.ts';
import type { MenuContext } from '../menuPage.ts';
import type { HullBuild } from '../shipPanel.ts';
import { shipwrightPart } from '../shipPages.ts';
import { dressPart } from './dressPart.ts';
import { type NameDraft, draftFor, namePart } from './namePart.ts';
import { shipyardPart } from './shipyardPart.ts';

/** The counter's parts, by the shelf id the menu keeps. */
export const HARBOUR_PARTS = [
  { id: 'shipyard', name: 'Shipyard' },
  { id: 'paint', name: 'Paint' },
  { id: 'name', name: 'Name' },
  { id: 'shipwright', name: 'Shipwright' },
] as const;

/** The words waiting on the register for a name, kept between frames for the ship they were chosen for. */
let draft: NameDraft | null = null;

/** The counter: the part `shown` (the shipyard for any other), for the ship kept of `hull` (the one sailed for none
 *  or one not kept); `choose` moves to another part, or another ship. Each hull's numbers are `builds`', none until
 *  the rules' door has given them. */
export function harbourPage(
  context: MenuContext,
  builds: readonly HullBuild[] | null,
  [shown, hull]: readonly [string, number | null],
  choose: (part: string, hull: number | null) => void,
): Node {
  const part = HARBOUR_PARTS.find((each) => each.id === shown)?.id ?? 'shipyard';
  const ship = context.gear.ship;
  const kept = (number: number | null) => ship?.fleet.some((each) => each.hull === number) ?? false;
  const chosen = kept(hull) && hull !== null ? hull : (ship?.sailed ?? 0);
  const ships = (next: number) => choose(part, next);
  if (draft?.hull !== chosen) draft = draftFor(context, chosen);
  const body =
    part === 'paint'
      ? dressPart(context, chosen, ships)
      : part === 'name'
        ? namePart(context, draft, ships)
        : part === 'shipwright'
          ? shipwrightPart(context)
          : shipyardPart(context, builds);
  return {
    width: 'grow',
    direction: 'column',
    gap: 10,
    children: [
      {
        padding: [0, 18],
        children: [shelvesNode(context, HARBOUR_PARTS, part, (next) => choose(next, hull), 'harbour')],
      },
      body,
    ],
  };
}
