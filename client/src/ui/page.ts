// The page's own services that a screen drawn by the game asks for and cannot draw: opening a link in a new tab, and
// the page's address, loaded again or left for another. Only here, canvasEvents.ts, pictures.ts and announce.ts touch
// the page, so the interface itself runs anywhere.

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
