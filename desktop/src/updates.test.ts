import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { DesktopUpdate } from '../../client/src/desktop.ts';
import { type CopyFacts, followsFeed, looksFor, ownAppImage, restartOf, transportOf, updateAfter } from './updates.ts';

const installed: CopyFacts = {
  packaged: true,
  platform: 'win32',
  configured: true,
  appImage: false,
  deb: false,
  signed: false,
};

test('a copy run from the source, or cut without a release, never looks for updates', () => {
  assert.equal(transportOf({ ...installed, packaged: false }), 'none');
  assert.equal(transportOf({ ...installed, configured: false }), 'none');
});

test("the Windows installer's copy replaces itself", () => {
  assert.equal(transportOf(installed), 'updater');
});

test('a Mac app replaces itself only when a developer signed it', () => {
  assert.equal(transportOf({ ...installed, platform: 'darwin' }), 'notice');
  assert.equal(transportOf({ ...installed, platform: 'darwin', signed: true }), 'updater');
});

test('on Linux an AppImage run as one, or the Debian package, replaces itself, and anything else never asks', () => {
  assert.equal(transportOf({ ...installed, platform: 'linux', appImage: true }), 'updater');
  assert.equal(transportOf({ ...installed, platform: 'linux', deb: true }), 'updater');
  // electron-updater finds no feed for a folder unpacked by hand, so it has nothing to be told of.
  assert.equal(transportOf({ ...installed, platform: 'linux' }), 'none');
});

const none: DesktopUpdate = { state: 'none' };

test('an update found downloads where the copy installs itself, and is to download by hand where it cannot', () => {
  assert.deepEqual(updateAfter(none, { kind: 'available', version: '2026.1201.930' }, 'updater'), {
    state: 'downloading',
    version: '2026.1201.930',
    percent: 0,
  });
  assert.deepEqual(updateAfter(none, { kind: 'available', version: '2026.1201.930' }, 'notice'), {
    state: 'manual',
    version: '2026.1201.930',
  });
});

test("a download's progress is a whole share between none and all of it", () => {
  const downloading: DesktopUpdate = { state: 'downloading', version: 'v', percent: 0 };
  assert.deepEqual(updateAfter(downloading, { kind: 'progress', percent: 41.6 }, 'updater'), {
    ...downloading,
    percent: 42,
  });
  assert.deepEqual(updateAfter(downloading, { kind: 'progress', percent: 140 }, 'updater'), {
    ...downloading,
    percent: 100,
  });
  assert.deepEqual(updateAfter(none, { kind: 'progress', percent: 50 }, 'updater'), none);
});

test('a ready update stays ready whatever a later check says, until the app closes and installs it', () => {
  const ready = updateAfter(none, { kind: 'downloaded', version: 'v2' }, 'updater');
  assert.deepEqual(ready, { state: 'ready', version: 'v2' });
  assert.deepEqual(updateAfter(ready, { kind: 'none' }, 'updater'), ready);
  assert.deepEqual(updateAfter(ready, { kind: 'failed' }, 'updater'), ready);
  assert.deepEqual(updateAfter(ready, { kind: 'available', version: 'v3' }, 'updater'), ready);
});

test('a download that fails is forgotten, so the next check starts afresh; a notice outlasts a failed check', () => {
  const downloading: DesktopUpdate = { state: 'downloading', version: 'v', percent: 30 };
  assert.deepEqual(updateAfter(downloading, { kind: 'failed' }, 'updater'), none);
  const manual: DesktopUpdate = { state: 'manual', version: 'v' };
  assert.deepEqual(updateAfter(manual, { kind: 'failed' }, 'notice'), manual);
  assert.deepEqual(updateAfter(manual, { kind: 'none' }, 'notice'), manual);
});

test('Restart installs a ready update once; pressed while it installs, it does nothing; one that failed, it restarts', () => {
  const [ready, none]: DesktopUpdate[] = [{ state: 'ready', version: 'v2' }, { state: 'none' }];
  assert.equal(restartOf(ready, 'no'), 'install');
  assert.equal(restartOf(ready, 'running'), 'installing');
  assert.equal(restartOf(ready, 'failed'), 'relaunch', 'an install that left the app running does not hold Restart');
  assert.equal(restartOf(none, 'no'), 'relaunch');
  assert.equal(restartOf({ state: 'manual', version: 'v2' }, 'no'), 'relaunch');
});

test('no check runs while a download is under way or waits to install: a newer one would empty its folder', () => {
  assert.equal(looksFor({ state: 'none' }), true);
  assert.equal(looksFor({ state: 'manual', version: 'v2' }), true);
  assert.equal(looksFor({ state: 'downloading', version: 'v2', percent: 40 }), false);
  assert.equal(looksFor({ state: 'ready', version: 'v2' }), false);
});

test('a copy follows a feed only where its update file names a provider: a trial pack writes one without', () => {
  assert.equal(followsFeed('provider: generic\nurl: https://noshores.online/download/\n'), true);
  assert.equal(followsFeed('updaterCacheDirName: no-shores-desktop-updater\n'), false);
  assert.equal(followsFeed(null), false);
});

test('an AppImage is trusted only as the one this copy runs from, not one a parent passed down', () => {
  const mounted = { APPIMAGE: '/home/wren/No-Shores.AppImage', APPDIR: '/tmp/.mount_NoShoAbc' };
  assert.equal(ownAppImage(mounted, '/tmp/.mount_NoShoAbc/no-shores'), '/home/wren/No-Shores.AppImage');
  assert.equal(ownAppImage(mounted, '/opt/No Shores/no-shores'), null, 'the Debian package started from an AppImage');
  assert.equal(ownAppImage({ APPIMAGE: '/x.AppImage' }, '/tmp/.mount_x/no-shores'), null);
  assert.equal(ownAppImage({}, '/opt/No Shores/no-shores'), null);
});
