// What the character screen keeps in the browser: the tab's mark that the page left the game for the screen (Switch
// character, a test run left), read once as the page loads again; the test room a Launch goes into once the player
// stands on foot; and, as a character is chosen, this browser's own state set from its slot (its look, whether it has
// played the prologue, where it logs back in), so the story and the arrival after the title are that character's.
import type { AccountLink, Kept } from '../../network/accounts.ts';
import type { Slot } from '../../network/characters.ts';
import { PROLOGUE_KEY, keepProloguePlayed } from '../prologue/beat.ts';
import { type Look, forgetLook, keepLook, keptLook } from '../prologue/look.ts';

/** Which screen the page opens at once as it loads again: the characters, or the Test Room among them. */
export type ScreenMarked = 'characters' | 'test';

const SCREEN_KEY = 'noshores.characters.open';
const TEST_RUN_KEY = 'noshores.characters.testRun';

/** Marks the tab so the page, loaded again, opens `screen` at once, past the title's intro. */
export function markCharacters(tab: Kept, screen: ScreenMarked): void {
  try {
    // In a test run the tab is marked for the Test Room, and switching character from it goes back there too.
    if (screen === 'characters' && tab.getItem(SCREEN_KEY) === 'test') return;
    tab.setItem(SCREEN_KEY, screen);
  } catch {
    // A tab that keeps nothing opens on the title, a press away from the screen.
  }
}

/** The screen the tab was marked for, read once and cleared, whatever it says. */
export function characterMarked(tab: Kept): ScreenMarked | null {
  try {
    const marked = tab.getItem(SCREEN_KEY);
    tab.removeItem(SCREEN_KEY);
    return marked === 'characters' || marked === 'test' ? marked : null;
  } catch {
    return null;
  }
}

/** Keeps the test room a Launch asked for, for the arrival after the title to go into. */
export function keepTestRun(tab: Kept, room: string): void {
  try {
    tab.setItem(TEST_RUN_KEY, room);
  } catch {
    // Kept nowhere, the Launch arrives where the character last was.
  }
}

/** The test room asked for, read once and cleared. */
export function takeTestRun(tab: Kept): string | null {
  try {
    const room = tab.getItem(TEST_RUN_KEY);
    tab.removeItem(TEST_RUN_KEY);
    return room;
  } catch {
    return null;
  }
}

/** A look as the accounts keep it, read as the browser reads its own: a broken or stale one is none. */
export const lookOf = (kept: unknown): Look | null =>
  kept === null || kept === undefined ? null : keptLook({ getItem: () => JSON.stringify(kept) });

/** Whether the account's character in play has played the prologue, its slot then set in this browser as Play sets
 *  it; false where the accounts do not say. */
export async function inPlayPlayed(browser: Kept, link: Pick<AccountLink, 'characters' | 'place'>): Promise<boolean> {
  const four = await link.characters().catch(() => null);
  const slot = four && typeof four === 'object' ? (four.slots[four.playing] ?? null) : null;
  if (!slot?.prologue) return false;
  takeSlot(browser, slot, link);
  return true;
}

/**
 * Sets this browser's state from the slot chosen (null: a new character): its look, or none so the helm starts
 * afresh; whether it has played the prologue; and where it logs back in, for the arrival after the title. A character
 * in the first slot with no look on the accounts while this browser keeps one (one made before an account had four)
 * has the browser's look sent once; answers that look, to send.
 */
export function takeSlot(browser: Kept, slot: Slot | null, link: Pick<AccountLink, 'place'>): Look | null {
  link.place = slot?.place ?? null;
  try {
    if (slot?.prologue) keepProloguePlayed(browser);
    else browser.removeItem(PROLOGUE_KEY);
  } catch {
    // A browser that keeps nothing plays the story from its start.
  }
  const kept = lookOf(slot?.look);
  if (kept) keepLook(browser, kept);
  const own = slot && !kept && slot.slot === 0 ? keptLook(browser) : null;
  if (!kept && !own) forgetLook(browser);
  return own;
}
