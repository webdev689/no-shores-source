// A trip that fails (its room full, or out of reach) takes the player back where they stood, and should that fail too,
// to the hub, Overlook's social space, told why each time. Only when the hub fails too does the veil stay, saying why,
// and Enter tries the trip again. Pure: the game hands it the ways and draws what it answers.
import type { Flow, Happening } from './flow.ts';

/** A place a trip that failed takes the player to instead: the flow they stand in there, and the way there. */
export interface Refuge {
  readonly flow: Flow;
  readonly go: () => Promise<void>;
}

/** Where a failed trip leaves the player: the place it was for, the way back to where they stood (none where they
 *  were sent out), and the hub, by its name. */
export interface Fallback {
  readonly place: string;
  readonly back: Refuge | null;
  readonly hub: Refuge & { readonly name: string };
}

/** Where the player was taken instead of where the trip went, and the words that tell them why. */
export interface Instead {
  readonly flow: Flow;
  readonly told: string;
}

/** How long the words that tell why stay on screen once the veil lifts, ms. */
export const TOLD_MS = 8000;

/** Whether a trip sends the player out of where they stood, which would only send them out again: a gate shut on
 *  them, or their company fallen. */
export function sentOut(happening: Happening): boolean {
  return happening.kind === 'shut' || happening.kind === 'wiped' || (happening.kind === 'surface' && happening.fell);
}

/** The place a trip ending in `then` is for: the player's ship, or the node by its name (`nameOf`), else by the
 *  happening's. */
export function placeOf(then: Flow, happening: Happening, nameOf: (node: string) => string | undefined): string {
  if (then.mode !== 'foot') return 'your ship';
  return nameOf(then.node) ?? ('name' in happening ? happening.name : 'that place');
}

/** Why a way failed, in its error's words, without the full stop the words that tell it add. */
const whyOf = (error: unknown): string => (error instanceof Error ? error.message : String(error)).replace(/\.$/, '');

/** Runs `work`, the trip. Should it fail, the player goes back where they stood, and should that fail too (or there
 *  be no way back), to the hub; `say` is given the words that tell why before each. Resolves with null when the trip
 *  went, else with where the player was taken and why; fails with the trip's own error only when the hub fails too. */
export async function tripOrBack(
  work: () => Promise<void>,
  fallback: Fallback,
  say: (words: string) => void,
): Promise<Instead | null> {
  let failed: unknown;
  try {
    await work();
    return null;
  } catch (error) {
    failed = error;
  }
  let told = `You could not reach ${fallback.place}: ${whyOf(failed)}.`;
  if (fallback.back) {
    say(told);
    try {
      await fallback.back.go();
      return { flow: fallback.back.flow, told };
    } catch (error) {
      told += ` You could not go back either: ${whyOf(error)}.`;
    }
  }
  told += ` You are taken to ${fallback.hub.name}.`;
  say(told);
  try {
    await fallback.hub.go();
  } catch {
    throw failed;
  }
  return { flow: fallback.hub.flow, told };
}

/** Runs `work` on another land, `lands.open` opening it: should the work fail, the land the player left is put back,
 *  so a retry starts where the trip did. */
export async function onOtherLand<Land>(
  lands: { readonly now: () => Land; readonly open: () => Promise<void>; readonly put: (land: Land) => void },
  work: () => Promise<void>,
): Promise<void> {
  const left = lands.now();
  await lands.open();
  try {
    await work();
  } catch (error) {
    if (lands.now() !== left) lands.put(left);
    throw error;
  }
}
