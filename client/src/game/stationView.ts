// A social space's station's screen in the menu, and its title: a keeper's (npc/npcScreen.ts), the pledged faction's
// with its muster of officers under its wares, or the Harbourmaster's counter of ships, their dress, their names and
// the Shipwright's modules (harbour/harbourPage.ts) in his keeper's frame; and the bounty board's title, whose screen
// the menu builds with the board's clock (bountyBoard.ts).
import type { Node } from '../ui/node.ts';
import { BOARD_TITLE } from './bountyBoard.ts';
import type { Station } from './gearScreen.ts';
import { HARBOURMASTER, KEEPERS } from './keepers.ts';
import type { MenuContext } from './menuPage.ts';
import { bodyWidth } from './npc/keeperFrame.ts';
import { keeperScreen, npcPage } from './npc/npcScreen.ts';
import { harbourPage } from './harbour/harbourPage.ts';
import { musterAt } from './shipPages.ts';
import type { HullBuild } from './shipPanel.ts';

/** A station's screen, drawn each frame from the gear the room last sent: at the Harbourmaster's, the part and the
 *  ship chosen (`chosen`, moved by `choose`) and each hull's build (`builds`). */
export function stationPage(
  context: MenuContext,
  view: Exclude<Station, 'board'>,
  builds: readonly HullBuild[] | null = null,
  chosen: readonly [string, number | null] = ['shipyard', null],
  choose: (part: string, hull: number | null) => void = () => undefined,
): Node {
  if (view === 'harbourmaster') {
    // His parts lay themselves in the body's room, beside him.
    const room = { width: bodyWidth(context.room, context.sizes.label), height: context.room.height };
    return keeperScreen(context, view, [harbourPage({ ...context, room }, builds, chosen, choose)]);
  }
  return npcPage(context, view, musterAt(context, KEEPERS[view].faction));
}

/** A station's screen's title, where the menu's tabs stand. */
export const stationTitle = (view: Station): string =>
  view === 'board' ? BOARD_TITLE : view === 'harbourmaster' ? HARBOURMASTER : KEEPERS[view].title;
