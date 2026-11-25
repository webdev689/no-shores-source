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
import { gamePlace, isGamePage, opensInBrowser, permits, staysInWindow } from './fences.ts';
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
import { cutForRelease, startUpdater } from './updater.ts';
import { transportOf } from './updates.ts';

// The data folder keeps the name it was first made with, whatever the app is called later, so a new name never strands
// a player's settings; `NOSHORES_USER_DATA` moves it, for a run that tests the app.
app.setPath('userData', process.env['NOSHORES_USER_DATA'] ?? path.join(app.getPath('appData'), 'No Shores'));
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
const desk = { platform: process.platform, wayland: process.platform === 'linux' && isWayland(process.env) };
const launchOf = () =>
  launchFor({
    desk,
    chosen: config.get().graphics,
    failures: config.get().failures,
    chromium,
    argv: process.argv,
    variable: process.env[BACKEND_VARIABLE],
  });
const launch = launchOf();
for (const [name, value] of switchesFor(launch.backend)) app.commandLine.appendSwitch(name, value);

const address = gameAddress(process.env[GAME_URL_VARIABLE], app.isPackaged);
const game = gamePlace(address);
const meta = (() => {
  try {
    return JSON.parse(readFileSync(path.join(app.getAppPath(), 'package.json'), 'utf8')) as {
      noShores?: { signed?: boolean | string };
    };
  } catch {
    return {};
  }
})();
const resources = process.resourcesPath;
const packageType = (() => {
  try {
    return readFileSync(path.join(resources, 'package-type'), 'utf8').trim();
  } catch {
    return '';
  }
})();
const transport = transportOf({
  packaged: app.isPackaged,
  platform: process.platform,
  configured: cutForRelease(resources, existsSync),
  appImage: Boolean(process.env['APPIMAGE']),
  deb: packageType === 'deb',
  // The release writes it from the command line, which may leave it a word.
  signed: meta.noShores?.signed === true || meta.noShores?.signed === 'true',
});

let window: BrowserWindow | null = null;
const restartArgs = () => process.argv.slice(1).filter((arg) => !arg.startsWith(BACKEND_ARGUMENT));
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
    app.relaunch({ args: [...restartArgs(), ...args] });
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
    next: launchOf(),
    report: watch.reported(),
    update: updater.update(),
  });
const tell = () => {
  if (window && !window.isDestroyed()) window.webContents.send(CHANNELS.changed, info());
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
    case 'gpu':
      void watch.report(ask.report).then(tell);
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
      app.relaunch({ args: restartArgs() });
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
    const fence = (event: { preventDefault: () => void }, url: string) => {
      if (staysInWindow(url, game)) return;
      event.preventDefault();
      if (opensInBrowser(url)) void shell.openExternal(url);
    };
    contents.on('will-navigate', fence);
    contents.on('will-redirect', fence);
    contents.on('will-attach-webview', (event) => event.preventDefault());
  });
  app.on('child-process-gone', (_event, details) => {
    if (details.type !== 'GPU') return;
    log(goneLine('gpu', details, Date.now(), watch.reported()?.description ?? ''));
    void watch.gpuGone(details.reason);
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
    config.set({ failures: reviewFailures(config.get().failures, await gpuKey(), chromium) });
    log(`launch: ${launch.backend} (chosen ${launch.chosen}), ${address}, updates by ${transport}`);
    window = openGameWindow({
      address,
      origin: game.origin,
      kept: config.get().window,
      keep: (place) => void config.set({ window: place }),
      loaded: () => watch.pageLoaded(),
      gone: (reason, exitCode) =>
        log(goneLine('renderer', { reason, exitCode }, Date.now(), watch.reported()?.description ?? '')),
      quit: () => app.quit(),
    });
    window.webContents.on('did-finish-load', tell);
  });
}
