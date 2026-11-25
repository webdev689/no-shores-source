// The app's own updates, through electron-updater, on the transport `updates.ts` chose. It is loaded only by a copy
// that has one, looks a little after the start and every hour after, and tells each change as the game sees it. A
// download that hears nothing for two minutes is given up, as electron-updater's own wait does not run under
// Electron's network, so the next check starts afresh. Installing is asked once at most: a second ask made
// electron-updater install twice in DFO, over the copy the first had just put in place.
import { app, shell } from 'electron';
import type { DesktopUpdate } from '../../client/src/desktop.ts';
import {
  CHECK_EVERY_MS,
  DOWNLOAD_STALL_MS,
  FIRST_CHECK_MS,
  type Transport,
  type UpdateEvent,
  updateAfter,
} from './updates.ts';

/** Where a player downloads the app by hand: the newest of their platform's, by the name that never moves. */
export const DOWNLOAD_BASE = 'https://noshores.online/download/';

/** The download a copy that cannot install itself sends its player to. */
export function downloadFor(platform: NodeJS.Platform, arch: string): string {
  if (platform === 'darwin') return `${DOWNLOAD_BASE}mac-${arch === 'arm64' ? 'arm64' : 'x64'}`;
  if (platform === 'win32') return `${DOWNLOAD_BASE}windows`;
  return `${DOWNLOAD_BASE}linux-appimage`;
}

export interface Updater {
  readonly update: () => DesktopUpdate;
  /** Installs a downloaded update now, closing the app and opening it again on the new one. */
  readonly install: () => boolean;
  /** Opens the download of an update this copy cannot install itself. */
  readonly download: () => void;
}

export function startUpdater(
  transport: Transport,
  enabled: boolean,
  told: (update: DesktopUpdate) => void,
  log: (line: string) => void,
): Updater {
  let update: DesktopUpdate = { state: 'none' };
  let installing = false;
  const quiet: Updater = { update: () => update, install: () => false, download: () => undefined };
  if (transport === 'none' || !enabled) return quiet;
  const heard = (event: UpdateEvent) => {
    const next = updateAfter(update, event, transport);
    if (JSON.stringify(next) === JSON.stringify(update)) return;
    update = next;
    told(update);
  };
  let stall: NodeJS.Timeout | null = null;
  const watchStall = (cancel: () => void) => {
    if (stall) clearTimeout(stall);
    stall = setTimeout(() => {
      cancel();
      heard({ kind: 'failed' });
    }, DOWNLOAD_STALL_MS);
    stall.unref();
  };
  const stopStall = () => {
    if (stall) clearTimeout(stall);
    stall = null;
  };
  let installer: { quitAndInstall: (silent: boolean, runAfter: boolean) => void } | null = null;
  void import('electron-updater').then(({ default: updaterModule }) => {
    const updater = updaterModule.autoUpdater;
    installer = updater;
    updater.autoDownload = transport === 'updater';
    updater.autoInstallOnAppQuit = transport === 'updater';
    updater.allowPrerelease = false;
    updater.allowDowngrade = false;
    updater.logger = null;
    let cancel = () => undefined as void;
    updater.on('update-available', (info) => {
      heard({ kind: 'available', version: info.version });
      if (transport === 'updater') watchStall(cancel);
    });
    updater.on('download-progress', (progress) => {
      watchStall(cancel);
      heard({ kind: 'progress', percent: progress.percent });
    });
    updater.on('update-downloaded', (info) => {
      stopStall();
      heard({ kind: 'downloaded', version: info.version });
      log(`update: ${info.version} downloaded, to install as the app closes`);
    });
    updater.on('update-not-available', () => heard({ kind: 'none' }));
    updater.on('error', (error) => {
      stopStall();
      heard({ kind: 'failed' });
      // electron-updater's errors carry every header of the answer: the first line says what failed.
      log(`update: ${(error instanceof Error ? error.message : String(error)).split('\n')[0]}`);
    });
    const check = () =>
      void updater
        .checkForUpdates()
        .then((result) => {
          const token = result?.cancellationToken;
          if (token) cancel = () => token.cancel();
        })
        .catch(() => heard({ kind: 'failed' }));
    setTimeout(check, FIRST_CHECK_MS).unref();
    setInterval(check, CHECK_EVERY_MS).unref();
  });
  return {
    update: () => update,
    install() {
      if (installing || update.state !== 'ready' || !installer) return false;
      installing = true;
      installer.quitAndInstall(true, true);
      return true;
    },
    download() {
      if (update.state === 'manual') void shell.openExternal(downloadFor(process.platform, process.arch));
    },
  };
}

/** Whether this copy carries the release's `app-update.yml`, cut for a release rather than to try. */
export function cutForRelease(resources: string, exists: (file: string) => boolean): boolean {
  return app.isPackaged && exists(`${resources}/app-update.yml`);
}
