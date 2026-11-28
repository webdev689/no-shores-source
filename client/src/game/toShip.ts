// Returning to the ship, on the room's word: refused while fallen or within ten seconds of a foe's blow, so the ship
// is no way out of a death or a fight; before the accounts have said whose character the room holds; and to a player
// who keeps no ship yet. The room judges, the page leaves only on its yes.

import { ASKS, type GearAsk, type GearState } from '../network/gearMessages.ts';
import { answerText } from '../player/gear.ts';

/** The room's answers to a return to the ship (`room::asks`): refused before the accounts have given the room its
 *  character, while fallen or just struck, its yes, which no other ask gives, so another ask's done is never taken for
 *  it, and refused to one who keeps no ship. */
export const NOT_YET = 103;
export const FALLEN = 105;
export const FIGHTING = 106;
export const TO_SHIP = 107;
export const NO_SHIP = 109;
/** How long the page waits on the room's answer before saying it did not come. */
const ANSWER_WAIT_MS = 3000;
const POLL_MS = 100;

/** What a return to the ship asks of: the player's gear in their room, and the way to ask of it. */
export interface ShipAsker {
  readonly gear: GearState | null;
  ask(ask: GearAsk): void;
}

/** The answers the room gives a return to the ship: yes, or why not. */
const ANSWERS: readonly number[] = [TO_SHIP, NOT_YET, FALLEN, FIGHTING, NO_SHIP];
/** What the page says when its room gave no answer: out of reach, or yet to send the player's gear. */
const UNANSWERED = 'Your room did not answer. Try again.';

/** Why the room refused a return to the ship, in words; null where it answered yes. */
export function refusedWords(answer: number): string | null {
  if (answer === TO_SHIP) return null;
  return ANSWERS.includes(answer) ? answerText(answer) : 'You cannot return to your ship now.';
}

/** Asks the room whether the player may return to their ship: null once it says yes, or with no room to ask (offline,
 *  or a room lost for good, played on alone); else why not. A fallen player is refused at once, as the room would; a
 *  room joining again (`rejoining`), or yet to send the player's gear, gives no yes. */
export async function askToShip(
  asker: () => ShipAsker | null,
  fallen: boolean,
  rejoining: () => boolean,
  wait: (span: number) => Promise<void> = (span) => new Promise((done) => setTimeout(done, span)),
): Promise<string | null> {
  if (fallen) return refusedWords(FALLEN);
  const first = asker();
  if (!first) return rejoining() ? UNANSWERED : null;
  const answer = await answerOf(asker, { kind: ASKS.toShip }, ANSWERS, wait);
  return answer === null ? UNANSWERED : refusedWords(answer);
}

/** Asks the room `ask` and waits for its answer, one of `answers`: that answer, or null where none came in time (or
 *  the room sent no gear to answer with). An ask sent before this one may be answered first: only one of `answers`
 *  is its word. */
export async function answerOf(
  asker: () => ShipAsker | null,
  ask: GearAsk,
  answers: readonly number[],
  wait: (span: number) => Promise<void> = (span) => new Promise((done) => setTimeout(done, span)),
): Promise<number | null> {
  const first = asker();
  if (!first?.gear) return null;
  const before = first.gear.answered;
  first.ask(ask);
  for (let waited = 0; waited < ANSWER_WAIT_MS; waited += POLL_MS) {
    await wait(POLL_MS);
    const now = asker()?.gear;
    if (!now) return null;
    if (now.answered !== before && answers.includes(now.answer)) return now.answer;
  }
  return null;
}

/** Returns the player on foot to their ship on the room's yes (with no room, at once), else says why: `travel` goes,
 *  `note` tells the HUD. */
export function returnToShip(
  foot: { readonly gear: ShipAsker | null; readonly fallen: boolean; readonly rejoining: boolean } | null,
  travel: () => void,
  note: (words: string) => void,
): void {
  const asked = askToShip(
    () => foot?.gear ?? null,
    foot?.fallen ?? false,
    () => foot?.rejoining ?? false,
  );
  void asked.then((why) => (why === null ? travel() : note(why)));
}
