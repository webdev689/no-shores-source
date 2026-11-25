// How this copy of the app updates itself, and what the game is told of it. The game itself updates with the site,
// as it does in a browser, so an update here is the shell's alone and rare. A copy that can replace itself (the
// Windows installer's, an AppImage run as one, a Debian package, a Mac app signed by a developer) downloads in the
// background and installs as the app closes; one that cannot (a Mac app signed by nobody) is told and downloads by
// hand; one with nothing to follow (run from the source, or cut without a release) never asks.
import type { DesktopUpdate } from '../../client/src/desktop.ts';

export type Transport = 'updater' | 'notice' | 'none';

/** What decides the transport, read from the running copy. */
export interface CopyFacts {
  readonly packaged: boolean;
  readonly platform: NodeJS.Platform;
  /** The copy carries electron-updater's `app-update.yml`: it was cut for a release. */
  readonly configured: boolean;
  /** On Linux, the AppImage it runs as (`APPIMAGE`), and whether it was installed from the Debian package. */
  readonly appImage: boolean;
  readonly deb: boolean;
  /** On macOS, whether the release signed it with a developer's identity, without which it cannot replace itself. */
  readonly signed: boolean;
}

export function transportOf(copy: CopyFacts): Transport {
  if (!copy.packaged || !copy.configured) return 'none';
  if (copy.platform === 'win32') return 'updater';
  if (copy.platform === 'darwin') return copy.signed ? 'updater' : 'notice';
  if (copy.platform === 'linux') return copy.appImage || copy.deb ? 'updater' : 'notice';
  return 'none';
}

/** What electron-updater says, and the shell's own check on the notice transport. */
export type UpdateEvent =
  | { readonly kind: 'available'; readonly version: string }
  | { readonly kind: 'progress'; readonly percent: number }
  | { readonly kind: 'downloaded'; readonly version: string }
  | { readonly kind: 'none' }
  | { readonly kind: 'failed' };

/** The update as the game is told it, after `event`. A download that fails is forgotten, and the next check tries
 *  again; one that is ready stays ready, whatever a later check says, until the app closes and installs it. */
export function updateAfter(update: DesktopUpdate, event: UpdateEvent, transport: Transport): DesktopUpdate {
  if (update.state === 'ready') return update;
  switch (event.kind) {
    case 'available':
      return transport === 'notice'
        ? { state: 'manual', version: event.version }
        : { state: 'downloading', version: event.version, percent: 0 };
    case 'progress':
      return update.state === 'downloading'
        ? { ...update, percent: Math.max(0, Math.min(100, Math.round(event.percent))) }
        : update;
    case 'downloaded':
      return { state: 'ready', version: event.version };
    case 'none':
      return update.state === 'manual' ? update : { state: 'none' };
    case 'failed':
      return update.state === 'downloading' ? { state: 'none' } : update;
  }
}

/** What Restart does: installs a ready update, which electron-updater must be asked once only (a second ask installs
 *  twice, over the copy the first put in place); does nothing else while that install runs; or starts the app again. */
export function restartOf(update: DesktopUpdate, installing: boolean): 'install' | 'installing' | 'relaunch' {
  if (installing) return 'installing';
  return update.state === 'ready' ? 'install' : 'relaunch';
}

/** Whether a copy's `app-update.yml` names a feed to follow: a release's names its provider, and a trial pack writes
 *  the file without one. */
export const followsFeed = (updateFile: string | null): boolean =>
  updateFile !== null && /^provider:\s*\S/m.test(updateFile);

/** How long after the app starts it first looks, and how often after. */
export const FIRST_CHECK_MS = 15_000;
export const CHECK_EVERY_MS = 60 * 60_000;
/** A download that hears nothing this long is given up, so the next check may start one afresh. */
export const DOWNLOAD_STALL_MS = 120_000;
