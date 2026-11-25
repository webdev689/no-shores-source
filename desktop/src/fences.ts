// Where the game's window may go, what it may open and what it may use. The window carries the shell's bridge, so it
// stays on the game's own pages, and on the two others a sign-in with Discord passes through on its way out and back
// as it does in a browser's tab: the accounts' Discord doors and Discord itself. Every other address a link or the
// page names opens in the player's own browser, and only web addresses do.

/** The accounts the game signs in with (`LIVE_ACCOUNTS` in the client, held equal by test). */
export const ACCOUNTS_ORIGIN = 'https://overlook-accounts.mackcothran.workers.dev';
/** The accounts' doors a Discord sign-in passes through, start and callback. */
const DISCORD_DOORS = '/v1/discord/';
/** Discord's own sign-in and its asking for the player's leave. */
const DISCORD_ORIGIN = 'https://discord.com';

/** The game's pages: its origin, and the path every page of the game is under. */
export interface GamePlace {
  readonly origin: string;
  readonly path: string;
}

/** The game at `address`, whose pages are those under its path. */
export function gamePlace(address: string): GamePlace {
  const url = new URL(address);
  return { origin: url.origin, path: url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/` };
}

const parsed = (address: string): URL | null => {
  try {
    return new URL(address);
  } catch {
    return null;
  }
};

/** Whether `address` is one of the game's own pages. */
export function isGamePage(address: string, game: GamePlace): boolean {
  const url = parsed(address);
  return url !== null && url.origin === game.origin && `${url.pathname}/`.startsWith(game.path);
}

/** Whether the game's window may go to `address` itself: its own pages, and a Discord sign-in's way. */
export function staysInWindow(address: string, game: GamePlace): boolean {
  const url = parsed(address);
  if (url === null) return false;
  if (isGamePage(address, game)) return true;
  if (url.origin === ACCOUNTS_ORIGIN) return url.pathname.startsWith(DISCORD_DOORS);
  return url.origin === DISCORD_ORIGIN;
}

/** Whether `address` may be handed to the player's browser: a web address, never a file, a script or an app's. */
export function opensInBrowser(address: string): boolean {
  const url = parsed(address);
  const plain = url !== null && url.username === '' && url.password === '';
  return plain && (url.protocol === 'https:' || url.protocol === 'http:');
}

/** Where a navigation of the game's window goes: on, to the player's browser, or nowhere. Only its top page is fenced;
 *  a frame inside a page it may show (a sign-in's check that it is a person) goes where its page sends it. */
export function fenceOf(address: string, mainFrame: boolean, game: GamePlace): 'stay' | 'browser' | 'refuse' {
  if (!mainFrame || staysInWindow(address, game)) return 'stay';
  return opensInBrowser(address) ? 'browser' : 'refuse';
}

/** What the game's pages may use: the pointer held for looking about, the whole screen, the keys the system would
 *  take (Escape among them) while the screen is whole, and the clipboard to copy into. Nothing else is granted, and
 *  nothing to any other page. */
export const GAME_PERMISSIONS: ReadonlySet<string> = new Set([
  'pointerLock',
  'fullscreen',
  'keyboardLock',
  'clipboard-sanitized-write',
]);

/** Whether a page at `origin` (as Chromium names it, with or without a path) may use `permission`. */
export function permits(permission: string, origin: string, game: GamePlace): boolean {
  const url = parsed(origin);
  return url !== null && url.origin === game.origin && GAME_PERMISSIONS.has(permission);
}
