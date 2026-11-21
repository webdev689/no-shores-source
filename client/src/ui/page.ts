// The page's own services the game's drawn interface cannot give itself. This file, with canvasEvents.ts, pictures.ts
// and announce.ts, is all of the interface that touches the page.

/** Puts `words` on the clipboard where the page lets it; where it does not, nothing happens. */
export function copyText(words: string): void {
  globalThis.navigator?.clipboard?.writeText(words).catch(() => undefined);
}
