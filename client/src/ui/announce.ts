// What the game says to a screen reader, now that its words are drawn rather than written into the page.

/** Says `words` through the page's own announcement where the browser has one (`document.ariaNotify`, in Chromium);
 *  elsewhere nothing is said. */
export function announce(words: string): void {
  (globalThis.document as (Document & { ariaNotify?: (said: string) => void }) | undefined)?.ariaNotify?.(words);
}
