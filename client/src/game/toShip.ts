// Returning to the ship, on the room's word: refused while fallen or within ten seconds of a foe's blow, as the owner
// chose ([[The Audit's Leftovers Are Fixed as Claude Suggested]]); the room judges, the page leaves only on its yes.

import { ASKS, type GearAsk, type GearState } from '../network/gearMessages.ts';

/** The room's answers to a return to the ship that refuse it (`room::asks`). */
export const FALLEN = 105;
export const FIGHTING = 106;
/** How long the page waits on the room's answer before saying it did not come. */
const ANSWER_WAIT_MS = 3000;
const POLL_MS = 100;

/** What a return to the ship asks of: the player's gear in their room, and the way to ask of it. */
export interface ShipAsker {
  readonly gear: GearState | null;
  ask(ask: GearAsk): void;
}

/** Why the room refused a return to the ship, in words; null where it answered yes. */
export function refusedWords(answer: number): string | null {
  if (answer === FALLEN) return 'You cannot return to your ship while fallen.';
  if (answer === FIGHTING) return 'You cannot return to your ship within ten seconds of being struck.';
  return answer === 0 ? null : 'You cannot return to your ship now.';
}

/** Asks the room whether the player may return to their ship: null once it says yes, or with no room to ask (offline);
 *  else why not. A fallen player is refused at once, as the room would. */
export async function askToShip(
  asker: () => ShipAsker | null,
  fallen: boolean,
  wait: (span: number) => Promise<void> = (span) => new Promise((done) => setTimeout(done, span)),
): Promise<string | null> {
  if (fallen) return refusedWords(FALLEN);
  const first = asker();
  if (!first?.gear) return null;
  const before = first.gear.answered;
  first.ask({ kind: ASKS.toShip });
  for (let waited = 0; waited < ANSWER_WAIT_MS; waited += POLL_MS) {
    await wait(POLL_MS);
    const now = asker()?.gear;
    if (!now) return null;
    if (now.answered !== before) return refusedWords(now.answer);
  }
  return 'Your room did not answer. Try again.';
}

/** Returns the player on foot to their ship on the room's yes, else says why: `travel` goes, `note` tells the HUD. */
export function returnToShip(
  foot: { readonly gear: ShipAsker | null; readonly fallen: boolean } | null,
  travel: () => void,
  note: (words: string) => void,
): void {
  void askToShip(() => foot?.gear ?? null, foot?.fallen ?? false).then((why) => (why === null ? travel() : note(why)));
}
