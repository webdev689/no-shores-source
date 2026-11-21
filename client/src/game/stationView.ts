// A social space's station's screen in the menu, and its title: a keeper's (npc/npcScreen.ts), the pledged faction's
// with its muster of officers under its wares, or the Harbourmaster's stall of the Shipwright's modules (shipPages.ts).
import type { Cards } from '../player/cards.ts';
import type { PageContext } from './characterPage.ts';
import type { Station } from './gearScreen.ts';
import { HARBOURMASTER, KEEPERS } from './keepers.ts';
import { npcPage } from './npc/npcScreen.ts';
import { harbourPage, musterAt } from './shipPages.ts';

/** A station's screen, built anew each time the gear changes; `redraw` asks the menu to build it again. */
export function stationPage(context: PageContext, view: Station, forge: Cards | null, redraw: () => void): HTMLElement {
  if (view === 'harbourmaster') return harbourPage(context);
  return npcPage(context, view, forge, redraw, musterAt(context, KEEPERS[view].faction));
}

/** A station's screen's title, where the menu's tabs stand. */
export const stationTitle = (view: Station): string => (view === 'harbourmaster' ? HARBOURMASTER : KEEPERS[view].title);
