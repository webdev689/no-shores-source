// A social space's station's screen in the menu, and its title: a keeper's (npc/npcScreen.ts), the pledged faction's
// with its muster of officers under its wares, or the Harbourmaster's stall of the Shipwright's modules (shipPages.ts).
import type { Node } from '../ui/node.ts';
import type { Station } from './gearScreen.ts';
import { HARBOURMASTER, KEEPERS } from './keepers.ts';
import type { MenuContext } from './menuPage.ts';
import { npcPage } from './npc/npcScreen.ts';
import { harbourPage, musterAt } from './shipPages.ts';

/** A station's screen, drawn each frame from the gear the room last sent. */
export function stationPage(context: MenuContext, view: Station): Node {
  if (view === 'harbourmaster') return harbourPage(context);
  return npcPage(context, view, musterAt(context, KEEPERS[view].faction));
}

/** A station's screen's title, where the menu's tabs stand. */
export const stationTitle = (view: Station): string => (view === 'harbourmaster' ? HARBOURMASTER : KEEPERS[view].title);
