// The page's own services that a screen drawn by the game asks for and cannot draw: opening a link in a new tab, the
// page's address, loaded again or left for another, its touches held and its clipboard. Only here, canvasEvents.ts, pictures.ts and
// announce.ts touch the page, so the interface itself runs anywhere.

/** What a screen asks of the page. */
export interface Page {
  /** Opens `url` in a new tab, the game's page kept apart from it. */
  readonly open: (url: string) => void;
  /** Loads the page again. */
  readonly reload: () => void;
  /** Leaves the page for `url`. */
  readonly assign: (url: string) => void;
  /** The page's own address. */
  readonly address: () => string;
}

/** The browser's page. */
export const PAGE: Page = {
  open: (url) => void window.open(url, '_blank', 'noopener'),
  reload: () => location.reload(),
  assign: (url) => location.assign(url),
  address: () => location.href,
};

/** Holds every touch on `surface` for the game while `held`: no drag pans the page or pulls it to reload, so a touch
 *  held is never cut short. Let go, the surface takes the page's touches again. */
export function touchesHeld(surface: { readonly style: { touchAction: string } }, held: boolean): void {
  surface.style.touchAction = held ? 'none' : '';
}

/** Puts `words` on the clipboard where the page lets it; where it does not, nothing happens. */
export function copyText(words: string): void {
  globalThis.navigator?.clipboard?.writeText(words).catch(() => undefined);
}
