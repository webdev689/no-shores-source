// The player's own ship as a development page's picture asks it (qaViews.ts `__qaShip`): a page playing alone holds
// no gear, so its ship has only the Sloop's hull and no dress of the player's own.
import type { SeenShip } from '../network/messages.ts';

/** The hull, dress and emblem asked over the room's word of the own ship; null in play. */
export const QA_SHIP: { look: Partial<Pick<SeenShip, 'hull' | 'dress' | 'emblem'>> | null } = { look: null };
