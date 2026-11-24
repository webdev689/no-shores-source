// The page's own services that a screen drawn by the game asks for and cannot draw: opening a link in a new tab, the
// page's address, loaded again or left for another, its window closed, its touches held, its clipboard, a file saved
// or opened from the player's chooser (through a link or a file input borrowed for a moment and never shown), a yes or
// no asked in the browser's dialog, a sign-in kept in the browser's own password store, and the words written into the
// page when nothing can be drawn. None builds interface. Only here, canvasEvents.ts, pictures.ts, announce.ts, main.ts
// and the page's side of the game's worker (thread/pageHost.ts, thread/audioHost.ts) touch the page, so the interface
// itself runs anywhere.

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
  /** Closes the page's window where the browser lets a page close its own (the desktop app's, or a window a script
   *  opened); elsewhere nothing happens. */
  readonly close: () => void;
}

/** The browser's page. */
export const PAGE: Page = {
  open: (url) => void window.open(url, '_blank', 'noopener'),
  reload: () => location.reload(),
  assign: (url) => location.assign(url),
  address: () => location.href,
  close: () => window.close(),
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

/** How long a file handed over to save stays where the browser can read it, milliseconds. */
const SAVE_KEPT_MS = 60_000;

/** Hands the player `text` as a file named `name` to save. */
export function saveFile(text: string, name: string, type = 'application/json'): void {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([text], { type }));
  link.download = name;
  link.click();
  // Let go once the browser has surely begun the download: some take the link after the click has returned.
  setTimeout(() => URL.revokeObjectURL(link.href), SAVE_KEPT_MS);
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

/** A sign-in the browser keeps: its username and password. */
export interface KeptSignIn {
  readonly id: string;
  readonly password: string;
}

/** The browser's own password store (Chromium's credential manager): a
 *  sign-in that worked is offered to be kept, and a kept one fills the drawn fields. Where the browser has no such
 *  store, nothing is kept or offered. */
export interface SignIns {
  /** Offers `signIn` to the browser to keep; done once the browser has taken it or turned it down. */
  keep(signIn: KeptSignIn): Promise<void>;
  /** The sign-in the browser keeps for the game, the player choosing among several; null with none. */
  kept(): Promise<KeptSignIn | null>;
}

type PasswordMade = new (data: { readonly id: string; readonly password: string }) => Credential;
type PasswordFound = Credential & { readonly password?: string };

/** The browser's store, where this page has it. */
export const BROWSERS_SIGN_INS: SignIns = {
  async keep({ id, password }) {
    const Made = (globalThis as { PasswordCredential?: PasswordMade }).PasswordCredential;
    const store = globalThis.navigator?.credentials;
    if (!Made || !store) return;
    await store.store(new Made({ id, password })).catch(() => undefined);
  },
  async kept() {
    const store = globalThis.navigator?.credentials;
    if (!(globalThis as { PasswordCredential?: PasswordMade }).PasswordCredential || !store) return null;
    const asked = { password: true, mediation: 'optional' } as CredentialRequestOptions;
    const found = (await store.get(asked).catch(() => null)) as PasswordFound | null;
    return found?.type === 'password' && found.password ? { id: found.id, password: found.password } : null;
  },
};

/** How sign-ins are kept: the browser's own here, or the page's, asked from the game's worker (`useSignIns`). */
let signIns: SignIns = BROWSERS_SIGN_INS;

/** Puts in place how sign-ins are kept, for the game's worker, which has no password store of its own. */
export function useSignIns(through: SignIns): void {
  signIns = through;
}

/** The sign-ins the browser keeps, wherever the game runs. */
export const SIGN_INS: SignIns = { keep: (signIn) => signIns.keep(signIn), kept: () => signIns.kept() };
