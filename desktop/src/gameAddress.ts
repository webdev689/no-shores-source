// The address the app plays the game at: the game as noshores.online serves it, the same build a browser plays, so
// the app is never a version behind the rooms, and online, on the live rooms and accounts. `NOSHORES_GAME_URL` points
// it at another, a dev server or a local build, to try a change in the app; a packaged copy takes only this machine's
// own addresses there, so nothing can point an installed copy at another site.

/** The game as noshores.online serves it, joining the live rooms and accounts (`?room=` names them). */
export const LIVE_GAME = 'https://noshores.online/play/?room=live';
/** The variable that points the app at another game. */
export const GAME_URL_VARIABLE = 'NOSHORES_GAME_URL';

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

/** Whether `url` names this machine. */
export function isLoopback(url: URL): boolean {
  return LOOPBACK.has(url.hostname);
}

/** The game's address: `asked` where it may be used, else the live game. */
export function gameAddress(asked: string | undefined, packaged: boolean): string {
  if (!asked) return LIVE_GAME;
  let url: URL;
  try {
    url = new URL(asked);
  } catch {
    return LIVE_GAME;
  }
  const web = url.protocol === 'https:' || url.protocol === 'http:';
  if (!web || (packaged && !isLoopback(url))) return LIVE_GAME;
  return url.href;
}
