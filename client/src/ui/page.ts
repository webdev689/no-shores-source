// The page's own services that a screen drawn by the game asks for and cannot draw: opening a link in a new tab, the
// page's address, loaded again or left for another, its touches held, its clipboard, a file saved or opened from the
// player's chooser, a yes or no asked in the browser's dialog, and words said when nothing can be drawn. Each borrows
// the page for a moment and builds no interface. Only here, canvasEvents.ts, pictures.ts and announce.ts touch the
// page, so the interface itself runs anywhere.

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

/** Tells the player plainly why the game could not start: the one time words are written into the page, as nothing
 *  can be drawn. */
export function stopped(message: string): void {
  document.body.textContent = message;
  document.body.style.cssText = 'color:#ddd;background:#000;font-size:22px;padding:24px';
}

/** Hands the player `text` as a file named `name` to save. */
export function saveFile(text: string, name: string, type = 'application/json'): void {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([text], { type }));
  link.download = name;
  link.click();
  URL.revokeObjectURL(link.href);
}

/** Opens the browser's file chooser for files of `accept` (as an input's `accept` writes it); answers the chosen
 *  file's text, or null when none was chosen. */
export function openFile(accept: string): Promise<string | null> {
  const chooser = document.createElement('input');
  chooser.type = 'file';
  chooser.accept = accept;
  return new Promise((resolve) => {
    chooser.addEventListener('change', () => {
      const file = chooser.files?.[0];
      resolve(file ? file.text() : null);
    });
    chooser.addEventListener('cancel', () => resolve(null));
    chooser.click();
  });
}

/** Asks the player `question` in the browser's dialog: whether they said yes. */
export function ask(question: string): boolean {
  return window.confirm(question);
}
