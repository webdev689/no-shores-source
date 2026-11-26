// The game's window: opened where it was left, kept there, whole-screen on F11 or Alt+Enter as a browser's is, and the
// developer tools on F12 or Ctrl+Shift+I as in a browser, where a player hands over a report's lines. It loads the
// game's address and, when that does not answer, asks to try again in a box the system draws, as the window has
// nothing of its own to show. A page that stops is told and restarted at the player's word; one that stops answering
// is offered a wait or a restart. The launcher's window opens the same way, at its own fixed size.
import { BrowserWindow, type Input, dialog, screen } from 'electron';
import path from 'node:path';
import { ORIGIN_ARGUMENT } from './bridge.ts';
import type { WindowPlace } from './config.ts';
import {
  type Box,
  HANG_BOX,
  goneBox,
  restarts,
  restartsHung,
  stopCount,
  triesAgain,
  unreachableBox,
} from './crashes.ts';
import { LEAST_HEIGHT, LEAST_WIDTH, launcherPlace, openingPlace } from './windowPlace.ts';

/** How long a window's moves and resizes settle before its place is kept. */
const KEEP_AFTER_MS = 500;
/** Chromium's error for a load the page itself stopped, which is no failure to reach the game. */
const ABORTED = -3;

export interface GameWindowSetup {
  readonly address: string;
  readonly origin: string;
  readonly kept: WindowPlace | null;
  readonly keep: (place: WindowPlace) => void;
  /** The page's process went (`reason`, its exit code), for the log. */
  readonly gone: (reason: string, exitCode: number) => void;
  readonly quit: () => void;
  /** The launcher's window: its own fixed size, centred, never maximized or whole-screen, keeping no place. */
  readonly launcher?: boolean;
}

/** Shows `box` over `window`, shown first if it was not yet: a box over a window never shown is never seen on a Mac.
 *  Answers the button pressed. */
export async function boxOver(window: BrowserWindow | null, box: Box, signal?: AbortSignal): Promise<number> {
  if (window && !window.isDestroyed() && !window.isVisible()) window.show();
  const options = { ...box, buttons: [...box.buttons], noLink: true, signal };
  const { response } =
    window && !window.isDestroyed()
      ? await dialog.showMessageBox(window, options)
      : await dialog.showMessageBox(options);
  return response;
}

function placeOf(window: BrowserWindow): WindowPlace {
  const { x, y, width, height } = window.getNormalBounds();
  return { x, y, width, height, maximized: window.isMaximized(), fullScreen: window.isFullScreen() };
}

/** The keys the shell answers before the game hears them. */
function shellKey(window: BrowserWindow, input: Input): boolean {
  if (input.type !== 'keyDown' || input.isAutoRepeat) return false;
  const fullScreen = input.key === 'F11' || (input.key === 'Enter' && input.alt && process.platform !== 'darwin');
  if (fullScreen) {
    window.setFullScreen(!window.isFullScreen());
    return true;
  }
  const tools =
    input.key === 'F12' || (input.key.toLowerCase() === 'i' && input.shift && (input.control || input.meta));
  if (tools) {
    window.webContents.toggleDevTools();
    return true;
  }
  return false;
}

/** Opens the game's window and loads the game. */
export function openGameWindow(setup: GameWindowSetup): BrowserWindow {
  const screens = [screen.getPrimaryDisplay(), ...screen.getAllDisplays()].map((display) => display.workArea);
  const main = screens[0];
  const place = setup.launcher ? main && launcherPlace(main) : openingPlace(setup.kept, screens);
  const window = new BrowserWindow({
    ...(place ? { x: place.x, y: place.y, width: place.width, height: place.height } : { width: 1600, height: 900 }),
    ...(setup.launcher
      ? { resizable: false, maximizable: false, fullscreenable: false }
      : { minWidth: LEAST_WIDTH, minHeight: LEAST_HEIGHT }),
    title: 'No Shores',
    backgroundColor: '#000000',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(import.meta.dirname, 'preload.cjs'),
      additionalArguments: [`${ORIGIN_ARGUMENT}${setup.origin}`],
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: false,
      spellcheck: false,
      // A page that opens box after box (alert, confirm) is offered a way to stop them.
      safeDialogs: true,
    },
  });
  window.once('ready-to-show', () => {
    if (place?.maximized) window.maximize();
    if (place?.fullScreen) window.setFullScreen(true);
    window.show();
  });
  if (!setup.launcher) keepPlace(window, setup.keep);
  window.webContents.on('before-input-event', (event, input) => {
    if (shellKey(window, input)) event.preventDefault();
  });
  watchPage(window, setup);
  void window.loadURL(setup.address).catch(() => undefined);
  return window;
}

/** Keeps the game window's place as it moves and resizes, settled, and as it closes. */
function keepPlace(window: BrowserWindow, keep: (place: WindowPlace) => void): void {
  let keepLater: NodeJS.Timeout | null = null;
  const keepSoon = () => {
    if (keepLater) clearTimeout(keepLater);
    keepLater = setTimeout(() => !window.isDestroyed() && keep(placeOf(window)), KEEP_AFTER_MS);
  };
  for (const event of ['resize', 'move', 'maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen'] as const)
    window.on(event as 'resize', keepSoon);
  window.on('close', () => {
    if (keepLater) clearTimeout(keepLater);
    keep(placeOf(window));
  });
}

/** The page's own life: a load that failed, a process that went, a page that stopped answering. */
function watchPage(window: BrowserWindow, setup: GameWindowSetup): void {
  const contents = window.webContents;
  const stops = stopCount();
  let asking = false;
  let restarting = false;
  /** The box over a page that stopped answering, closed when it answers again or its process goes. */
  let hang: AbortController | null = null;
  contents.on('did-fail-load', (_event, code, description, address, mainFrame) => {
    if (!mainFrame || code === ABORTED || asking) return;
    asking = true;
    if (!window.isVisible()) window.show();
    // The host that failed: the game's, or a sign-in's on its way.
    const host = URL.parse(address)?.host ?? new URL(setup.address).host;
    void boxOver(window, unreachableBox(host, description || `error ${code}`)).then((answer) => {
      asking = false;
      if (window.isDestroyed()) return;
      if (triesAgain(answer)) void window.loadURL(address || setup.address).catch(() => undefined);
      else setup.quit();
    });
  });
  contents.on('render-process-gone', (_event, details) => {
    hang?.abort();
    if (details.reason === 'clean-exit') return;
    setup.gone(details.reason, details.exitCode);
    if (window.isDestroyed()) return;
    if (restarting) {
      restarting = false;
      contents.reload();
      return;
    }
    void boxOver(window, goneBox(details.reason, stops.stop(Date.now()))).then((answer) => {
      if (window.isDestroyed()) return;
      if (restarts(answer)) contents.reload();
      else setup.quit();
    });
  });
  contents.on('responsive', () => hang?.abort());
  contents.on('unresponsive', () => {
    if (hang || window.isDestroyed()) return;
    const stop = (hang = new AbortController());
    void boxOver(window, HANG_BOX, stop.signal).then((answer) => {
      hang = null;
      if (stop.signal.aborted || !restartsHung(answer) || window.isDestroyed() || contents.isCrashed()) return;
      restarting = true;
      contents.forcefullyCrashRenderer();
    });
  });
}
