// Companions as the display names them: an officer ashore is named by their given and family names, whose places in
// the crew's own list the room sends, so every page names them alike.
import crew from '../../../content/gear/crew.json' with { type: 'json' };
import type { Companion } from '../network/messages.ts';

/** A companion's name, "Given Family"; "Officer" for places the list does not hold. */
export function officerName(companion: Pick<Companion, 'given' | 'family'>): string {
  const given = crew.given[companion.given];
  const family = crew.family[companion.family];
  return given && family ? `${given} ${family}` : 'Officer';
}
