// The desktop app: the game noshores.online serves, in a window of its own, with what a browser cannot give it. This
// file wires the shell's parts together: the data folder, one copy at a time, the launch's graphics and Chromium's
// switches before the app is ready, the fences, the window, the watch over the graphics, the updater and the bridge.
import { type BrowserWindow, type IpcMainEvent, app, ipcMain, session, shell } from 'electron';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { type DesktopAsk, RELOCK_HOOK } from '../../client/src/desktop.ts';
import { CHANNELS, askOf, infoOf } from './bridge.ts';
import { Config } from './config.ts';
import { goneLine, logWith } from './crashes.ts';
import { fenceOf, gamePlace, isGamePage, opensInBrowser, permits } from './fences.ts';
import { GAME_URL_VARIABLE, gameAddress } from './gameAddress.ts';
import { boxOver, openGameWindow } from './gameWindow.ts';
import {
  BACKEND_ARGUMENT,
  BACKEND_VARIABLE,
  backendsOf,
  gpuKeyOf,
  isWayland,
  launchFor,
  reviewFailures,
} from './graphics.ts';
import { watchGraphics } from './graphicsWatch.ts';
import { setMenu } from './menu.ts';
import { switchesFor } from './switches.ts';
import { startUpdater } from './updater.ts';
import { followsFeed, transportOf } from './updates.ts';

// The data folder keeps the name it was first made with, whatever the app is called later, so a new name never strands
// a player's settings; `NOSHORES_USER_DATA` moves it, for a run that tests the app. A copy run from the source keeps
// its own, so a dev page's graphics failures never hold the player's installed copy back.
const DATA_NAME = app.isPackaged ? 'No Shores' : 'No Shores (dev)';
app.setPath('userData', process.env['NOSHORES_USER_DATA'] ?? path.join(app.getPath('appData'), DATA_NAME));
const DATA = app.getPath('userData');
const LOG = path.join(DATA, 'app.log');
const log = (line: string) => {
  console.warn(`[no shores] ${line}`);
  try {
    const had = existsSync(LOG) ? readFileSync(LOG, 'utf8') : '';
    writeFileSync(LOG, logWith(had, line.endsWith('\n') ? line : `${new Date().toISOString()} ${line}\n`));
  } catch {
    // A log that cannot be written is no reason to stop.
  }
};

const config = new Config(DATA);
const chromium = process.versions.chrome ?? 'unknown';
const desk = {
  platform: process.platform,
  wayland: process.platform === 'linux' && isWayland(process.env, process.argv),
};
/** The launch `argv` would bring: this one's, or the next's, which a restart starts without the backend's argument. */
const launchOf = (argv: readonly string[]) =>
  launchFor({
    desk,
    chosen: config.get().graphics,
    failures: config.get().failures,
    chromium,
    argv,
    variable: process.env[BACKEND_VARIABLE],
  });
const launch = launchOf(process.argv);
if (launch.afresh) config.set({ failures: [] });
for (const [name, value] of switchesFor(launch.backend)) app.commandLine.appendSwitch(name, value);

const address = gameAddress(process.env[GAME_URL_VARIABLE], app.isPackaged);
const game = gamePlace(address);
/** A file of the app's own, or null where it has none. */
const ownFile = (file: string): string | null => {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return null;
  }
};
const ownPackage = JSON.parse(ownFile(path.join(app.getAppPath(), 'package.json')) ?? '{}') as {
  noShores?: { signed?: boolean | string };
};
const transport = transportOf({
  packaged: app.isPackaged,
  platform: process.platform,
  configured: followsFeed(ownFile(path.join(process.resourcesPath, 'app-update.yml'))),
  appImage: Boolean(process.env['APPIMAGE']),
  deb: ownFile(path.join(process.resourcesPath, 'package-type'))?.trim() === 'deb',
  // The release writes it from the command line, which may leave it a word.
  signed: ownPackage.noShores?.signed === true || ownPackage.noShores?.signed === 'true',
});

let window: BrowserWindow | null = null;
const restartArgs = () => process.argv.slice(1).filter((arg) => !arg.startsWith(BACKEND_ARGUMENT));
/** Starts the app again once this one has gone: from its AppImage where it runs from one, as the folder it runs in
 *  is the AppImage's, and goes with it. */
const relaunch = (args: readonly string[]) =>
  app.relaunch({ args: [...restartArgs(), ...args], execPath: process.env['APPIMAGE'] ?? process.execPath });
const gpuKey = async () => {
  const deadline = new Promise<null>((resolve) => setTimeout(() => resolve(null), 10_000).unref());
  const info = (await Promise.race([app.getGPUInfo('basic').catch(() => null), deadline])) as { gpuDevice?: [] } | null;
  return gpuKeyOf(info?.gpuDevice ?? []);
};
const watch = watchGraphics(launch, desk, chromium, {
  failures: () => config.get().failures,
  keepFailures: (failures) => config.set({ failures }),
  seen: () => config.get().seen,
  keepSeen: (seen) => void config.set({ seen }),
  gpuKey,
  tell: (box) => boxOver(window, box),
  ask: (box, stop) => boxOver(window, box, stop),
  restart: (args) => {
    relaunch(args);
    app.releaseSingleInstanceLock();
    app.exit(0);
  },
  later: (work, milliseconds) => {
    const timer = setTimeout(work, milliseconds);
    return () => clearTimeout(timer);
  },
  now: Date.now,
  log,
});

const info = () =>
  infoOf({
    version: app.isPackaged ? app.getVersion() : 'dev',
    desk,
    chosen: config.get().graphics,
    launch,
    next: launchOf([]),
    report: watch.reported(),
    update: updater.update(),
  });
/** Tells the game what changed: its own pages alone, never one the window passes through to sign in. */
const tell = () => {
  if (window && !window.isDestroyed() && isGamePage(window.webContents.getURL(), game))
    window.webContents.send(CHANNELS.changed, info());
};
const updater = startUpdater(transport, config.get().updateChecks, tell, log);

/** Only the game's own window, from its top page on the game's own pages, is heard. */
const fromGame = (event: IpcMainEvent) =>
  window !== null &&
  event.sender === window.webContents &&
  event.senderFrame !== null &&
  event.senderFrame === event.sender.mainFrame &&
  isGamePage(event.senderFrame.url, game);

function answer(ask: DesktopAsk): void {
  switch (ask.ask) {
    case 'gpuAsked':
      watch.gpuAsked();
      return;
    case 'gpu':
      void watch.report(ask.report).then(tell);
      return;
    case 'gpuLost':
      log(`graphics: WebGPU lost the device: ${ask.reason}`);
      void watch.gpuGone(`WebGPU lost the device: ${ask.reason}`);
      return;
    case 'drawn':
      void watch.drawn();
      return;
    case 'graphics': {
      // Chosen again, an API that failed is tried again: the player may have mended its driver.
      const again = backendsOf(ask.api, desk);
      const failures = config.get().failures.filter((failure) => !again.includes(failure.backend));
      config.set({ graphics: ask.api, failures });
      tell();
      return;
    }
    case 'restart':
      if (updater.install()) return;
      relaunch([]);
      app.quit();
      return;
    case 'download':
      updater.download();
      return;
    case 'relock':
      // Run as a press, which the page's own hook needs; the hook takes the lock only if the game still wants it.
      void window?.webContents.executeJavaScript(`globalThis.${RELOCK_HOOK}?.()`, true).catch(() => undefined);
      return;
  }
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {
    if (!window || window.isDestroyed()) return;
    if (window.isMinimized()) window.restore();
    window.focus();
  });
  ipcMain.on(CHANNELS.info, (event) => {
    event.returnValue = fromGame(event) ? info() : null;
  });
  ipcMain.on(CHANNELS.ask, (event, raw: unknown) => {
    const ask = fromGame(event) ? askOf(raw) : null;
    if (ask) answer(ask);
  });
  app.on('web-contents-created', (_event, contents) => {
    contents.setWindowOpenHandler(({ url }) => {
      if (opensInBrowser(url)) void shell.openExternal(url);
      return { action: 'deny' };
    });
    const fence = (event: { readonly url: string; readonly isMainFrame: boolean; preventDefault: () => void }) => {
      const way = fenceOf(event.url, event.isMainFrame, game);
      if (way === 'stay') return;
      event.preventDefault();
      if (way === 'browser') void shell.openExternal(event.url);
    };
    contents.on('will-navigate', fence);
    contents.on('will-redirect', fence);
    contents.on('will-attach-webview', (event) => event.preventDefault());
  });
  app.on('child-process-gone', (_event, details) => {
    if (details.type !== 'GPU') return;
    log(goneLine('gpu', details, Date.now(), watch.reported()?.description ?? ''));
    void watch.gpuGone(`the GPU's process went: ${details.reason}`);
  });
  app.on('window-all-closed', () => app.quit());
  void app.whenReady().then(async () => {
    session.defaultSession.setPermissionRequestHandler((_contents, permission, grant, details) =>
      grant(permits(permission, details.requestingUrl, game)),
    );
    session.defaultSession.setPermissionCheckHandler((_contents, permission, origin) =>
      permits(permission, origin, game),
    );
    setMenu(process.platform);
    // Read after the card is known, so a failure the watch kept meanwhile is reviewed, not written over.
    const card = await gpuKey();
    config.set({ failures: reviewFailures(config.get().failures, card, chromium) });
    log(`launch: ${launch.backend} (chosen ${launch.chosen}), ${address}, updates by ${transport}`);
    window = openGameWindow({
      address,
      origin: game.origin,
      kept: config.get().window,
      keep: (place) => void config.set({ window: place }),
      gone: (reason, exitCode) =>
        log(goneLine('renderer', { reason, exitCode }, Date.now(), watch.reported()?.description ?? '')),
      quit: () => app.quit(),
    });
    window.webContents.on('did-finish-load', tell);
  });
}
