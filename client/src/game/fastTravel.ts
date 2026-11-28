// A fast travel to one of a patrol zone's landing zones, picked on the land's map, as Destiny 2's are (the decision
// "The Saltgrass Downs Plays as Destiny 2's EDZ, Its Three Landing Zones Spread Across It"): a short fade, then the
// player stands there. The room judges and moves the body, refusing as it refuses a return to the ship; the page
// fades in on its answer.
import { ASKS } from '../network/gearMessages.ts';
import { answerOf, FALLEN, FIGHTING, NOT_YET, type ShipAsker } from './toShip.ts';

/** The room's answers (`room::asks`): its yes, and a zone the node has not. */
export const TRAVELLED = 110;
export const NO_ZONE = 100;
const ANSWERS: readonly number[] = [TRAVELLED, NOT_YET, FALLEN, FIGHTING, NO_ZONE];
/** How long the picture stays dark once the room has moved the player, so the ground round them comes, ms. */
const DARK_MS = 600;

/** Why the room refused a fast travel, in words; null where it took it. */
export function travelRefused(answer: number | null): string | null {
  if (answer === TRAVELLED) return null;
  const words: Record<number, string> = {
    [NOT_YET]: 'Your character has not reached the room yet. Try again.',
    [FALLEN]: 'You cannot fast travel while fallen.',
    [FIGHTING]: 'You cannot fast travel while fighting.',
  };
  return (answer !== null && words[answer]) || 'Your room did not answer. Try again.';
}

/** Fast travels the player on foot to their node's landing zone `zone`: the picture veiled (`veil`, words or none)
 *  while the room is asked, lifted on its answer; refused, `note` says why. A fallen player is refused at once; a
 *  zone the node has not, or no player on foot, goes nowhere. */
export async function fastTravel(
  foot: {
    readonly gear: ShipAsker | null;
    readonly fallen: boolean;
    readonly node: { readonly landings?: readonly { readonly name: string }[] };
  } | null,
  zone: number,
  veil: (words: string | null) => void,
  note: (words: string) => void,
  wait: (span: number) => Promise<void> = (span) => new Promise((done) => setTimeout(done, span)),
): Promise<void> {
  const name = foot?.node.landings?.[zone]?.name;
  if (!foot || name === undefined) return;
  if (foot.fallen) return note(travelRefused(FALLEN) ?? '');
  veil(`Travelling to ${name}`);
  const answer = await answerOf(() => foot.gear, { kind: ASKS.fastTravel, node: zone }, ANSWERS, wait);
  const why = travelRefused(answer);
  if (why === null) await wait(DARK_MS);
  veil(null);
  if (why !== null) note(why);
}
