// What a browser kept for the game under the name it had before No Shores, moved once to the game's own before
// anything reads it: each page's entry imports this first (main.ts, editorPage.ts, testground/testgroundMain.ts).
// The pages' origin, lattymoy.github.io, is shared with other projects, so only the game's own keys move.

const FORMER = 'overlook';
const OWN = 'noshores';

/** Whether a key was the game's under its former name. */
const former = (key: string): boolean => key.startsWith(`${FORMER}.`);

/** Moves a storage's keys kept under the former name to the game's own, over any already there: a former key outlives
 *  a move only where one could not be made, and an account's sign-in kept there is worth more than a guest's made
 *  since. Each is let go before it is set again, so a large one needs no room for two; one that will not fit is put
 *  back, to move on a later load, and the rest still move. */
export function moveKept(storage: Storage): void {
  const keys = Array.from({ length: storage.length }, (unused, index) => storage.key(index)).filter(
    (key): key is string => key !== null && former(key),
  );
  for (const key of keys) {
    const value = storage.getItem(key);
    if (value === null) continue;
    storage.removeItem(key);
    try {
      storage.setItem(OWN + key.slice(FORMER.length), value);
    } catch {
      storage.setItem(key, value);
    }
  }
}

for (const area of ['localStorage', 'sessionStorage'] as const) {
  try {
    const storage = globalThis[area] as Storage | undefined;
    if (storage) moveKept(storage);
  } catch {
    // A page whose storage is refused (a private window, blocked site data) has nothing kept to move.
  }
}
