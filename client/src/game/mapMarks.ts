// What moves on the land's held map, from the room the player stands in (its every snapshot holds all its players):
// every other player where they stand, in their nameplate's colours, and the zone's public event while it runs.
import type { MapMarks } from '../heldmap/landSheet.ts';
import type { PublicEvent } from '../network/publicMessages.ts';
import type { OtherPlayers } from '../player/others.ts';
import { ofCompany } from './companyHud.ts';
import { mapEventOf } from './publicLaw.ts';

/** The other players in the room and the zone's public event running, as the land's map marks them; `company` says
 *  whether a player's name is in the viewer's company. */
export function mapMarksOf(
  event: PublicEvent | null,
  others: Pick<OtherPlayers, 'placed' | 'plateOf'>,
  company = ofCompany(),
): MapMarks {
  const running = mapEventOf(event);
  return {
    others: [...others.placed].map(([number, placed]) => ({
      at: [placed.x, placed.y] as const,
      company: company(others.plateOf(number)?.name ?? ''),
    })),
    events: running ? [running] : [],
  };
}
