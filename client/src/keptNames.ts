// What a browser kept for the game under the name it had before No Shores, moved once to the game's own before
// anything reads it: each page's entry imports this first (main.ts, editorPage.ts, testground/testgroundMain.ts).
// The pages' origin, lattymoy.github.io, is shared with other projects, so only the game's own keys move.

const FORMER = 'overlook';
const OWN = 'noshores';

/** Whether a key was the game's under its former name. */
const former = (key: string): boolean => key.startsWith(`${FORMER}.`) || key === `${FORMER}-discovery`;

/** Moves a storage's keys kept under the former name to the game's own; one already kept there stays as it is. */
export function moveKept(storage: Storage): void {
  const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter(
    (key): key is string => key !== null && former(key),
  );
  for (const key of keys) {
    const own = OWN + key.slice(FORMER.length);
    const value = storage.getItem(key);
    if (value !== null && storage.getItem(own) === null) storage.setItem(own, value);
    storage.removeItem(key);
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
