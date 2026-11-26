// Why a player cannot go to a member of their company yet, as Go to them answers before it takes them anywhere.
import { passageRoom } from './rooms.ts';

/** Why the player cannot go now to their company's member who plays in the room `place`: something else under way, a
 *  fight at sea, the player fallen, or the member in the passages, which are gone into at a mouth; null for none. */
export function notYet(
  place: string,
  now: { readonly free: boolean; readonly fighting: boolean; readonly fallen: boolean },
): string | null {
  if (!now.free) return 'You are in their company. Choose Go to them once nothing else is under way.';
  // As other games keep travel out of a fight, and the fallen respawn before they go anywhere.
  if (now.fighting) return 'You are in their company. Go to them once the fight is over.';
  if (now.fallen) return 'You are in their company. Go to them once you respawn.';
  return passageRoom(place) ? 'They are in the passages: go in at a mouth on your company’s route.' : null;
}
